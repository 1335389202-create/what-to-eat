"use strict";

const STATUS_RANK = { satisfied: 0, possible: 1, unknown: 2, insufficient: 3 };
export const statusLabels = { satisfied: "满足", possible: "可能满足", insufficient: "不足", unknown: "未知" };

function toBase(quantity, unit) {
  if (quantity === null || quantity === undefined) return null;
  if (unit === "kg") return { quantity: Number(quantity) * 1000, unit: "g" };
  return { quantity: Number(quantity), unit };
}

export function matchIngredient(ingredient, inventory, pantry = [], diners = 1) {
  const required = Number(ingredient.amount) * Number(diners);
  if (ingredient.pantry || pantry.includes(ingredient.name)) return { ...ingredient, required, status: "satisfied", available: null, missing: 0, pantry: true };
  const item = inventory.find((entry) => entry.id === ingredient.id || entry.name === ingredient.name);
  if (!item) return { ...ingredient, required, status: "insufficient", available: 0, missing: required };
  const need = toBase(required, ingredient.unit);
  const compatible = item.batches.map((batch) => ({ batch, base: toBase(batch.quantity, batch.unit) })).filter(({ base, batch }) => base === null || base.unit === need.unit || batch.precision === "unknown");
  if (!compatible.length) return { ...ingredient, required, status: "unknown", available: null, missing: required, itemId: item.id };
  const hasUnknown = compatible.some(({ batch, base }) => batch.precision === "unknown" || base === null);
  const hasApproximate = compatible.some(({ batch }) => batch.precision === "approximate");
  const available = compatible.reduce((sum, { base }) => sum + (base?.quantity || 0), 0);
  let status = "insufficient";
  if (available >= need.quantity) status = hasApproximate ? "possible" : "satisfied";
  else if (hasUnknown) status = "unknown";
  else if (hasApproximate && available > 0) status = "possible";
  return { ...ingredient, required, status, available, missing: Math.max(0, need.quantity - available), itemId: item.id, hasExpiring: item.batches.some((batch) => batch.useSoon) };
}

export function evaluateRecipe(recipe, document) {
  const diners = Number(document.conditions.diners || 1);
  const ingredients = recipe.ingredients.map((ingredient) => matchIngredient(ingredient, document.inventory, document.pantry, diners));
  const overall = ingredients.reduce((worst, ingredient) => STATUS_RANK[ingredient.status] > STATUS_RANK[worst] ? ingredient.status : worst, "satisfied");
  const missingCost = ingredients.reduce((sum, ingredient) => sum + (ingredient.status === "insufficient" ? ingredient.missing * Number(ingredient.pricePerUnit || 0) : 0), 0);
  const expiring = ingredients.filter((ingredient) => ingredient.hasExpiring).map((ingredient) => ingredient.name);
  const reason = expiring.length
    ? `优先使用临期的${expiring.join("、")}，库存核对结果为“${statusLabels[overall]}”。`
    : `符合本次用餐条件，主要食材库存核对结果为“${statusLabels[overall]}”。`;
  return { recipe, diners, ingredients, status: overall, missingCost: Math.round(missingCost * 10) / 10, reason };
}

export function getCandidates(recipes, document) {
  const c = document.conditions;
  return recipes
    .filter((recipe) => c.cuisine === "any" || recipe.cuisine === c.cuisine)
    .filter((recipe) => c.diet !== "vegetarian" || recipe.diet === "vegetarian")
    .filter((recipe) => c.spice === "hot" || recipe.spice !== "hot")
    .filter((recipe) => recipe.minutes <= Number(c.maxMinutes || 45))
    .filter((recipe) => recipe.formats.includes(c.format))
    .map((recipe) => evaluateRecipe(recipe, document))
    .filter((candidate) => c.stockMode === "topup" ? candidate.missingCost <= Number(c.topUpBudget || 0) : candidate.status !== "insufficient");
}

export function pickRecommendation(recipes, document, random = Math.random) {
  const candidates = getCandidates(recipes, document);
  if (!candidates.length) return { candidate: null, candidates, message: "当前条件下没有合适结果。可以放宽菜系或时间，允许少量补买，或先补充库存数量。" };
  const recent = document.session?.recentRecipeIds || [];
  const weights = candidates.map((candidate) => {
    const statusWeight = { satisfied: 7, possible: 5, unknown: 4, insufficient: 2 }[candidate.status];
    const expiringBonus = candidate.ingredients.some((ingredient) => ingredient.hasExpiring) ? 5 : 0;
    const repeatPenalty = recent.includes(candidate.recipe.id) ? .25 : 1;
    return Math.max(.1, (statusWeight + expiringBonus) * repeatPenalty);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.min(.999999, Math.max(0, Number(random()))) * total;
  let index = 0;
  for (; index < weights.length - 1; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) break;
  }
  return { candidate: candidates[index], candidates, message: "" };
}
