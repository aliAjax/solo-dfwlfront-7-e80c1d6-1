/* 尖括号/引号注入专项核对：弹窗纯文本 + 地图/图表/筛选/状态流转/移除不受影响 */
import { chromium } from "playwright";

const CHROME = process.env.CHROME_BIN || "/home/node/chrome/chrome-linux-arm64/chrome";
const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";

const launchOpts = {
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-dbus"]
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const page = await ctx.newPage();

const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(e.message));
// 任何注入触发的 onerror 都会置位 window.__XSS
await page.addInitScript(() => {
  Object.defineProperty(window, "__XSS", {
    writable: true,
    configurable: true
  });
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// 通过 localStorage 直接植入含尖括号/引号/事件属性的恶意记录（等价于保存后刷新）
const EVIL_STATION = `<测试>站"b'"<b onmouseover="x">B</b><img src=x onerror="window.__XSS=1">`;
const EVIL_NOTES = `<script>window.__XSS=1</script><i>斜体</i>备注 & <tag> ' "`;
await page.evaluate(
  ({ s, n }) => {
    const raw = localStorage.getItem("gas-station-shift-handoff-v2");
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({
      id: "evil-1",
      station: s,
      shift: "中班",
      date: "2026-09-12",
      fuelSales: 666,
      cash: 111,
      digital: 222,
      status: "待复核",
      notes: n,
      lng: 116.5,
      lat: 39.95,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem("gas-station-shift-handoff-v2", JSON.stringify(list));
  },
  { s: EVIL_STATION, n: EVIL_NOTES }
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);

// 1. 标记数量不受影响（6 个）
const markerCount = await page.locator(".leaflet-marker-icon.shift-marker").count();
check("地图标记正常渲染（6 个）", markerCount === 6, `实际 ${markerCount}`);

// 2. 表格里站名是纯文本，含尖括号但没有生成 <b>/<img>
const evilRow = page.locator(".el-table__row").filter({ hasText: "测试" }).first();
const rowHasBold = await evilRow.locator("b, img, script").count();
check("表格未解析注入标签", rowHasBold === 0, `注入节点 ${rowHasBold} 个`);

// 3. 打开该记录弹窗
await page.locator(".leaflet-marker-icon.shift-marker").first().click();
await page.waitForSelector(".leaflet-popup .pop-card", { timeout: 5000 });
const pop = page.locator(".leaflet-popup .pop-card").first();

// 弹窗 strong 文本必须包含原始尖括号字符
const strongText = await pop.locator("strong").innerText();
check(
  "弹窗名称保留原始尖括号/引号文本",
  strongText.includes("<测试>站") && strongText.includes("<img src=x"),
  strongText.slice(0, 60)
);

// 4. 弹窗内不得出现注入产生的节点
const injected = await pop.evaluate(
  (el) => el.querySelectorAll("b, img, script, i, onmouseover, [onerror], [onmouseover]").length
);
check("弹窗内无注入节点/事件属性", injected === 0, `发现 ${injected} 个`);

// 5. 备注也是纯文本
const notesText = await pop.locator(".pop-notes").innerText();
check(
  "弹窗备注保留原始尖括号文本且无斜体节点",
  notesText.includes("<script>") && notesText.includes("<i>斜体</i>") && (await pop.locator(".pop-notes i").count()) === 0,
  notesText.slice(0, 50)
);

// 6. 数据数值仍正常
const popText = await pop.innerText();
check("弹窗数值字段正常", popText.includes("666 L") && popText.includes("¥111") && popText.includes("¥222") && popText.includes("¥333"));

// 7. 状态徽章与操作按钮仍在（结构未乱）
const badge = await pop.locator(".pop-status").innerText();
check("状态徽章仍为待复核", badge.trim() === "待复核", badge);
const btns = await pop.locator(".pop-btn").allInnerTexts();
check("流转按钮完整（复核通过/标记差异/移除）", btns.includes("复核通过") && btns.includes("标记差异") && btns.includes("移除"), JSON.stringify(btns));

// 8. 弹窗内做状态流转：待复核 → 有差异
await pop.locator(".pop-btn", { hasText: "标记差异" }).click();
await page.waitForTimeout(500);
const badge2 = await pop.locator(".pop-status").innerText();
check("注入记录状态流转正常：→有差异", badge2.trim() === "有差异", badge2);
await pop.locator(".pop-btn", { hasText: "重新核对" }).click();
await page.waitForTimeout(500);
const badge3 = await pop.locator(".pop-status").innerText();
check("注入记录状态流转正常：→待复核", badge3.trim() === "待复核", badge3);

await page.screenshot({ path: "/workspace/screenshots/08-xss-popup.png" });
await page.keyboard.press("Escape");

// 9. 图表不受影响（早/中/晚班仍三个类目，中班计数含注入记录 = 2）
const chartTxt = await page.locator(".chart-panel").innerText();
check("图表仍正常渲染三个班次", ["早班", "中班", "晚班"].every((s) => chartTxt.includes(s)));

// 10. 筛选：关键词用注入片段 "<img" 搜索仍能命中且不报错
await page.locator(".list-side .filters input").last().fill("<img");
await page.waitForTimeout(400);
const hitRows = await page.locator(".el-table__row").count();
check("关键词按尖括号片段筛选可命中 1 条", hitRows === 1, `实际 ${hitRows} 条`);
const hitMarkers = await page.locator(".leaflet-marker-icon.shift-marker").count();
check("筛选后地图仅显示该标记", hitMarkers === 1, `实际 ${hitMarkers} 个`);
await page.locator(".list-side .filters input").last().fill("");
await page.waitForTimeout(300);

// 11. 移除确认框里的站名也是纯文本，不解析标签
await page.locator(".el-table__row").first().getByRole("button", { name: "移除" }).click();
await page.waitForSelector(".el-message-box", { timeout: 5000 });
const boxText = await page.locator(".el-message-box__message").innerText();
check("移除确认框站名按纯文本显示", boxText.includes("<测试>站") && boxText.includes("<img"), boxText.slice(0, 70));
const boxInjected = await page.locator(".el-message-box").evaluate((el) => el.querySelectorAll("b, img, script").length);
check("移除确认框无注入节点", boxInjected === 0);
await page.getByRole("button", { name: "确认移除" }).click();
await page.waitForTimeout(600);
const leftMarkers = await page.locator(".leaflet-marker-icon.shift-marker").count();
check("注入记录可正常移除（回到 5 个标记）", leftMarkers === 5, `实际 ${leftMarkers}`);
const leftRows = await page.locator(".el-table__row").count();
check("列表同步移除（5 条）", leftRows === 5, `实际 ${leftRows}`);

// 12. 全程无 XSS 触发、无 JS 异常
const xssFired = await page.evaluate(() => !!window.__XSS);
check("注入载荷未执行（onerror/script 均未触发）", xssFired === false);
check("全程无未捕获 JS 异常", jsErrors.length === 0, jsErrors.join(" | "));

await page.screenshot({ path: "/workspace/screenshots/09-after-remove.png" });
await ctx.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  for (const f of failed) console.log("FAILED:", f.name, f.detail);
  process.exit(1);
}
