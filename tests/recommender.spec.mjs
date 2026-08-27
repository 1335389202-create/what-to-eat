import { createDefaultDocument } from "../src/storage.js";
import { recipes, findRecipe } from "../src/data/recipes.js";
import { evaluateRecipe, getCandidateWeight, getCandidates, matchIngredient, pickRecommendation } from "../src/recommender.js";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(name + ": " + detail);
}

const today = "2026-08-26";
const doc = createDefaultDocument(new Date(2026, 7, 26, 12));
check("菜谱数量位于冻结范围", recipes.length >= 15 && recipes.length <= 30, "实际 " + recipes.length + " 道");
check("系统菜谱 ID 唯一", new Set(recipes.map((recipe) => recipe.id)).size === recipes.length);

const satisfied = matchIngredient({ id: "tomato", name: "西红柿", amount: 180, unit: "g", pricePerUnit: .01 }, doc.inventory, doc.pantry, 1);
const possible = matchIngredient({ id: "greens", name: "青菜", amount: 1, unit: "把", pricePerUnit: 5 }, doc.inventory, doc.pantry, 1);
const unknown = matchIngredient({ id: "chicken", name: "鸡胸肉", amount: 180, unit: "g", pricePerUnit: .02 }, doc.inventory, doc.pantry, 1);
const insufficient = matchIngredient({ id: "potato", name: "土豆", amount: 250, unit: "g", pricePerUnit: .01 }, doc.inventory, doc.pantry, 1);
check("库存满足由数量计算", satisfied.status === "satisfied");
check("约数库存计算为可能满足", possible.status === "possible");
check("未知数量计算为未知", unknown.status === "unknown");
check("数量短缺计算为不足", insufficient.status === "insufficient" && insufficient.missing === 150);
check("只有已知正数量批次提供购买时长证据", satisfied.eligibleBatches.length === 2 && unknown.eligibleBatches.length === 0);

const twoPeople = createDefaultDocument(new Date(2026, 7, 26, 12));
twoPeople.conditions.diners = 2;
const scaled = evaluateRecipe(findRecipe("tomato-egg-rice"), twoPeople, today);
check("人数会线性调整需求量", scaled.ingredients.find((item) => item.id === "egg").required === 4 && scaled.ingredients.find((item) => item.id === "rice").required === 160);

const prioritized = evaluateRecipe(findRecipe("tomato-egg-rice"), doc, today);
check("5–6 天候选加权 +2", prioritized.purchaseAgeBonus === 2 && prioritized.purchasePriority.days === 6);
check("同食材多批次选择更早购买批次", prioritized.purchasePriority.batchId === "T-01");
check("推荐理由指向实际贡献批次", prioritized.purchasePriority.name === "西红柿" && /西红柿已购买 6 天/.test(prioritized.reason));

const highest = createDefaultDocument(new Date(2026, 7, 26, 12));
highest.inventory.find((item) => item.id === "tomato").batches[0].purchasedOn = "2026-08-21";
highest.inventory.find((item) => item.id === "egg").batches[0].purchasedOn = "2026-08-18";
const highestCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), highest, today);
check("多个食材只取最高档不叠加", highestCandidate.purchaseAgeBonus === 3 && highestCandidate.purchasePriority.name === "鸡蛋");
check("≥7 天理由包含中性安全边界", /鸡蛋已购买 8 天/.test(highestCandidate.reason) && /自行确认食材状态/.test(highestCandidate.reason));

const sameTier = createDefaultDocument(new Date(2026, 7, 26, 12));
sameTier.inventory.find((item) => item.id === "tomato").batches[0].purchasedOn = "2026-08-21";
sameTier.inventory.find((item) => item.id === "egg").batches[0].purchasedOn = "2026-08-20";
const sameTierCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), sameTier, today);
check("同档选择购买更早的贡献食材且不叠加", sameTierCandidate.purchaseAgeBonus === 2 && sameTierCandidate.purchasePriority.name === "鸡蛋" && sameTierCandidate.purchasePriority.days === 6);

const normal = createDefaultDocument(new Date(2026, 7, 26, 12));
for (const item of normal.inventory) for (const batch of item.batches) batch.purchasedOn = "2026-08-24";
const normalCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), normal, today);
check("0–4 天不加权", normalCandidate.purchaseAgeBonus === 0 && normalCandidate.purchasePriority === null);

const abnormal = createDefaultDocument(new Date(2026, 7, 26, 12));
for (const item of abnormal.inventory) for (const batch of item.batches) batch.purchasedOn = "2026-08-27";
const abnormalCandidate = evaluateRecipe(findRecipe("tomato-egg-rice"), abnormal, today);
check("future 日期不进入推荐加权", abnormalCandidate.purchaseAgeBonus === 0 && abnormalCandidate.purchasePriority === null);

const unknownQuantity = createDefaultDocument(new Date(2026, 7, 26, 12));
unknownQuantity.inventory.find((item) => item.id === "chicken").batches[0].purchasedOn = "2026-08-01";
unknownQuantity.inventory.find((item) => item.id === "greens").batches[0].purchasedOn = "2026-08-26";
const unknownCandidate = evaluateRecipe(findRecipe("chicken-greens"), unknownQuantity, today);
check("数量未知批次即使日期较早也不加权", unknownCandidate.purchaseAgeBonus === 0 && unknownCandidate.purchasePriority === null);

const baseWeight = getCandidateWeight(prioritized, []);
const recentWeight = getCandidateWeight(prioritized, ["tomato-egg-rice"]);
check("近期结果 .25 降权仍在购买时长后生效", recentWeight === baseWeight * .25);

const filtered = createDefaultDocument(new Date(2026, 7, 26, 12));
filtered.conditions = { ...filtered.conditions, cuisine: "western", diet: "vegetarian", maxMinutes: 30, stockMode: "topup", topUpBudget: 100 };
const filteredCandidates = getCandidates(recipes, filtered, today);
check("菜系硬条件生效", filteredCandidates.length > 0 && filteredCandidates.every((candidate) => candidate.recipe.cuisine === "western"));
check("素食硬条件生效", filteredCandidates.every((candidate) => candidate.recipe.diet === "vegetarian"));
check("时间硬条件生效", filteredCandidates.every((candidate) => candidate.recipe.minutes <= 30));

const strict = createDefaultDocument(new Date(2026, 7, 26, 12));
strict.conditions.stockMode = "strict";
check("严格库存模式排除不足", getCandidates(recipes, strict, today).every((candidate) => candidate.status !== "insufficient"));
const topup = createDefaultDocument(new Date(2026, 7, 26, 12));
topup.conditions = { ...topup.conditions, stockMode: "topup", topUpBudget: 5 };
check("补买模式遵守本次补买预算", getCandidates(recipes, topup, today).every((candidate) => candidate.missingCost <= 5));

const impossible = createDefaultDocument(new Date(2026, 7, 26, 12));
impossible.inventory = [];
impossible.pantry = [];
impossible.conditions = { ...impossible.conditions, cuisine: "western", maxMinutes: 20, stockMode: "strict" };
const noResult = pickRecommendation(recipes, impossible, () => .5, today);
check("无候选返回可恢复说明", noResult.candidate === null && /放宽|补充库存/.test(noResult.message));

const randomPick = pickRecommendation(recipes, doc, () => .6, today);
check("随机结果始终来自合格候选", randomPick.candidate && randomPick.candidates.some((candidate) => candidate.recipe.id === randomPick.candidate.recipe.id));
check("所有推荐理由都来自购买时长或真实库存条件", randomPick.candidates.every((candidate) => /已购买|用餐条件/.test(candidate.reason)));

console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
