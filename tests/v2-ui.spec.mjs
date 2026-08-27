import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(".");
const storageKey = "what-to-eat.portfolio.v1";
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

function localDateKey(offsetDays = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${results.length}: ${name}`);
}

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
  await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  check("首页使用购买时长提醒语义", await page.getByText(/建议优先考虑/).first().isVisible() && !(await page.locator("body").innerText()).includes("临期"));
  await page.getByRole("button", { name: "库存", exact: true }).click();
  await page.getByRole("heading", { name: "6 类食材", exact: true }).waitFor();
  check("库存显示 5–6 天优先状态", await page.getByText("已购买 6 天 · 建议优先使用", { exact: true }).isVisible());
  check("库存显示 7 天以上状态及安全边界", await page.getByText("已购买 8 天 · 已购买较久", { exact: true }).isVisible() && await page.getByText("使用前请自行确认食材状态", { exact: true }).isVisible());
  check("库存显示购买时间未知", await page.getByText("购买时间未知", { exact: true }).isVisible());

  await page.getByRole("button", { name: "添加食材", exact: true }).click();
  check("库存表单使用购买日期字段", await page.getByLabel("购买日期（可选）", { exact: true }).isVisible() && !(await page.getByRole("dialog").innerText()).includes("预计到期"));
  await page.getByLabel(/食材名称/).fill("未来日期测试");
  await page.getByLabel("购买日期（可选）", { exact: true }).fill(localDateKey(1));
  await page.getByRole("button", { name: "保存食材", exact: true }).click();
  check("未来购买日期被阻止", await page.getByRole("alert").getByText(/不能晚于今天/).isVisible());
  await page.getByLabel("购买日期（可选）", { exact: true }).fill(localDateKey(-4));
  await page.getByRole("button", { name: "保存食材", exact: true }).click();
  check("有效购买日期保存为 Schema v2", await page.evaluate((key) => {
    const item = window.__MVP__.getData().inventory.find((entry) => entry.name === "未来日期测试");
    return item?.batches[0]?.purchasedOn === key && !("expiresOn" in item.batches[0]) && !("useSoon" in item.batches[0]);
  }, localDateKey(-4)));
  await page.reload({ waitUntil: "load" });
  check("购买日期刷新后保留", await page.getByText("已购买 4 天", { exact: true }).isVisible());

  await page.getByRole("button", { name: "恢复演示数据", exact: true }).click();
  check("恢复演示数据需要二次确认", await page.getByRole("alertdialog", { name: "恢复演示数据？" }).isVisible());
  await page.getByRole("button", { name: "取消", exact: true }).click();
  check("取消恢复不会删除现有数据", await page.getByText("未来日期测试", { exact: true }).isVisible());
  await page.getByRole("button", { name: "恢复演示数据", exact: true }).click();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  check("确认后才恢复演示数据", await page.evaluate(() => !window.__MVP__.getData().inventory.some((item) => item.name === "未来日期测试")));

  await page.evaluate((key) => {
    const v1 = window.__MVP__.getData();
    v1.schemaVersion = 1;
    delete v1.migration;
    for (const item of v1.inventory) for (const batch of item.batches) {
      delete batch.purchasedOn;
      batch.expiresOn = null;
      batch.useSoon = false;
    }
    localStorage.setItem(key, JSON.stringify(v1));
  }, storageKey);
  await page.reload({ waitUntil: "load" });
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await page.getByRole("heading", { name: "今天", exact: true }).waitFor();
  check("V1 数据自动迁移并明确提示", await page.getByText("本地数据已升级", { exact: true }).isVisible() && await page.evaluate(() => window.__MVP__.getData().schemaVersion === 2));
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await page.reload({ waitUntil: "load" });
  check("迁移提示确认状态持久化", !await page.getByText("本地数据已升级", { exact: true }).isVisible().catch(() => false));

  await page.evaluate((key) => localStorage.setItem(key, "{broken-json"), storageKey);
  await page.reload({ waitUntil: "load" });
  check("损坏数据进入专用恢复页", await page.getByRole("heading", { name: "本地数据暂时无法读取" }).isVisible());
  check("损坏原始数据未被覆盖", await page.evaluate((key) => localStorage.getItem(key) === "{broken-json", storageKey));
  await page.getByRole("button", { name: "重试读取", exact: true }).click();
  check("重试失败仍停留在恢复页", await page.getByRole("heading", { name: "本地数据暂时无法读取" }).isVisible());
  await page.getByRole("button", { name: "清除并恢复演示数据", exact: true }).click();
  check("损坏数据清除仍需二次确认", await page.getByRole("alertdialog", { name: "清除本地数据？" }).isVisible());
  await page.getByRole("button", { name: "确认清除", exact: true }).click();
  check("确认后可恢复正常使用", await page.getByRole("button", { name: "今天吃什么", exact: true }).isVisible());

  await page.evaluate(() => window.__MVP__.recommend(() => 0));
  await page.getByRole("button", { name: "跳过并看结果", exact: true }).click();
  await page.waitForURL(/#\/result$/);
  await page.getByRole("heading", { name: "推荐结果", exact: true }).waitFor();
  check("推荐结果解释购买时长", await page.getByText("为什么推荐", { exact: true }).isVisible() && await page.getByText(/已购买/).isVisible());
  await page.getByRole("button", { name: "查看菜谱", exact: true }).click();
  await page.getByRole("button", { name: "我做了这顿饭", exact: true }).click();
  const tomatoRows = page.locator(".deduction-row").filter({ hasText: "西红柿" });
  check("扣减按较早购买批次排序并解释", await tomatoRows.first().getByText(/T-01/).isVisible() && await tomatoRows.first().getByText(/已购买 6 天/).isVisible());
  check("购买时长状态具有文字与非颜色符号", await page.locator(".purchase-age-prioritize").first().evaluate((element) => getComputedStyle(element, "::before").content.includes("↑")));
  check("V2.0 UI 全程无控制台错误", errors.length === 0, errors.join(" | "));
  console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
