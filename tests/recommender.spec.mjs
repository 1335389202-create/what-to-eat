import { createDefaultDocument } from "../src/storage.js";
import { recipes, findRecipe } from "../src/data/recipes.js";
import { evaluateRecipe, getCandidates, matchIngredient, pickRecommendation } from "../src/recommender.js";

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
}

const doc = createDefaultDocument();
check("菜谱数量位于冻结范围", recipes.length >= 15 && recipes.length <= 30, `实际 ${recipes.length} 道`);
check("系统菜谱 ID 唯一", new Set(recipes.map((recipe) => recipe.id)).size === recipes.length);

const satisfied = matchIngredient({ id: "tomato", name: "西红柿", amount: 180, unit: "g", pricePerUnit: .01 }, doc.inventory, doc.pantry, 1);
const possible = matchIngredient({ id: "greens", name: "青菜", amount: 1, unit: "把", pricePerUnit: 5 }, doc.inventory, doc.pantry, 1);
const unknown = matchIngredient({ id: "chicken", name: "鸡胸肉", amount: 180, unit: "g", pricePerUnit: .02 }, doc.inventory, doc.pantry, 1);
const insufficient = matchIngredient({ id: "potato", name: "土豆", amount: 250, unit: "g", pricePerUnit: .01 }, doc.inventory, doc.pantry, 1);
check("库存满足由数量计算", satisfied.status === "satisfied");
check("约数库存计算为可能满足", possible.status === "possible");
check("未知数量计算为未知", unknown.status === "unknown");
check("数量短缺计算为不足", insufficient.status === "insufficient" && insufficient.missing === 150);

const twoPeople = createDefaultDocument();
twoPeople.conditions.diners = 2;
const scaled = evaluateRecipe(findRecipe("tomato-egg-rice"), twoPeople);
check("人数会线性调整需求量", scaled.ingredients.find((item) => item.id === "egg").required === 4 && scaled.ingredients.find((item) => item.id === "rice").required === 160);

const filtered = createDefaultDocument();
filtered.conditions = { ...filtered.conditions, cuisine: "western", diet: "vegetarian", maxMinutes: 30, stockMode: "topup", topUpBudget: 100 };
const filteredCandidates = getCandidates(recipes, filtered);
check("菜系硬条件生效", filteredCandidates.length > 0 && filteredCandidates.every((candidate) => candidate.recipe.cuisine === "western"));
check("素食硬条件生效", filteredCandidates.every((candidate) => candidate.recipe.diet === "vegetarian"));
check("时间硬条件生效", filteredCandidates.every((candidate) => candidate.recipe.minutes <= 30));

const strict = createDefaultDocument();
strict.conditions.stockMode = "strict";
check("严格库存模式排除不足", getCandidates(recipes, strict).every((candidate) => candidate.status !== "insufficient"));
const topup = createDefaultDocument();
topup.conditions = { ...topup.conditions, stockMode: "topup", topUpBudget: 5 };
check("补买模式遵守本次补买预算", getCandidates(recipes, topup).every((candidate) => candidate.missingCost <= 5));

const impossible = createDefaultDocument();
impossible.inventory = [];
impossible.pantry = [];
impossible.conditions = { ...impossible.conditions, cuisine: "western", maxMinutes: 20, stockMode: "strict" };
const noResult = pickRecommendation(recipes, impossible, () => .5);
check("无候选返回可恢复说明", noResult.candidate === null && /放宽|补充库存/.test(noResult.message));

const randomPick = pickRecommendation(recipes, doc, () => .6);
check("随机结果始终来自合格候选", randomPick.candidate && randomPick.candidates.some((candidate) => candidate.recipe.id === randomPick.candidate.recipe.id));
check("推荐理由可追溯", /临期|用餐条件/.test(randomPick.candidate.reason));

console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
