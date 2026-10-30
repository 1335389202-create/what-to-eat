import { createDefaultDocument } from "../src/storage.js";
import { recipes, findRecipe } from "../src/data/recipes.js";
import { evaluateRecipe, getCandidateWeight, getCandidates, getMealCandidates, getMealReplacements, mealCategory, matchIngredient, pickRecommendation } from "../src/recommender.js";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(name + ": " + detail);
}

const today = "2026-08-26";
const doc = createDefaultDocument(new Date(2026, 7, 26, 12));
check("结构化菜谱已扩充", recipes.length >= 30, "实际 " + recipes.length + " 道");
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

for (const diners of [1, 2, 3, 4]) {
  const people = createDefaultDocument(new Date(2026, 7, 26, 12));
  people.conditions.diners = diners;
  const meals = getMealCandidates(recipes, people, today);
  check(`${diners} 人正餐按人数配菜`, meals.length > 0 && meals.every((candidate) =>
    candidate.dishes.length >= Math.max(2, diners) && candidate.dishes.length <= diners + 1 &&
    candidate.dishes.some((dish) => dish.role === "vegetable") && candidate.dishes.some((dish) => dish.role === "protein" || dish.ingredients.some((item) => ["chicken", "egg", "tofu", "beef", "pork", "fish"].includes(item.id)))
  ), String(meals.length));
}
for (const diners of [5, 6]) {
  const people = createDefaultDocument(new Date(2026, 7, 26, 12));
  people.conditions = { ...people.conditions, diners, stockMode: "topup", topUpBudget: 200 };
  const meals = getMealCandidates(recipes, people, today);
  check(`${diners} 人补买模式可形成对应菜品数`, meals.length > 0 && meals.every((candidate) => candidate.dishes.length >= diners && candidate.dishes.length <= diners + 1));
}
const healthy = createDefaultDocument(new Date(2026, 7, 26, 12));
healthy.conditions.diners = 4;
healthy.conditions.calorieLimit = 650;
const healthyMeals = getMealCandidates(recipes, healthy, today);
check("健康餐约束整顿每人热量", healthyMeals.length > 0 && healthyMeals.every((candidate) => candidate.caloriesPerPerson <= 650));
check("同名食材跨菜品合并需求", healthyMeals.every((candidate) => new Set(candidate.ingredients.map((item) => `${item.id}:${item.unit}`)).size === candidate.ingredients.length));
healthy.conditions.calorieLimit = 450;
check("热量上限无法满足时不伪造结果", getMealCandidates(recipes, healthy, today).length === 0);

const replaceDoc = createDefaultDocument(new Date(2026, 7, 26, 12));
replaceDoc.conditions = { ...replaceDoc.conditions, diners: 3, stockMode: "topup", topUpBudget: 200, calorieLimit: 650 };
const replaceDishes = ["light-tomato-egg-rice", "garlic-greens-side", "chicken-side"].map(findRecipe);
for (const index of [0, 1, 2]) {
  const replacements = getMealReplacements(recipes, replaceDoc, replaceDishes, index, today);
  check(`第 ${index + 1} 道菜有同类备选`, replacements.length > 0);
  check(`第 ${index + 1} 道菜只在原类别内替换`, replacements.every((candidate) => candidate.dishes.length === 3 && candidate.dishes.filter((dish, position) => dish.id !== replaceDishes[position].id).length === 1 && mealCategory(candidate.dishes[index]) === mealCategory(replaceDishes[index]) && candidate.caloriesPerPerson <= 650));
}
check("汤、蛋豆菜与半荤半素分开", mealCategory(findRecipe("tomato-egg-soup-side")) === "soup" && mealCategory(findRecipe("tomato-egg-side")) === "egg-tofu" && mealCategory(findRecipe("chicken-cucumber-side")) === "mixed");
const varied = createDefaultDocument(new Date(2026, 7, 26, 12));
varied.conditions = { ...varied.conditions, diners: 4, stockMode: "topup", topUpBudget: 200, calorieLimit: 800 };
const variedDishes = ["light-tomato-egg-rice", "garlic-greens-side", "chicken-side", "tomato-egg-soup-side", "chicken-cucumber-side"].map(findRecipe);
check("汤可换另一道汤", getMealReplacements(recipes, varied, variedDishes, 3, today).some((candidate) => candidate.dishes[3].id === "greens-tofu-soup-side"));
check("半荤半素可换同类菜", getMealReplacements(recipes, varied, variedDishes, 4, today).some((candidate) => candidate.dishes[4].id === "pork-pepper-mixed-side"));

const shopping = createDefaultDocument(new Date(2026, 7, 26, 12));
shopping.inventory = [];
shopping.conditions = { ...shopping.conditions, diners: 2, stockMode: "shop", topUpBudget: 0 };
const shoppingCandidates = getMealCandidates(recipes, shopping, today);
check("按菜谱买菜不依赖库存或补买预算", shoppingCandidates.length > 0 && shoppingCandidates.some((candidate) => candidate.recipe.id === "light-tomato-egg-rice"));
check("按菜谱买菜没有购买时长加权", shoppingCandidates.every((candidate) => candidate.purchaseAgeBonus === 0));
const firstShoppingPick = pickRecommendation(recipes, shopping, () => 0, today);
const rerolledShoppingPick = pickRecommendation(recipes, shopping, () => 0, today, firstShoppingPick.candidate.recipe.id);
check("再来一次优先更换主菜", rerolledShoppingPick.candidate.recipe.id !== firstShoppingPick.candidate.recipe.id);

console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
