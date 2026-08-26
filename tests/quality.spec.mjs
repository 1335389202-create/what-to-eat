import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(".");
const artifacts = path.join(root, "tests", "artifacts");
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
function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${results.length}: ${name}`);
}

await mkdir(artifacts, { recursive: true });
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

  await page.screenshot({ path: path.join(artifacts, "home-mobile.png"), fullPage: true });
  check("首页具有 Portfolio 主视觉", await page.locator(".home-hero .meal-illustration").isVisible() && await page.getByRole("heading", { name: "今天吃什么？" }).isVisible());
  check("显式 Reduce Motion 控件可用", await page.getByRole("button", { name: /标准动效/ }).isVisible());
  await page.getByRole("button", { name: /标准动效/ }).click();
  check("显式 Reduce Motion 立即生效", await page.evaluate(() => document.documentElement.classList.contains("reduce-motion") && document.querySelector("[data-action='toggle-motion']")?.getAttribute("aria-pressed") === "true"));
  await page.reload({ waitUntil: "load" });
  check("Reduce Motion 刷新后保留", await page.evaluate(() => document.documentElement.classList.contains("reduce-motion")));

  const conditionCta = page.locator("[data-focus-key='conditions']");
  await conditionCta.focus();
  await conditionCta.press("Enter");
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.(".sheet")));
  check("键盘可打开条件且焦点进入", await page.getByRole("dialog", { name: "推荐条件" }).isVisible());
  await page.keyboard.press("Escape");

  const viewports = [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 1000 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: "load" });
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, targets: [...document.querySelectorAll("button:not([hidden]), input:not([hidden]), select:not([hidden])")].filter((element) => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0; }).map((element) => ({ label: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 20), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })) }));
    check(`${viewport.width}px 无横向溢出`, layout.overflow <= 1, JSON.stringify(layout));
    const smallTargets = layout.targets.filter((target) => target.width < 44 || target.height < 44);
    check(`${viewport.width}px 可见操作触控区达标`, smallTargets.length === 0, JSON.stringify(smallTargets));
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: "load" });
  const drawStartedAt = Date.now();
  await page.evaluate(() => window.__MVP__.recommend(() => 0));
  await page.waitForURL(/#\/result$/, { timeout: 800 });
  check("Reduce Motion 下盲盒快速呈现", Date.now() - drawStartedAt < 700, `${Date.now() - drawStartedAt}ms`);
  check("库存状态含文字和符号", await page.getByText("库存满足", { exact: true }).isVisible() && await page.locator(".status-satisfied").evaluate((element) => getComputedStyle(element, "::before").content.includes("✓")));
  await page.screenshot({ path: path.join(artifacts, "result-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "查看菜谱", exact: true }).click();
  await page.waitForURL(/#\/recipe$/);
  await page.getByRole("heading", { name: "番茄炒蛋配米饭", exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, "recipe-mobile.png"), fullPage: true });
  const recipeClear = await page.evaluate(async () => {
    scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.querySelector(".metric-grid").getBoundingClientRect().bottom <= document.querySelector(".fixed-action").getBoundingClientRect().top + 1;
  });
  check("菜谱末端内容可滚出固定操作区", recipeClear);
  await page.getByRole("button", { name: "我做了这顿饭", exact: true }).click();
  await page.waitForURL(/#\/deduction$/);
  await page.getByText("确认后才更新库存", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, "deduction-mobile.png"), fullPage: true });
  check("菜谱与扣减页可生成作品集截图", await page.locator(".deduction-row").count() === 3);
  const deductionClear = await page.evaluate(async () => {
    scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.querySelector(".deduction-row:last-child").getBoundingClientRect().bottom <= document.querySelector(".fixed-action").getBoundingClientRect().top + 1;
  });
  check("扣减末项可滚出固定操作区", deductionClear);

  const css = await readFile(path.join(root, "src", "styles.css"), "utf8");
  check("四态均有非颜色符号", ["status-satisfied", "status-possible", "status-insufficient", "status-unknown"].every((name) => css.includes(`.${name}::before`)));
  check("系统 Reduce Motion 样式存在", css.includes("@media (prefers-reduced-motion: reduce)"));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/#/home`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(artifacts, "home-desktop.png"), fullPage: true });
  check("桌面容器保持移动优先层级", await page.locator(".app-shell").evaluate((element) => element.getBoundingClientRect().width <= 1040));
  check("全程无控制台错误", errors.length === 0, errors.join(" | "));

  console.log(JSON.stringify({ passed: results.length, total: results.length, artifacts }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
