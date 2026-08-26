import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(".");
const mime = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"]]);

function serve() {
  return createServer(async (request, response) => {
    try {
      const urlPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const target = path.resolve(root, urlPath === "/" ? "index.html" : `.${urlPath}`);
      if (!target.startsWith(root) || !(await stat(target)).isFile()) throw new Error("not found");
      response.writeHead(200, { "content-type": mime.get(path.extname(target)) || "application/octet-stream" });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

const results = [];
const record = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${results.length}: ${name}`);
};

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ channel: "chrome", headless: true }));

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });

  const bodyText = await page.locator("body").innerText();
  record("公开界面无原型调试信息", !/Frame ID|测试主持人|验证问题|Prototype Deferred/.test(bodyText));
  record("首页主操作可见", await page.getByRole("button", { name: "今天吃什么", exact: true }).isVisible());
  await page.getByRole("button", { name: "今天吃什么", exact: true }).click();
  record("推荐条件 Sheet 可操作", await page.getByRole("dialog").isVisible());
  await page.getByRole("button", { name: "开始抽取", exact: true }).click();
  record("进入盲盒", page.url().endsWith("#/draw"));
  await page.getByRole("button", { name: "跳过并看结果", exact: true }).click();
  record("进入推荐结果", page.url().endsWith("#/result"));
  await page.getByRole("button", { name: "查看菜谱", exact: true }).click();
  record("进入菜谱", page.url().endsWith("#/recipe"));
  await page.getByRole("button", { name: "我做了这顿饭", exact: true }).click();
  record("进入扣减预览", page.url().endsWith("#/deduction"));
  await page.getByRole("button", { name: "确认更新库存", exact: true }).click();
  record("进入制作完成", page.url().endsWith("#/success"));
  await page.getByRole("button", { name: "回到今天", exact: true }).click();
  await page.getByRole("button", { name: "库存", exact: true }).click();
  record("库存入口可用", page.url().endsWith("#/inventory"));
  await page.evaluate(() => window.__MVP__.store.update((draft) => {
    draft.inventory.push({ id: "persistence-check", name: "持久化豆腐", category: "豆制品", batches: [{ id: "PC-01", quantity: 200, unit: "g", precision: "exact", expiresOn: null, useSoon: false }] });
  }));
  await page.reload({ waitUntil: "load" });
  record("LocalStorage 刷新持久化", await page.getByText("持久化豆腐", { exact: true }).isVisible());
  await page.getByRole("button", { name: "恢复演示数据", exact: true }).click();
  record("演示数据可恢复", await page.getByRole("heading", { name: "6 类食材", exact: true }).isVisible());

  await page.evaluate(() => window.__MVP__.recommend(() => 0));
  await page.getByRole("button", { name: "跳过并看结果", exact: true }).click();
  await page.getByRole("button", { name: "查看菜谱", exact: true }).click();
  const recipeBefore = await page.evaluate(() => window.__MVP__.getData().inventory);
  record("查看菜谱不会扣库存", recipeBefore.find((item) => item.id === "egg").batches[0].quantity === 4);
  await page.getByRole("button", { name: "我做了这顿饭", exact: true }).click();
  await page.waitForURL(/#\/deduction$/);
  await page.getByText("确认后才更新库存", { exact: true }).waitFor();
  const previewReady = page.url().endsWith("#/deduction") && await page.getByText("确认后才更新库存", { exact: true }).isVisible();
  record("制作确认进入可编辑预览", previewReady, previewReady ? "" : `${page.url()} | ${await page.locator("body").innerText()}`);
  const eggDeduction = page.locator(".deduction-row").filter({ hasText: "鸡蛋" });
  await eggDeduction.locator("input[type='number']").fill("1");
  const beforeFailure = await page.evaluate(() => JSON.stringify(window.__MVP__.getData().inventory));
  await page.evaluate(() => window.__MVP__.commitDeduction(true));
  record("模拟失败进入保护页", page.url().endsWith("#/deduction-failure") && await page.getByText("库存没有变化", { exact: true }).isVisible());
  record("失败时库存零变化", await page.evaluate((before) => JSON.stringify(window.__MVP__.getData().inventory) === before, beforeFailure));
  record("失败后编辑仍保留", await page.evaluate(() => String(window.__MVP__.getPendingDeduction().items.find((item) => item.name === "鸡蛋").amount) === "1"));
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  await page.getByRole("button", { name: "确认更新库存", exact: true }).click();
  record("原子扣减成功", await page.evaluate(() => {
    const current = window.__MVP__.getData();
    return current.inventory.find((item) => item.id === "tomato").batches.length === 1
      && current.inventory.find((item) => item.id === "egg").batches[0].quantity === 3
      && current.inventory.find((item) => item.id === "rice").batches[0].quantity === 120
      && Boolean(current.session.lastCompletedAt);
  }));
  await page.getByRole("button", { name: "回到今天", exact: true }).click();
  await page.waitForURL(/#\/home$/);
  await page.getByText(/最近完成：番茄炒蛋配米饭/).waitFor();
  record("更新后首页显示完成反馈", await page.getByText(/最近完成：番茄炒蛋配米饭/).isVisible());
  await page.getByRole("button", { name: "库存", exact: true }).click();
  await page.waitForURL(/#\/inventory$/);
  await page.getByRole("heading", { name: "6 类食材", exact: true }).waitFor();
  record("首页与库存使用同一更新数据", await page.locator(".list-row").filter({ hasText: "鸡蛋" }).getByText(/3 个/).isVisible());
  await page.getByRole("button", { name: "恢复演示数据", exact: true }).click();

  await page.getByRole("button", { name: "添加食材", exact: true }).click();
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.(".sheet")));
  record("添加 Sheet 打开后焦点进入", await page.evaluate(() => Boolean(document.activeElement?.closest?.(".sheet"))));
  await page.getByLabel(/食材名称/).fill("豆腐");
  await page.getByRole("button", { name: "保存食材", exact: true }).click();
  record("只填名称可添加", await page.getByText("豆腐", { exact: true }).isVisible());

  await page.getByRole("button", { name: "添加食材", exact: true }).click();
  await page.getByLabel(/食材名称/).fill("豆腐");
  await page.getByLabel("数量", { exact: true }).fill("200");
  await page.getByRole("button", { name: "保存食材", exact: true }).click();
  record("同名食材保存为第二批次", await page.evaluate(() => window.__MVP__.getData().inventory.find((item) => item.name === "豆腐")?.batches.length === 2));

  const tofuRow = page.locator(".list-row").filter({ hasText: "豆腐" });
  await tofuRow.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("数量", { exact: true }).fill("150");
  await page.getByRole("button", { name: "保存食材", exact: true }).click();
  record("库存数量可修改", await tofuRow.getByText(/350 g/).isVisible());

  await page.getByRole("button", { name: "添加食材", exact: true }).click();
  await page.getByLabel(/食材名称/).fill("未保存测试");
  await page.keyboard.press("Escape");
  record("未保存库存编辑不会静默关闭", await page.getByRole("alertdialog").isVisible());
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await page.getByRole("button", { name: "保存食材", exact: true }).click();

  await page.getByRole("button", { name: "添加食材", exact: true }).click();
  await page.getByLabel(/食材名称/).fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "保存食材", exact: true }).click();
  const escapedRow = page.locator(".list-row").filter({ hasText: "<img src=x onerror=alert(1)>" });
  record("用户食材名称按文本安全呈现", await escapedRow.isVisible() && await escapedRow.locator("img").count() === 0);

  await page.getByRole("button", { name: "今天", exact: true }).click();
  await page.getByRole("button", { name: "今天吃什么", exact: true }).click();
  await page.getByRole("button", { name: "2 人", exact: true }).click();
  await page.getByText("更多条件", { exact: true }).click();
  await page.getByLabel("菜系").selectOption("chinese");
  await page.getByRole("button", { name: "开始抽取", exact: true }).click();
  record("人数和基础条件保存", await page.evaluate(() => {
    const conditions = window.__MVP__.getData().conditions;
    return conditions.diners === 2 && conditions.cuisine === "chinese";
  }));
  await page.reload({ waitUntil: "load" });
  record("人数和基础条件刷新后保留", await page.evaluate(() => window.__MVP__.getData().conditions.diners === 2 && window.__MVP__.getData().conditions.cuisine === "chinese"));
  await page.evaluate(() => window.__MVP__.store.update((draft) => {
    draft.inventory = [];
    draft.pantry = [];
    draft.conditions = { ...draft.conditions, diners: 1, cuisine: "western", format: "regular", maxMinutes: 20, stockMode: "strict" };
  }));
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => window.__MVP__.recommend(() => .5));
  await page.waitForURL(/#\/no-result$/);
  record("无结果进入明确恢复页", await page.getByRole("heading", { name: "换一个条件，再抽一次。", exact: true }).isVisible());
  await page.getByRole("button", { name: "调整推荐条件", exact: true }).click();
  record("无结果可返回调整条件", await page.getByRole("dialog", { name: "推荐条件" }).isVisible());
  record("运行时无控制台错误", errors.length === 0, errors.join(" | "));
  console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
