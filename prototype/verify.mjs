import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:\\Users\\DELL\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright");

const results = [];
const consoleErrors = [];
let browser;

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

async function main() {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const entry = pathToFileURL(path.resolve("prototype/index.html")).href;
  await page.goto(entry, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__PROTOTYPE__));
  const device = page.locator(".device-shell");

  const frame = () => page.evaluate(() => window.__PROTOTYPE__.state.currentFrame);
  const go = async (id) => {
    await page.evaluate((target) => window.__PROTOTYPE__.goToFrame(target), id);
    await page.waitForFunction((target) => window.__PROTOTYPE__.state.currentFrame === target, id);
    await page.waitForFunction((target) => Boolean(document.querySelector(`[data-frame-view="${target}"], [data-overlay-frame="${target}"]`)), id);
  };
  const clickButton = async (name) => {
    const locator = device.getByRole("button", { name, exact: true });
    const count = await locator.count();
    record(`按钮唯一：${name}`, count === 1, `实际 ${count}`);
    await locator.click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const assertFrame = async (id, label) => {
    await page.waitForFunction((target) => Boolean(document.querySelector(`[data-frame-view="${target}"], [data-overlay-frame="${target}"]`)), id);
    record(label, (await frame()) === id, `当前 Frame ${await frame()}`);
  };

  await go("01");
  await clickButton("添加几个食材");
  await assertFrame("02", "流程 1：进入快速添加");
  await device.getByLabel("食材名称").fill("番茄");
  await device.getByRole("button", { name: /可能是：西红柿/ }).click();
  await assertFrame("03", "流程 1：进入映射确认");
  await clickButton("使用“西红柿”");
  await assertFrame("04", "流程 1：食材已批次保存");
  await clickButton("用这些食材推荐");
  await assertFrame("05", "流程 1：进入安全确认");
  await device.getByRole("button", { name: /暂无限制/ }).click();
  await clickButton("确认并继续");
  await assertFrame("07", "流程 1：进入默认条件");
  await clickButton("开始抽取");
  await assertFrame("08", "流程 1：进入盲盒");
  await clickButton("跳过并看结果");
  await assertFrame("09", "流程 1：获得满足结果");
  record("流程 1：推荐理由可见", await device.getByText("优先用掉 1 批临期西红柿", { exact: true }).isVisible());

  await go("15");
  await clickButton("今天吃什么");
  await clickButton("跳过并看结果");
  await assertFrame("09", "流程 2：返回用户一次主操作得到结果");

  await go("16");
  await clickButton("确认青菜余量");
  await assertFrame("17", "流程 3：可能满足依据 Sheet");
  await clickButton("确认库存信息");
  await assertFrame("16", "流程 3：返回可能满足结果");
  await go("18");
  await clickButton("补充鸡胸肉数量");
  await device.getByLabel("数量").fill("220");
  await clickButton("保存并重新计算");
  await assertFrame("08", "流程 3：未知修正后重新抽取");
  await clickButton("跳过并看结果");
  await assertFrame("09", "流程 3：重新计算完成");

  await go("07");
  await device.locator(".sheet").getByRole("button", { name: /允许补买少量/ }).click();
  await assertFrame("20", "流程 3/4：进入补买条件");
  await clickButton("开始抽取");
  await clickButton("跳过并看结果");
  await assertFrame("21", "流程 3/4：得到不足补买结果");
  await clickButton("查看缺少项");
  await assertFrame("22", "流程 3/4：查看缺少项明细");
  record("补买数值链", await device.getByText("¥3.5", { exact: true }).count() >= 1 && await device.getByText("¥10", { exact: false }).count() >= 1);

  await go("09");
  await clickButton("查看菜谱");
  await assertFrame("10", "流程 4：进入菜谱");
  await clickButton("我做了这顿饭");
  await assertFrame("11", "流程 4：进入建议扣减预览");
  const tomatoRow = device.locator(".list-row").filter({ hasText: "西红柿 T-01" });
  record("扣减修改入口唯一", await tomatoRow.getByRole("button", { name: "修改", exact: true }).count() === 1);
  await tomatoRow.getByRole("button", { name: "修改", exact: true }).click();
  await assertFrame("12", "流程 4：进入扣减编辑");
  await device.getByLabel("T-02 普通批次（最多 220 g）").fill("100");
  await clickButton("保存调整");
  await assertFrame("13", "流程 4：返回调整后预览");
  record("调整后数值可见", await device.getByText("西红柿 280 g · 鸡蛋 2 个 · 大米 90 g", { exact: true }).isVisible());
  await clickButton("确认更新库存");
  await page.waitForFunction(() => window.__PROTOTYPE__.state.currentFrame === "14");
  await assertFrame("14", "流程 4：原子更新成功");
  record("成功余量闭环", await device.getByText(/120 g/).count() >= 1 && await device.getByText(/110 g/).count() >= 1);
  await clickButton("完成");
  await assertFrame("15", "流程 4：返回更新后首页");

  await go("23");
  await clickButton("允许少量补买");
  await clickButton("开始抽取");
  await clickButton("跳过并看结果");
  await assertFrame("21", "流程 5：无结果后恢复到补买结果");

  await go("24");
  record("失败页保留编辑", await device.getByText("西红柿 280 g · 鸡蛋 2 个 · 大米 90 g", { exact: true }).isVisible());
  record("失败页保留制作前库存", await device.getByText("西红柿 400 g · 鸡蛋 4 个 · 大米 200 g", { exact: true }).isVisible());
  await clickButton("重试更新");
  await assertFrame("13", "流程 5：失败重试回到调整后预览");

  const reduceToggle = page.getByLabel("减少动态效果");
  await reduceToggle.check();
  await go("15");
  const reducedStart = Date.now();
  await clickButton("今天吃什么");
  await page.waitForFunction(() => window.__PROTOTYPE__.state.currentFrame === "09");
  record("Reduce Motion 静态路径", Date.now() - reducedStart < 600, `耗时 ${Date.now() - reducedStart}ms`);

  await go("01");
  await clickButton("添加几个食材");
  await page.waitForTimeout(50);
  record("Sheet 打开后焦点进入内部", await page.evaluate(() => Boolean(document.activeElement?.closest?.(".sheet"))), await page.evaluate(() => document.activeElement?.outerHTML || "无焦点"));
  await page.keyboard.press("Escape");
  await assertFrame("01", "Escape 关闭无修改 Sheet");
  await page.waitForFunction(() => document.activeElement?.dataset?.focusKey === "quick-add");
  record("Sheet 关闭后焦点回触发控件", await page.evaluate(() => document.activeElement?.dataset?.focusKey === "quick-add"));

  await go("11");
  const unsavedRow = device.locator(".list-row").filter({ hasText: "西红柿 T-01" });
  await unsavedRow.getByRole("button", { name: "修改", exact: true }).click();
  await assertFrame("12", "未保存保护：进入扣减编辑");
  await device.getByLabel("T-02 普通批次（最多 220 g）").fill("99");
  await page.keyboard.press("Escape");
  record("未保存修改不会静默关闭", (await frame()) === "12" && await device.getByRole("alertdialog").isVisible());
  await clickButton("继续编辑");
  await device.getByLabel("T-02 普通批次（最多 220 g）").fill("100");
  await clickButton("保存调整");
  await assertFrame("13", "未保存保护：继续编辑后可正常保存");

  await go("15");
  await device.locator('[data-focus-key="conditions"]').click();
  await assertFrame("07", "浏览器历史：从首页进入条件 Sheet");
  await page.goBack();
  await page.waitForFunction(() => window.__PROTOTYPE__.state.currentFrame === "15");
  await assertFrame("15", "浏览器后退与视觉返回一致");

  const frameMap = await page.evaluate(() => window.__PROTOTYPE__.FRAMES.map(({ id, name, pageId, type }) => ({ id, name, pageId, type })));
  const prototypeMeta = await page.evaluate(() => ({ core: window.__PROTOTYPE__.CORE_PAGE_IDS, supporting: window.__PROTOTYPE__.SUPPORTING_PAGE_IDS, deferred: window.__PROTOTYPE__.DEFERRED_PAGE_IDS, tasks: window.__PROTOTYPE__.TEST_TASKS, questions: window.__PROTOTYPE__.VALIDATION_QUESTIONS, components: window.__PROTOTYPE__.COMPONENTS }));
  record("24 Frame 映射", frameMap.length === 24 && new Set(frameMap.map((item) => item.name)).size === 24);
  record("14 独立 + 10 Overlay", frameMap.filter((item) => item.type.includes("Bottom Sheet")).length === 10 && frameMap.filter((item) => !item.type.includes("Bottom Sheet")).length === 14);
  record("11 Core + 5 Supporting + 38 Deferred", prototypeMeta.core.length === 11 && prototypeMeta.supporting.length === 5 && prototypeMeta.deferred.length === 38);
  record("Deferred 未被实现为 Frame", frameMap.every((item) => !prototypeMeta.deferred.includes(item.pageId)));
  record("Component Inventory 已登记", prototypeMeta.components.length === 26);
  record("7 项测试任务与 14 个问题可从主持人区查看", prototypeMeta.tasks.length === 7 && prototypeMeta.questions.length === 14);

  const layoutFailures = [];
  for (const item of frameMap) {
    await page.evaluate((target) => window.__PROTOTYPE__.goToFrame(target), item.id);
    const metrics = await page.evaluate(() => {
      const root = document.querySelector("#app");
      const smallButtons = [...root.querySelectorAll("button")].filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return style.display !== "none" && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      }).map((button) => ({ text: button.textContent.trim().slice(0, 30), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }));
      return { overflow: root.scrollWidth > root.clientWidth + 1, smallButtons };
    });
    if (metrics.overflow || metrics.smallButtons.length) layoutFailures.push({ frame: item.id, ...metrics });
  }
  record("24 Frame 无横向溢出且按钮触控区 ≥44", layoutFailures.length === 0, JSON.stringify(layoutFailures));
  record("运行时无控制台错误", consoleErrors.length === 0, consoleErrors.join(" | "));

  const outDir = path.resolve("output/playwright");
  await mkdir(outDir, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await go("01");
  await page.screenshot({ path: path.join(outDir, "frame-01-mobile.png") });
  await go("09");
  await page.screenshot({ path: path.join(outDir, "frame-09-result-mobile.png") });
  await go("12");
  await page.screenshot({ path: path.join(outDir, "frame-12-sheet-mobile.png") });
  await page.setViewportSize({ width: 1365, height: 900 });
  await go("15");
  await page.screenshot({ path: path.join(outDir, "frame-15-desktop.png") });

  console.log(JSON.stringify({ passed: results.filter((item) => item.passed).length, total: results.length, results, screenshots: ["frame-01-mobile.png", "frame-09-result-mobile.png", "frame-12-sheet-mobile.png", "frame-15-desktop.png"] }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
