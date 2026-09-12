# 加油站班次交接地图

- 行业：石油
- 技术栈：Vue 3 + Vite + TypeScript + Element Plus + Leaflet + ECharts + Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`（产物在 `dist/`，可用 `npm run preview` 预览）

## 功能

- **班次地图**：Leaflet 地图按状态着色（待复核＝橙、已复核＝绿、有差异＝红）标注各班次；
  点击标记弹出加油站、班次日期、油品销量、现金收入、电子支付、当班总收入、状态与备注，
  弹窗内可直接做状态流转和移除。点击地图空白处可为新记录选点。
- **汇总图表**：ECharts 堆叠柱状图，按早/中/晚班 × 三种状态汇总，可切换
  记录数 / 油品销量 / 总收入三个指标，随筛选结果联动。
- **新增与校验**：Element Plus 表单校验（必填、名称 2～30 字、非负数值、备注 ≤200 字、
  必须在地图选点），错误就地标红并给出提示。
- **筛选**：按班次、状态、站名/备注关键词组合筛选，地图标记、图表、汇总卡片同步联动。
- **状态流转**：待复核 → 已复核 / 有差异；有差异 → 重新核对 / 复核通过；已复核 → 撤回复核。
- **移除**：移除前二次确认，取消不会删除数据。
- **数据存储**：全部保存在浏览器 `localStorage`（键 `gas-station-shift-handoff-v2`），
  首次访问自动写入 5 条北京示例数据；支持多标签页 storage 事件同步。
- **响应式**：桌面双栏布局；≤720px 切换为单栏、表格变卡片，支持手机触屏。

## 自动化核对

### 单元测试（无需浏览器，秒级回归）

```bash
npm test          # vitest run，跑 tests/ 下全部用例
npm run test:watch
```

共 37 个用例，覆盖：

- **状态流转**（`tests/status-flow.test.ts`）：三态流转规则、按钮文案配置完整性、
  班次常量、总收入与金额格式化；
- **汇总与筛选**（`tests/summary.test.ts`）：记录数/状态分布/销量/收入汇总、空数据、
  班次×状态组合筛选、关键词匹配站名与备注、重置筛选；
- **数据持久化**（`tests/persistence.test.ts`）：首次访问播种并写入、已有数据不覆盖、
  空数组、JSON 损坏回退、非数组返回空列表、清理旧 key、新增/流转/确认与取消移除的存储行为；
- **转义边界**（`tests/escape.test.ts`）：五个特殊字符、`&` 不被二次转义、
  `<img onerror>`/`<script>` 注入载荷转义后无节点、属性引号逃逸、null/数字等边界。

### 浏览器端到端核对

`verify.mjs` 使用 Playwright（Chromium）在桌面 1440×900 与手机 390×844 视口下核对
地图标记/弹窗、图表、新增校验、选点、筛选、状态流转、移除确认、localStorage 持久化与
无横向溢出，共 38 项断言。

`verify-xss.mjs` 是注入专项：植入站名/备注含 `<img onerror>`、`<script>`、引号的记录，
核对地图弹窗、列表、移除确认框均按纯文本显示、载荷不执行，且地图、图表、筛选、状态流转
与移除不受影响（19 项断言）。

## 一键复现（干净环境）

```bash
npm run e2e            # 等价于 bash scripts/e2e.sh
npm run e2e -- --clean # 先删除 node_modules 和 dist 再跑
```

脚本无需 root，从干净状态依次完成：npm 依赖（npmmirror 优先、失败回退官方源）→
下载匹配架构的 Chrome for Testing 到用户缓存目录 → 用 `apt-get download` 解压补齐
Chrome 缺失的系统库与中文字体 → 单元测试（vitest）→ 生产构建 → 启动 `vite preview`
→ 运行两套浏览器核对。
已下载的浏览器和 deb 缓存在 `~/.cache/gas-shift-e2e`，重复执行会复用；每个阶段失败都会
打印可读原因。可用环境变量：`NPM_REGISTRY`、`CHROME_VERSION`、`PORT`、`TOOLS_DIR`、
`SKIP_BROWSER_PREP=1` + `CHROME_BIN`（使用本机 Chrome）。
