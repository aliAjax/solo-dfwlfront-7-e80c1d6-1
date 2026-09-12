/* 浏览器端功能核对：桌面 + 手机视口 */
import { chromium } from "playwright";
import fs from "node:fs";

const CHROME = "/home/node/chrome/chrome-linux-arm64/chrome";
const BASE = "http://127.0.0.1:4173";
const SHOT_DIR = "/workspace/screenshots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const launchOpts = {
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-dbus"]
};

/* ---------------- 桌面 ---------------- */
const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1200); // 等瓦片/动画

// 1. 初始地图标记
const markerCount = await page.locator(".leaflet-marker-icon.shift-marker").count();
check("地图渲染并标出 5 个班次标记", markerCount === 5, `实际 ${markerCount} 个`);

await page.screenshot({ path: `${SHOT_DIR}/01-desktop-map.png` });

// 2. 点开 marker 显示 popup
await page.locator(".leaflet-marker-icon.shift-marker").first().click();
await page.waitForSelector(".leaflet-popup .pop-card", { timeout: 5000 });
const popupText = await page.locator(".leaflet-popup .pop-card").innerText();
check(
  "popup 显示销量/现金/电子支付/状态/备注",
  ["油品销量", "现金收入", "电子支付", "当班总收入", "待复核|已复核|有差异", "账实一致|等待站长确认|油枪|凭证|客流"].every(
    (p) => new RegExp(p).test(popupText)
  ),
  popupText.replace(/\n/g, " ").slice(0, 120)
);
await page.screenshot({ path: `${SHOT_DIR}/02-popup.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 3. 图表初始渲染（记录数，早班/中班/晚班）
await page.waitForSelector(".chart-canvas svg", { timeout: 5000 });
const svgBars0 = await page.locator(".chart-canvas svg path").count();
check("图表 SVG 渲染出柱条", svgBars0 > 0, `${svgBars0} 个 path`);
const chartText0 = await page.locator(".chart-panel").innerText();
check("图表含早班/中班/晚班三个类目", ["早班", "中班", "晚班"].every((s) => chartText0.includes(s)));
await page.screenshot({ path: `${SHOT_DIR}/03-chart-count.png` });

// 4. 切换图表指标：油品销量
await page.locator(".el-radio-button", { hasText: "油品销量" }).click();
await page.waitForTimeout(500);
const chartText1 = await page.locator(".chart-panel").innerText();
check("图表可切换到油品销量指标", /单位：L/.test(chartText1));
await page.screenshot({ path: `${SHOT_DIR}/04-chart-fuel.png` });
await page.locator(".el-radio-button", { hasText: "记录数" }).first().click();
await page.waitForTimeout(300);

// 5. 新增表单校验
await page.getByPlaceholder("例如：中石化朝阳加油站").fill("测"); // 少于 2 字
await page.getByRole("button", { name: "保存交接记录" }).click();
await page.waitForTimeout(600);
const errName = await page.locator(".el-form-item__error").allInnerTexts();
check("名称过短给出错误提示", errName.some((t) => t.includes("2～30")), JSON.stringify(errName));

await page.getByPlaceholder("例如：中石化朝阳加油站").fill("自动化测试站");
// 清空销量触发必填
const fuelInput = page.locator(".el-form-item").filter({ hasText: "油品销量" }).locator("input").first();
await fuelInput.fill("");
await page.locator(".el-select").filter({ hasText: "请选择班次" }).click();
await page.getByRole("option", { name: "晚班" }).click();
await page.getByRole("button", { name: "保存交接记录" }).click();
await page.waitForTimeout(600);
const errs2 = await page.locator(".el-form-item__error").allInnerTexts();
check("数值为空给出必填提示", errs2.some((t) => t.includes("请输入数值")), JSON.stringify(errs2));

// 未选位置直接提交（填好其它项）
await fuelInput.fill("1200");
await page.locator(".el-form-item").filter({ hasText: "现金收入" }).locator("input").first().fill("3000");
await page.locator(".el-form-item").filter({ hasText: "电子支付" }).locator("input").first().fill("8800");
await page.getByRole("button", { name: "保存交接记录" }).click();
await page.waitForTimeout(600);
const warnMsg = await page.locator(".el-message").allInnerTexts();
check("未在地图选点给出提示", warnMsg.some((t) => t.includes("地图")), JSON.stringify(warnMsg));

// 6. 地图选点（draft marker）——等顶部消息提示消失，避免遮挡点击
await page.locator(".el-message").first().waitFor({ state: "detached", timeout: 6000 }).catch(() => {});
await page.locator(".map-container").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
const mapBox = await page.locator(".map-container").boundingBox();
await page.mouse.click(mapBox.x + mapBox.width * 0.88, mapBox.y + mapBox.height * 0.68);
await page.waitForTimeout(400);
const draftVisible = await page.locator(".shift-pin--draft").count();
check("点击地图出现待保存标记", draftVisible >= 1);
const locBoxText = await page.locator(".location-box").innerText();
check("表单回填经纬度", /经度 [\d.]+，纬度 [\d.]+/.test(locBoxText), locBoxText.replace(/\n/g, " "));

// 7. 提交成功
await page.getByRole("button", { name: "保存交接记录" }).click();
await page.waitForTimeout(800);
const successMsg = await page.locator(".el-message").allInnerTexts();
check("保存成功提示", successMsg.some((t) => t.includes("已新增")), JSON.stringify(successMsg));
const rowsAfterAdd = await page.locator(".el-table__row").count();
check("列表新增一条记录（共 6 条）", rowsAfterAdd === 6, `实际 ${rowsAfterAdd} 条`);
const markersAfterAdd = await page.locator(".leaflet-marker-icon.shift-marker").count();
check("地图新增标记（共 6 个）", markersAfterAdd === 6, `实际 ${markersAfterAdd} 个`);

// 8. 筛选：班次 = 晚班（种子 2 条 + 新增 1 条 = 3）
await page.locator(".list-side .filters .el-select").first().click();
await page.getByRole("option", { name: "晚班" }).click();
await page.waitForTimeout(500);
const nightRows = await page.locator(".el-table__row").count();
check("班次筛选：晚班 3 条", nightRows === 3, `实际 ${nightRows} 条`);
const nightMarkers = await page.locator(".leaflet-marker-icon.shift-marker").count();
check("地图随筛选更新为 3 个标记", nightMarkers === 3, `实际 ${nightMarkers} 个`);

// 状态筛选：在晚班里只看待复核（种子石景山 + 新测试站 = 2）
await page.locator(".list-side .filters .el-select").nth(1).click();
await page.getByRole("option", { name: "待复核" }).click();
await page.waitForTimeout(500);
const pendingRows = await page.locator(".el-table__row").count();
check("状态筛选：晚班∩待复核 2 条", pendingRows === 2, `实际 ${pendingRows} 条`);

// 关键词
await page.locator(".list-side .filters .el-select").nth(1).click();
await page.getByRole("option", { name: "全部状态" }).click();
await page.locator(".list-side .filters input").last().fill("自动化");
await page.waitForTimeout(400);
const kwRows = await page.locator(".el-table__row").count();
check("关键词筛选：自动化测试站 1 条", kwRows === 1, `实际 ${kwRows} 条`);
await page.locator(".list-side .filters input").last().fill("");
await page.locator(".list-side .filters .el-select").first().click();
await page.getByRole("option", { name: "全部班次" }).click();
await page.waitForTimeout(400);

// 9. 状态流转（在表格里对测试站点“复核通过”）
const targetRow = page.locator(".el-table__row").filter({ hasText: "自动化测试站" });
await targetRow.getByRole("button", { name: "复核通过" }).click();
await page.waitForTimeout(500);
const rowText = await targetRow.innerText();
check("表格状态流转：待复核→已复核", rowText.includes("已复核"), rowText.replace(/\n/g, " ").slice(0, 80));

// 10. popup 内状态流转：先定位 marker 再点“标记差异”
await page.locator(".leaflet-marker-icon.shift-marker").last().click();
await page.waitForSelector(".leaflet-popup .pop-card", { timeout: 5000 });
const popBefore = await page.locator(".leaflet-popup .pop-card").innerText();
if (!popBefore.includes("自动化测试站")) {
  // 逐个打开 marker 找到测试站
  const total = await page.locator(".leaflet-marker-icon.shift-marker").count();
  for (let i = 0; i < total; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.locator(".leaflet-marker-icon.shift-marker").nth(i).click();
    await page.waitForTimeout(400);
    const t = await page.locator(".leaflet-popup .pop-card").innerText();
    if (t.includes("自动化测试站")) break;
  }
}
const popText2 = await page.locator(".leaflet-popup .pop-card").innerText();
check("已复核状态 popup 提供“撤回复核”", popText2.includes("撤回复核"));
await page.locator(".pop-card .pop-btn", { hasText: "撤回复核" }).click();
await page.waitForTimeout(500);
const popText3 = await page.locator(".leaflet-popup .pop-card").innerText();
check("popup 状态流转：已复核→待复核", popText3.includes("待复核") && popText3.includes("标记差异"));
await page.locator(".pop-card .pop-btn", { hasText: "标记差异" }).click();
await page.waitForTimeout(500);
const popText4 = await page.locator(".leaflet-popup .pop-card").innerText();
check("popup 状态流转：待复核→有差异", popText4.includes("有差异") && popText4.includes("重新核对"));
await page.screenshot({ path: `${SHOT_DIR}/05-popup-disputed.png` });
await page.keyboard.press("Escape");

// 11. 移除确认弹窗：取消不删除
const targetRow2 = page.locator(".el-table__row").filter({ hasText: "自动化测试站" });
await targetRow2.getByRole("button", { name: "移除" }).click();
await page.waitForSelector(".el-message-box", { timeout: 5000 });
const dialogText = await page.locator(".el-message-box").innerText();
check("移除前弹出确认框", dialogText.includes("确认移除"));
await page.getByRole("button", { name: "取消" }).click();
await page.waitForTimeout(400);
const stillThere = await page.locator(".el-table__row").filter({ hasText: "自动化测试站" }).count();
check("取消移除后记录仍在", stillThere === 1);

// 12. 确认移除
await targetRow2.getByRole("button", { name: "移除" }).click();
await page.waitForSelector(".el-message-box", { timeout: 5000 });
await page.getByRole("button", { name: "确认移除" }).click();
await page.waitForTimeout(700);
const gone = await page.locator(".el-table__row").filter({ hasText: "自动化测试站" }).count();
check("确认移除后记录消失", gone === 0);
const markersBack = await page.locator(".leaflet-marker-icon.shift-marker").count();
check("地图标记同步移除（回到 5 个）", markersBack === 5, `实际 ${markersBack} 个`);

// 13. localStorage 持久化
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gas-station-shift-handoff-v2") || "[]"));
check("localStorage 已持久化且不含已删除记录", Array.isArray(stored) && stored.length === 5 && !stored.some((r) => r.station.includes("自动化")));

// 14. 刷新后数据仍在
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const rowsAfterReload = await page.locator(".el-table__row").count();
check("刷新后数据保持 5 条", rowsAfterReload === 5, `实际 ${rowsAfterReload} 条`);

// 15. 地图标记颜色随状态（有差异为红）
const redPins = await page.evaluate(() =>
  [...document.querySelectorAll(".shift-pin")].filter((el) =>
    getComputedStyle(el).getPropertyValue("--pin-color").trim() === "#f56c6c"
  ).length
);
check("有差异标记为红色", redPins === 1, `红色标记 ${redPins} 个`);

// 汇总卡片
const statsText = await page.locator(".stat-row").innerText();
check("汇总卡片显示销量与总收入", /油品销量[\s\S]*[\d,]+/.test(statsText) && /当班总收入[\s\S]*¥/.test(statsText));

await page.screenshot({ path: `${SHOT_DIR}/06-desktop-final.png` });

await ctx.close();
await browser.close();

/* ---------------- 手机 ---------------- */
const mobile = await chromium.launch(launchOpts);
const mctx = await mobile.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN"
});
const mpage = await mctx.newPage();
const mErrors = [];
mpage.on("pageerror", (err) => mErrors.push(err.message));
await mpage.goto(BASE, { waitUntil: "networkidle" });
await mpage.waitForTimeout(1200);

const mMobileMarkers = await mpage.locator(".leaflet-marker-icon.shift-marker").count();
check("[手机] 地图标记正常显示", mMobileMarkers === 5, `${mMobileMarkers} 个`);

const tableHidden = await mpage.locator(".record-table").evaluate((el) => getComputedStyle(el).display === "none");
const cardsVisible = await mpage.locator(".record-cards").first().isVisible();
check("[手机] 表格隐藏、卡片列表显示", tableHidden && cardsVisible);

const cardCount = await mpage.locator(".record-card").count();
check("[手机] 卡片 5 张", cardCount === 5, `实际 ${cardCount} 张`);

// 手机端 popup + 状态流转
await mpage.locator(".leaflet-marker-icon.shift-marker").first().click();
await mpage.waitForSelector(".leaflet-popup .pop-card", { timeout: 5000 });
const mPopup = await mpage.locator(".leaflet-popup .pop-card").innerText();
check("[手机] popup 信息完整", mPopup.includes("油品销量") && mPopup.includes("电子支付"));
await mpage.keyboard.press("Escape");

// 手机端筛选
await mpage.locator(".list-side .filters .el-select").first().click();
await mpage.getByRole("option", { name: "早班" }).click();
await mpage.waitForTimeout(500);
const morningCards = await mpage.locator(".record-card").count();
check("[手机] 班次筛选生效：早班 2 张", morningCards === 2, `实际 ${morningCards} 张`);

// 手机端移除
await mpage.locator(".record-card").first().getByRole("button", { name: "移除" }).click();
await mpage.waitForSelector(".el-message-box", { timeout: 5000 });
await mpage.getByRole("button", { name: "确认移除" }).click();
await mpage.waitForTimeout(600);
const afterRemoveCards = await mpage.locator(".record-card").count();
check("[手机] 移除后剩 1 张", afterRemoveCards === 1, `实际 ${afterRemoveCards} 张`);

await mpage.screenshot({ path: `${SHOT_DIR}/07-mobile.png`, fullPage: false });

// 手机端水平溢出检查
const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("[手机] 无横向溢出", overflow <= 2, `溢出 ${overflow}px`);

await mctx.close();
await mobile.close();

/* ---------------- 控制台错误 ---------------- */
const realErrors = consoleErrors.filter((e) => !/Failed to connect to the bus|dbus|DevTools|Autofail|cookies/i.test(e));
check("桌面端无 JS 控制台错误", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
check("手机端无未捕获异常", mErrors.length === 0, mErrors.join(" | "));

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  for (const f of failed) console.log("FAILED:", f.name, f.detail);
  process.exit(1);
}
