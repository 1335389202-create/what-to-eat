import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
  console.log(`PASS ${results.length}: ${name}`);
}

async function exists(relative) {
  try { await access(path.join(root, relative)); return true; } catch { return false; }
}

const requiredFiles = ["README.md", "LICENSE", ".gitignore", ".github/workflows/pages.yml"];
check("公开仓库包装文件齐全", (await Promise.all(requiredFiles.map(exists))).every(Boolean));

const screenshots = ["home-mobile.png", "result-mobile.png", "recipe-mobile.png", "deduction-mobile.png"].map((name) => `assets/screenshots/${name}`);
check("README 产品截图齐全", (await Promise.all(screenshots.map(exists))).every(Boolean));

const readme = await readFile(path.join(root, "README.md"), "utf8");
const requiredSections = ["Live Demo", "项目截图", "核心功能", "核心用户流程", "产品设计思路", "技术方案", "推荐机制简述", "LocalStorage 数据策略", "本地运行", "运行测试", "项目结构", "Portfolio MVP 范围", "Roadmap", "已知限制"];
check("README 必需章节齐全", requiredSections.every((title) => readme.includes(`## ${title}`)), requiredSections.filter((title) => !readme.includes(`## ${title}`)).join(", "));
check("README 明确禁止 file 双击", /不能直接.*file:\/\/|请勿直接双击/.test(readme));
check("README 如实披露 MVP 限制", ["Mock", "估算", "单设备", "AI", "登录", "地图", "真实餐厅"].every((term) => readme.includes(term)));

const index = await readFile(path.join(root, "index.html"), "utf8");
const runtimeFiles = ["src/app.js", "src/storage.js", "src/recommender.js", "src/deduction.js", "src/data/recipes.js", "src/styles.css"];
const runtimeContents = [index, ...await Promise.all(runtimeFiles.map((file) => readFile(path.join(root, file), "utf8")))].join("\n");
check("HTML 入口使用相对资源路径", index.includes('href="src/styles.css"') && index.includes('src="src/app.js"'));
check("运行时代码不含本机绝对路径", !/(?<![A-Za-z])[A-Za-z]:[\\/]|file:\/\//i.test(runtimeContents));
check("运行时代码不依赖 localhost", !/localhost|127\.0\.0\.1/i.test(runtimeContents));
check("ES Module import 均为相对引用", [...(await readFile(path.join(root, "src/app.js"), "utf8")).matchAll(/from\s+["']([^"']+)["']/g)].every((match) => match[1].startsWith("./")));

const workflow = await readFile(path.join(root, ".github/workflows/pages.yml"), "utf8");
const workflowSignals = ["actions/checkout@v6", "actions/configure-pages@v6", "actions/upload-pages-artifact@v5", "actions/deploy-pages@v5", "pages: write", "id-token: write", "name: github-pages", "path: _site"];
check("Pages workflow 包含官方发布链", workflowSignals.every((signal) => workflow.includes(signal)), workflowSignals.filter((signal) => !workflow.includes(signal)).join(", "));
check("Pages artifact 只暂存公开运行文件", workflow.includes("cp index.html _site/") && workflow.includes("cp -R src _site/src") && !workflow.includes("path: .\n"));

const releaseText = [readme, index, workflow, ...await Promise.all(runtimeFiles.map((file) => readFile(path.join(root, file), "utf8")))].join("\n");
const secretValuePattern = /api[_-]?key\s*[:=]\s*["'][^"']+|access[_-]?token\s*[:=]\s*["'][^"']+|client[_-]?secret\s*[:=]\s*["'][^"']+|bearer\s+[A-Za-z0-9._-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
check("发布文件不含 secret 值", !secretValuePattern.test(releaseText));
check("发布文件不含中国大陆手机号", !/(?<!\d)1[3-9]\d{9}(?!\d)/.test(releaseText));

console.log(JSON.stringify({ passed: results.length, total: results.length }, null, 2));
