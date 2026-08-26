import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(".");
const externalBaseUrl = process.env.MVP_BASE_URL || "";
const mime = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".png", "image/png"]]);

function createStaticServer(prefix = "/") {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      if (!pathname.startsWith(normalizedPrefix)) throw new Error("outside prefix");
      const relative = pathname.slice(normalizedPrefix.length) || "index.html";
      const target = path.resolve(root, relative);
      if (!target.startsWith(root) || !(await stat(target)).isFile()) throw new Error("not found");
      response.writeHead(200, { "content-type": mime.get(path.extname(target)) || "application/octet-stream" });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${results.length}: ${name}`);
}

const rootServer = externalBaseUrl ? null : createStaticServer("/");
const rootPort = rootServer ? await listen(rootServer) : null;
const rootBase = externalBaseUrl || `http://127.0.0.1:${rootPort}/`;
const prefixServer = createStaticServer("/what-to-eat/");
const prefixPort = await listen(prefixServer);
const prefixBase = `http://127.0.0.1:${prefixPort}/what-to-eat/`;
const browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ channel: "chrome", headless: true }));

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  const failures = [];
  const responses = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => failures.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));
  page.on("response", (response) => responses.push({ url: response.url(), status: response.status() }));

  const rootResponse = await page.goto(rootBase, { waitUntil: "networkidle" });
  check("真实 HTTP 根入口返回 200", rootResponse?.status() === 200, `${rootBase} -> ${rootResponse?.status()}`);
  check("公开 Demo 首页正常渲染", await page.getByRole("heading", { name: "今天吃什么？", exact: true }).isVisible());
  const expectedModules = ["src/app.js", "src/storage.js", "src/recommender.js", "src/deduction.js", "src/data/recipes.js"];
  check("ES Modules 全部通过 HTTP 加载", expectedModules.every((file) => responses.some((response) => response.status === 200 && response.url.endsWith(file))), JSON.stringify(responses));

  await page.evaluate(() => localStorage.clear());
  await page.goto(`${rootBase}#/inventory`, { waitUntil: "load" });
  await page.getByRole("button", { name: "添加食材", exact: true }).click();
  await page.getByLabel(/食材名称/).fill("部署验收豆腐");
  await page.getByRole("button", { name: "保存食材", exact: true }).click();
  await page.reload({ waitUntil: "load" });
  check("LocalStorage 刷新后保留", await page.getByText("部署验收豆腐", { exact: true }).isVisible());

  await page.goto(`${rootBase}#/home`, { waitUntil: "load" });
  await page.getByRole("button", { name: "今天吃什么", exact: true }).click();
  await page.getByRole("button", { name: "开始抽取", exact: true }).click();
  await page.getByRole("button", { name: "跳过并看结果", exact: true }).click();
  await page.getByRole("button", { name: "查看菜谱", exact: true }).click();
  await page.getByRole("button", { name: "我做了这顿饭", exact: true }).click();
  await page.waitForURL(/#\/deduction$/);
  check("HTTP 下主要流程可操作", await page.getByText("确认后才更新库存", { exact: true }).isVisible());
  await page.reload({ waitUntil: "load" });
  check("Hash 路由刷新状态正常", page.url().endsWith("#/deduction") && await page.getByText("确认后才更新库存", { exact: true }).isVisible());
  check("根路径无网络或控制台错误", failures.length === 0 && errors.length === 0, [...failures, ...errors].join(" | "));

  const prefixPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  prefixPage.setDefaultTimeout(5000);
  const prefixErrors = [];
  const prefixFailures = [];
  const prefixResponses = [];
  prefixPage.on("console", (message) => { if (message.type() === "error") prefixErrors.push(message.text()); });
  prefixPage.on("pageerror", (error) => prefixErrors.push(error.message));
  prefixPage.on("requestfailed", (request) => prefixFailures.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));
  prefixPage.on("response", (response) => prefixResponses.push({ url: response.url(), status: response.status() }));

  const prefixResponse = await prefixPage.goto(prefixBase, { waitUntil: "networkidle" });
  check("仓库子路径入口返回 200", prefixResponse?.status() === 200, `${prefixBase} -> ${prefixResponse?.status()}`);
  check("子路径 CSS 正常生效", await prefixPage.locator(".home-hero").evaluate((element) => getComputedStyle(element).borderRadius !== "0px"));
  check("子路径模块保持在 repository base 下", expectedModules.every((file) => prefixResponses.some((response) => response.status === 200 && response.url.includes(`/what-to-eat/${file}`))), JSON.stringify(prefixResponses));
  await prefixPage.getByRole("button", { name: "今天吃什么", exact: true }).click();
  await prefixPage.getByRole("button", { name: "开始抽取", exact: true }).click();
  check("子路径内部 Hash 导航不跳出仓库目录", prefixPage.url().includes("/what-to-eat/#/draw"), prefixPage.url());
  await prefixPage.reload({ waitUntil: "load" });
  check("子路径刷新继续可用", prefixPage.url().includes("/what-to-eat/#/") && await prefixPage.locator("#app").isVisible());
  check("子路径无网络或控制台错误", prefixFailures.length === 0 && prefixErrors.length === 0, [...prefixFailures, ...prefixErrors].join(" | "));

  console.log(JSON.stringify({ passed: results.length, total: results.length, rootBase, prefixBase }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => prefixServer.close(resolve));
  if (rootServer) await new Promise((resolve) => rootServer.close(resolve));
}
