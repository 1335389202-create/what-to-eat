"use strict";

import {
  derivePurchaseAge,
  localTodayKey,
  purchaseAgeBonus as bonusForPurchaseAge,
  purchaseAgeSafetyText
} from "./purchase-age.js";

const STATUS_RANK = { satisfied: 0, possible: 1, unknown: 2, insufficient: 3 };
const STATUS_WEIGHT = { satisfied: 7, possible: 5, unknown: 4, insufficient: 2 };
export const statusLabels = { satisfied: "满足", possible: "可能满足", insufficient: "不足", unknown: "未知" };

function toBase(quantity, unit) {
  if (quantity === null || quantity === undefined) return null;
  if (unit === "kg") return { quantity: Number(quantity) * 1000, unit: "g" };
  return { quantity: Number(quantity), unit };
}

export function matchIngredient(ingredient, inventory, pantry = [], diners = 1) {
  const required = Number(ingredient.amount) * Number(diners);
  if (ingredient.pantry || pantry.includes(ingredient.name)) {
    return { ...ingredient, required, status: "satisfied", available: null, missing: 0, pantry: true, eligibleBatches: [] };
  }
  const item = inventory.find((entry) => entry.id === ingredient.id || entry.name === ingredient.name);
  if (!item) return { ...ingredient, required, status: "insufficient", available: 0, missing: required, eligibleBatches: [] };
  const need = toBase(required, ingredient.unit);
  const compatible = item.batches
    .map((batch, batchIndex) => ({ batch, batchIndex, base: toBase(batch.quantity, batch.unit) }))
    .filter(({ base, batch }) => base === null || base.unit === need.unit || batch.precision === "unknown");
  if (!compatible.length) {
    return { ...ingredient, required, status: "unknown", available: null, missing: required, itemId: item.id, eligibleBatches: [] };
  }
  const hasUnknown = compatible.some(({ batch, base }) => batch.precision === "unknown" || base === null);
  const hasApproximate = compatible.some(({ batch }) => batch.precision === "approximate");
  const available = compatible.reduce((sum, { base }) => sum + (base?.quantity || 0), 0);
  let status = "insufficient";
  if (available >= need.quantity) status = hasApproximate ? "possible" : "satisfied";
  else if (hasUnknown) status = "unknown";
  else if (hasApproximate && available > 0) status = "possible";
  const eligibleBatches = compatible
    .filter(({ batch, base }) => base && base.unit === need.unit && base.quantity > 0 && batch.precision !== "unknown")
    .map(({ batch, batchIndex }) => ({ ...batch, batchIndex }));
  return {
    ...ingredient,
    required,
    status,
    available,
    missing: Math.max(0, need.quantity - available),
    itemId: item.id,
    eligibleBatches
  };
}

function selectPurchasePriority(ingredients, todayKey) {
  let best = null;
  ingredients.forEach((ingredient, ingredientIndex) => {
    ingredient.eligibleBatches.forEach((batch) => {
      const age = derivePurchaseAge(batch.purchasedOn, todayKey);
      const bonus = bonusForPurchaseAge(age);
      if (!bonus) return;
      const evidence = {
        ingredientId: ingredient.id,
        name: ingredient.name,
        itemId: ingredient.itemId,
        batchId: batch.id,
        batchIndex: batch.batchIndex,
        ingredientIndex,
        purchasedOn: age.purchasedOn,
        days: age.days,
        status: age.status,
        bonus
      };
      if (!best || evidence.bonus > best.bonus || (evidence.bonus === best.bonus && evidence.days > best.days)) {
        best = evidence;
      }
    });
  });
  return best;
}

function recommendationReason(priority, overall) {
  if (!priority) return "符合本次用餐条件，主要食材库存核对结果为“" + statusLabels[overall] + "”。";
  const base = priority.name + "已购买 " + priority.days + " 天，本次优先考虑能够使用它的菜谱。";
  const safety = purchaseAgeSafetyText(priority);
  return safety ? base + safety + "。" : base;
}

export function evaluateRecipe(recipe, document, todayKey = localTodayKey()) {
  const diners = Number(document.conditions.diners || 1);
  const ingredients = recipe.ingredients.map((ingredient) => matchIngredient(ingredient, document.inventory, document.pantry, diners));
  const overall = ingredients.reduce((worst, ingredient) => STATUS_RANK[ingredient.status] > STATUS_RANK[worst] ? ingredient.status : worst, "satisfied");
  const missingCost = ingredients.reduce((sum, ingredient) => sum + (ingredient.status === "insufficient" ? ingredient.missing * Number(ingredient.pricePerUnit || 0) : 0), 0);
  const purchasePriority = selectPurchasePriority(ingredients, todayKey);
  return {
    recipe,
    diners,
    ingredients,
    status: overall,
    missingCost: Math.round(missingCost * 10) / 10,
    purchasePriority,
    purchaseAgeBonus: purchasePriority?.bonus || 0,
    reason: recommendationReason(purchasePriority, overall)
  };
}

export function getCandidates(recipes, document, todayKey = localTodayKey()) {
  const c = document.conditions;
  return recipes
    .filter((recipe) => c.cuisine === "any" || recipe.cuisine === c.cuisine)
    .filter((recipe) => c.diet !== "vegetarian" || recipe.diet === "vegetarian")
    .filter((recipe) => c.spice === "hot" || recipe.spice !== "hot")
    .filter((recipe) => recipe.minutes <= Number(c.maxMinutes || 45))
    .filter((recipe) => recipe.formats.includes(c.format))
    .map((recipe) => evaluateRecipe(recipe, document, todayKey))
    .filter((candidate) => c.stockMode === "topup"
      ? candidate.missingCost <= Number(c.topUpBudget || 0)
      : candidate.status !== "insufficient");
}

function combineIngredients(dishes) {
  const combined = new Map();
  for (const dish of dishes) for (const ingredient of dish.ingredients) {
    const key = `${ingredient.id}:${ingredient.unit}`;
    const existing = combined.get(key);
    if (existing) existing.amount += ingredient.amount;
    else combined.set(key, { ...ingredient });
  }
  return [...combined.values()];
}

export function evaluateMeal(dishes, document, todayKey = localTodayKey()) {
  const primary = dishes[0];
  const combined = { ...primary, ingredients: combineIngredients(dishes) };
  const candidate = evaluateRecipe(combined, document, todayKey);
  return {
    ...candidate,
    recipe: primary,
    dishes,
    title: dishes.map((dish) => dish.title).join(" + "),
    caloriesPerPerson: dishes.reduce((sum, dish) => sum + dish.calories, 0),
    proteinPerPerson: dishes.reduce((sum, dish) => sum + dish.protein, 0),
    minutes: Math.max(...dishes.map((dish) => dish.minutes)) + 5 * (dishes.length - 1)
  };
}

function hasStaple(recipe) {
  return recipe.ingredients.some((item) => ["rice", "pasta", "bread"].includes(item.id));
}

function hasProtein(recipe) {
  return recipe.ingredients.some((item) => ["chicken", "egg", "tofu", "beef", "pork", "fish"].includes(item.id));
}

function mealAllowed(candidate, conditions) {
  return (conditions.stockMode === "topup"
    ? candidate.missingCost <= Number(conditions.topUpBudget || 0)
    : candidate.status !== "insufficient")
    && (!Number(conditions.calorieLimit) || candidate.caloriesPerPerson <= Number(conditions.calorieLimit))
    && candidate.minutes <= Number(conditions.maxMinutes || 45);
}

export function getMealCandidates(recipes, document, todayKey = localTodayKey()) {
  const c = document.conditions;
  if (c.format !== "regular") return getCandidates(recipes, document, todayKey)
    .filter((candidate) => !Number(c.calorieLimit) || candidate.recipe.calories <= Number(c.calorieLimit))
    .map((candidate) => ({ ...candidate, dishes: [candidate.recipe], title: candidate.recipe.title,
      caloriesPerPerson: candidate.recipe.calories, proteinPerPerson: candidate.recipe.protein, minutes: candidate.recipe.minutes }));

  const mains = recipes.filter((recipe) => recipe.formats.includes("regular") && !recipe.role)
    .filter((recipe) => c.cuisine === "any" || recipe.cuisine === c.cuisine)
    .filter((recipe) => c.diet !== "vegetarian" || recipe.diet === "vegetarian")
    .filter((recipe) => c.spice === "hot" || recipe.spice !== "hot");
  const sides = recipes.filter((recipe) => recipe.role &&
    (c.spice === "hot" || recipe.spice !== "hot") &&
    (c.diet !== "vegetarian" || recipe.diet === "vegetarian"));
  const diners = Number(c.diners);
  const minDishes = Math.max(2, diners);
  const maxDishes = diners + 1;
  const plans = [];
  for (const main of mains) {
    for (let mask = 1; mask < 2 ** sides.length; mask += 1) {
      const extras = sides.filter((_, index) => mask & (1 << index));
      const dishes = [main, ...extras];
      if (dishes.length < minDishes || dishes.length > maxDishes) continue;
      if (!extras.some((dish) => dish.role === "vegetable")) continue;
      if (!hasProtein(main) && !extras.some((dish) => dish.role === "protein")) continue;
      if (diners >= 2 && c.diet !== "vegetarian" && main.diet === "vegetarian" && !extras.some((dish) => dish.role === "protein" && dish.diet === "meat")) continue;
      if (!hasStaple(main) && !extras.some((dish) => dish.role === "staple")) continue;
      const candidate = evaluateMeal(dishes, document, todayKey);
      if (mealAllowed(candidate, c)) plans.push(candidate);
    }
  }
  return plans;
}

export function getCandidateWeight(candidate, recentRecipeIds = []) {
  const repeatPenalty = recentRecipeIds.includes(candidate.recipe.id) ? .25 : 1;
  return Math.max(.1, (STATUS_WEIGHT[candidate.status] + candidate.purchaseAgeBonus) * repeatPenalty);
}

export function pickRecommendation(recipes, document, random = Math.random, todayKey = localTodayKey()) {
  const candidates = getMealCandidates(recipes, document, todayKey);
  if (!candidates.length) {
    return { candidate: null, candidates, message: "当前人数、库存或热量上限下没有合适菜单。可以放宽时间或热量上限、允许补买，或先补充库存数量。" };
  }
  const recent = document.session?.recentRecipeIds || [];
  const weights = candidates.map((candidate) => getCandidateWeight(candidate, recent));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.min(.999999, Math.max(0, Number(random()))) * total;
  let index = 0;
  for (; index < weights.length - 1; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) break;
  }
  return { candidate: candidates[index], candidates, message: "" };
}
