import { buildDeduction, applyDeduction } from "../src/deduction.js";
import { findRecipe } from "../src/data/recipes.js";
import { evaluateRecipe } from "../src/recommender.js";
import { createDefaultDocument } from "../src/storage.js";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
}

const before = createDefaultDocument();
const candidate = evaluateRecipe(findRecipe("tomato-egg-rice"), before);
const preview = buildDeduction(candidate, before.inventory);
check("预览包含菜谱库存食材", ["西红柿", "鸡蛋", "大米"].every((name) => preview.items.some((item) => item.name === name)));
check("临期批次优先分配", preview.items.find((item) => item.name === "西红柿")?.batchId === "T-01");
check("打开预览不修改原库存", before.inventory.find((item) => item.id === "tomato").batches[0].quantity === 180);

const after = applyDeduction(before, preview);
check("整批用完会移除批次", !after.inventory.find((item) => item.id === "tomato").batches.some((batch) => batch.id === "T-01"));
check("鸡蛋按建议扣减", after.inventory.find((item) => item.id === "egg").batches[0].quantity === 2);
check("大米按建议扣减", after.inventory.find((item) => item.id === "rice").batches[0].quantity === 120);
check("纯函数不改变提交前文档", before.inventory.find((item) => item.id === "egg").batches[0].quantity === 4);

const edited = structuredClone(preview);
edited.items.find((item) => item.name === "鸡蛋").amount = 1;
edited.items.find((item) => item.name === "大米").skip = true;
const editedAfter = applyDeduction(before, edited);
check("可编辑单项扣减", editedAfter.inventory.find((item) => item.id === "egg").batches[0].quantity === 3);
check("可跳过单项扣减", editedAfter.inventory.find((item) => item.id === "rice").batches[0].quantity === 200);

const invalid = structuredClone(preview);
invalid.items.find((item) => item.name === "鸡蛋").amount = 99;
let rejected = false;
try { applyDeduction(before, invalid); } catch { rejected = true; }
check("超量扣减整体拒绝", rejected && before.inventory.find((item) => item.id === "tomato").batches[0].quantity === 180);

console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
