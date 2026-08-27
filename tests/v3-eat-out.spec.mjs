import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { cuisines, getCuisineCandidates, pickCuisine } from "../src/data/cuisines.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(".");
const mime = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"]]);

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${results.length}: ${name}`);
}

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

check("Eat Out 完全随机返回合法餐饮类型", cuisines.includes(pickCuisine({}, () => .42).cuisine));
const selectedIds = ["korean", "thai"];
const selectedDraw = pickCuisine({ selectedIds }, () => .99);
check("指定候选后随机仅返回允许集合", selectedIds.includes(selectedDraw.cuisine.id), selectedDraw.cuisine.id);
check("口味筛选结果属于候选集合", getCuisineCandidates({ taste: "light" }).every((item) => item.tastes.includes("light")));

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

  check("Home / Eat Out 双场景入口可见", await page.getByRole("button", { name: /在家吃/ }).isVisible() && await page.getByRole("button", { name: /出去吃/ }).isVisible());
  await page.getByRole("button", { name: /出去吃/ }).click();
  await page.waitForURL(/#\/eat-out$/);
  await page.getByRole("heading", { name: "把选择交给今天。", exact: true }).waitFor();
  check("场景切换进入外出条件页", await page.getByRole("heading", { name: "把选择交给今天。", exact: true }).isVisible());

  await page.getByRole("button", { name: "韩餐", exact: true }).click();
  await page.getByRole("button", { name: "泰餐", exact: true }).click();
  await page.evaluate(() => window.__MVP__.recommendCuisine(() => 0));
  await page.getByRole("button", { name: "跳过并看结果", exact: true }).click();
  await page.waitForURL(/#\/eat-out-result$/);
  const first = await page.evaluate(() => window.__MVP__.getEatOutState().recommendation.id);
  check("页面指定候选抽取结果合法", selectedIds.includes(first), first);

  await page.getByRole("button", { name: "换一个", exact: true }).click();
  await page.getByRole("button", { name: "跳过并看结果", exact: true }).click();
  const second = await page.evaluate(() => window.__MVP__.getEatOutState().recommendation.id);
  check("换一个会避开当前结果", second !== first && selectedIds.includes(second), `${first} -> ${second}`);
  await page.getByRole("button", { name: "就吃这个", exact: true }).click();
  check("确认结果给出真实能力边界", await page.getByText("附近餐厅推荐将在后续版本开放。", { exact: true }).isVisible());

  const viewports = [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 1000 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:${port}/#/eat-out`, { waitUntil: "load" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`${viewport.width}px Eat Out 无横向溢出`, overflow <= 1, String(overflow));
  }

  await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: "load" });
  await page.getByRole("button", { name: "库存", exact: true }).click();
  await page.waitForURL(/#\/inventory$/);
  await page.getByRole("heading", { name: "我的库存", exact: true }).waitFor();
  check("Home Cooking 核心 smoke 保持", await page.getByRole("heading", { name: "我的库存", exact: true }).isVisible());
  check("V3 全程无控制台错误", errors.length === 0, errors.join(" | "));
  console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
