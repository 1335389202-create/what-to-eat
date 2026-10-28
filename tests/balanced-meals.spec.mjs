import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(".");
const mime = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"]]);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const target = path.resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
    if (!target.startsWith(root) || !(await stat(target)).isFile()) throw new Error("not found");
    response.writeHead(200, { "content-type": mime.get(path.extname(target)) || "application/octet-stream" });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ channel: "chrome", headless: true }));
let passed = 0;
function check(name, condition, detail = "") {
  if (!condition) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${++passed}: ${name}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}#/home`, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });

  await page.getByRole("button", { name: "今天吃什么", exact: true }).click();
  await page.getByLabel("用餐人数（1–6 人）").fill("4");
  await page.getByLabel("健康餐 · 每人热量上限").selectOption("650");
  await page.getByRole("button", { name: "开始抽取", exact: true }).click();
  await page.getByRole("button", { name: "跳过并看结果", exact: true }).click();
  await page.waitForURL(/#\/result$/);
  await page.getByRole("heading", { name: "推荐结果", exact: true }).waitFor();
  const menu = await page.evaluate(() => ({ conditions: window.__MVP__.getData().conditions, ids: window.__MVP__.getData().session.lastMealRecipeIds }));
  check("自填 4 人与健康餐条件持久化", menu.conditions.diners === 4 && menu.conditions.calorieLimit === 650);
  check("4 人菜单为 4–5 道", menu.ids.length >= 4 && menu.ids.length <= 5, menu.ids.join(","));
  check("结果展示每人热量约束", await page.getByText("本次热量上限：650 kcal / 人").isVisible(), await page.locator("body").innerText());
  const displayedTitles = await page.locator(".meal-dish strong").allTextContents();
  const expectedTitles = await page.evaluate(() => { const data = window.__MVP__.getData(); return data.session.lastMealRecipeIds.map((id) => window.__MVP__.recipes.find((recipe) => recipe.id === id).title); });
  check("结果页同时列出全部菜品", displayedTitles.length === menu.ids.length && displayedTitles.every((title, index) => title === expectedTitles[index]));
  const replaceButton = page.locator("[data-replace-dish]").first();
  check("套餐有可用的同类替换", await replaceButton.count() > 0);
  const replaceIndex = Number(await replaceButton.getAttribute("data-replace-dish"));
  const categoryBefore = await page.locator(".meal-dish").nth(replaceIndex).locator(".meal-kind").innerText();
  await replaceButton.click();
  const replaced = await page.evaluate(() => window.__MVP__.getData().session.lastMealRecipeIds);
  check("同类替换只改变选中的一道菜", replaced.length === menu.ids.length && replaced.filter((id, index) => id !== menu.ids[index]).length === 1 && replaced[replaceIndex] !== menu.ids[replaceIndex]);
  check("替换后类别不变", await page.locator(".meal-dish").nth(replaceIndex).locator(".meal-kind").innerText() === categoryBefore);
  await page.reload({ waitUntil: "load" });
  check("替换结果刷新后保留", await page.evaluate(() => window.__MVP__.getData().session.lastMealRecipeIds.join(",")) === replaced.join(","));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(`${width}px 完整菜单无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "查看菜谱", exact: true }).click();
  await page.getByRole("heading", { name: "菜谱", exact: true }).waitFor();
  check("替换后各道菜分别展示做法", await page.locator(".dish-steps").count() === replaced.length);
  const keys = await page.evaluate(() => { window.__MVP__.prepareDeduction(); return window.__MVP__.getPendingDeduction().items.map((item) => item.key); });
  check("组合菜单不会重复扣同一批次", new Set(keys).size === keys.length, keys.join(","));

  await page.goto(`${base}#/inventory`, { waitUntil: "load" });
  await page.locator(".inventory-row").filter({ hasText: "西红柿" }).getByRole("button", { name: "调整库存" }).click();
  await page.setViewportSize({ width: 320, height: 700 });
  check("320px 调整库存弹层无横向溢出", await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("选择批次").selectOption("T-02");
  await page.getByLabel(/直接扣减数量/).fill("20");
  await page.getByRole("button", { name: "确认扣减" }).click();
  check("不经制作可直接扣指定批次", await page.evaluate(() => window.__MVP__.getData().inventory.find((item) => item.id === "tomato").batches.find((batch) => batch.id === "T-02").quantity === 200));
  await page.reload({ waitUntil: "load" });
  check("直接扣减刷新后仍保留", await page.evaluate(() => window.__MVP__.getData().inventory.find((item) => item.id === "tomato").batches.find((batch) => batch.id === "T-02").quantity === 200));
  await page.locator(".inventory-row").filter({ hasText: "西红柿" }).getByRole("button", { name: "调整库存" }).click();
  await page.getByRole("button", { name: "删除此批次" }).click();
  check("删除需二次确认", await page.getByRole("alertdialog", { name: "删除这个库存批次？" }).isVisible());
  await page.getByRole("button", { name: "确认删除" }).click();
  check("删除批次保留其余库存", await page.evaluate(() => { const batches = window.__MVP__.getData().inventory.find((item) => item.id === "tomato").batches; return batches.length === 1 && batches[0].id === "T-02"; }));

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(`${width}px 库存无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1));
  }
  await page.goto(`${base}#/eat-out`, { waitUntil: "load" });
  check("外出类型已细化", await page.locator(".cuisine-option").count() >= 16);
  check("全程无控制台或资源错误", errors.length === 0, errors.join(" | "));
  console.log(JSON.stringify({ passed, total: passed }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
