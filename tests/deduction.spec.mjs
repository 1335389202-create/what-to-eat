import { buildDeduction, applyDeduction } from "../src/deduction.js";
import { findRecipe } from "../src/data/recipes.js";
import { evaluateRecipe } from "../src/recommender.js";
import { createDefaultDocument, createStore, STORAGE_KEY } from "../src/storage.js";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(name + ": " + detail);
}

const today = "2026-08-26";
const before = createDefaultDocument(new Date(2026, 7, 26, 12));
const candidate = evaluateRecipe(findRecipe("tomato-egg-rice"), before, today);
const preview = buildDeduction(candidate, before.inventory, today);
check("预览包含菜谱库存食材", ["西红柿", "鸡蛋", "大米"].every((name) => preview.items.some((item) => item.name === name)));
check("较早购买的已知批次优先分配", preview.items.find((item) => item.name === "西红柿")?.batchId === "T-01");
check("预览携带购买日期而不携带旧临期字段", preview.items.every((item) => Object.hasOwn(item, "purchasedOn") && !Object.hasOwn(item, "useSoon")));
check("打开预览不修改原库存", before.inventory.find((item) => item.id === "tomato").batches[0].quantity === 180);

const reversed = createDefaultDocument(new Date(2026, 7, 26, 12));
const reversedTomatoes = reversed.inventory.find((item) => item.id === "tomato").batches;
reversedTomatoes[0].purchasedOn = "2026-08-24";
reversedTomatoes[1].purchasedOn = "2026-08-18";
const reversedCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), reversed, today);
const reversedPreview = buildDeduction(reversedCandidate, reversed.inventory, today);
check("日期排序而不是数组顺序决定建议批次", reversedPreview.items.find((item) => item.name === "西红柿")?.batchId === "T-02");

const unknownAfter = createDefaultDocument(new Date(2026, 7, 26, 12));
const unknownTomatoes = unknownAfter.inventory.find((item) => item.id === "tomato").batches;
unknownTomatoes[0].purchasedOn = null;
unknownTomatoes[1].purchasedOn = "2026-08-22";
const unknownCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), unknownAfter, today);
unknownCandidate.ingredients.find((item) => item.id === "tomato").required = 300;
const unknownPreview = buildDeduction(unknownCandidate, unknownAfter.inventory, today);
check("未知日期排在合法已知日期之后", unknownPreview.items.filter((item) => item.name === "西红柿").map((item) => item.batchId).join(",") === "T-02,T-01");

const sameDate = createDefaultDocument(new Date(2026, 7, 26, 12));
for (const batch of sameDate.inventory.find((item) => item.id === "tomato").batches) batch.purchasedOn = "2026-08-20";
const sameCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), sameDate, today);
sameCandidate.ingredients.find((item) => item.id === "tomato").required = 300;
const samePreview = buildDeduction(sameCandidate, sameDate.inventory, today);
check("同日期保持原始批次顺序", samePreview.items.filter((item) => item.name === "西红柿").map((item) => item.batchId).join(",") === "T-01,T-02");

const futureStable = createDefaultDocument(new Date(2026, 7, 26, 12));
const futureBatches = futureStable.inventory.find((item) => item.id === "tomato").batches;
futureBatches[0].purchasedOn = "2026-08-27";
futureBatches[1].purchasedOn = null;
const futureCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), futureStable, today);
futureCandidate.ingredients.find((item) => item.id === "tomato").required = 300;
const futurePreview = buildDeduction(futureCandidate, futureStable.inventory, today);
check("future 与 unknown 归入后组并保持原顺序", futurePreview.items.filter((item) => item.name === "西红柿").map((item) => item.batchId).join(",") === "T-01,T-02");

const after = applyDeduction(before, preview);
check("整批用完会移除批次", !after.inventory.find((item) => item.id === "tomato").batches.some((batch) => batch.id === "T-01"));
check("鸡蛋按建议扣减", after.inventory.find((item) => item.id === "egg").batches[0].quantity === 2);
check("大米按建议扣减", after.inventory.find((item) => item.id === "rice").batches[0].quantity === 120);
check("纯函数不改变提交前文档", before.inventory.find((item) => item.id === "egg").batches[0].quantity === 4);

const edited = structuredClone(preview);
edited.items.find((item) => item.name === "鸡蛋").amount = 1;
edited.items.find((item) => item.name === "大米").skip = true;
const editedAfter = applyDeduction(before, edited);
check("用户可编辑覆盖建议", editedAfter.inventory.find((item) => item.id === "egg").batches[0].quantity === 3);
check("用户可跳过建议", editedAfter.inventory.find((item) => item.id === "rice").batches[0].quantity === 200);

const invalid = structuredClone(preview);
invalid.items.find((item) => item.name === "鸡蛋").amount = 99;
let rejected = false;
try { applyDeduction(before, invalid); } catch { rejected = true; }
check("超量扣减整体拒绝", rejected && before.inventory.find((item) => item.id === "tomato").batches[0].quantity === 180);

const stale = structuredClone(preview);
stale.items.find((item) => item.name === "鸡蛋").batchId = "missing";
let staleRejected = false;
try { applyDeduction(before, stale); } catch { staleRejected = true; }
check("批次变化时整体拒绝", staleRejected && before.inventory.find((item) => item.id === "tomato").batches[0].quantity === 180);

function memoryStorage() {
  const values = new Map();
  let failWrites = false;
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { if (failWrites) throw new Error("quota"); values.set(key, String(value)); },
    removeItem: (key) => values.delete(key),
    setFailWrites: (value) => { failWrites = value; },
    read: (key) => values.get(key)
  };
}
const storage = memoryStorage();
const store = createStore(storage);
store.load();
const persistedBefore = store.snapshot();
storage.setFailWrites(true);
const failed = store.update((draft) => applyDeduction(draft, buildDeduction(evaluateRecipe(findRecipe("tomato-egg-rice"), draft, today), draft.inventory, today)));
check("写入失败回滚且主 payload 不变", failed.ok === false && JSON.parse(storage.read(STORAGE_KEY)).inventory[0].batches[0].quantity === persistedBefore.inventory[0].batches[0].quantity);

console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
