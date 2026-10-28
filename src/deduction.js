"use strict";

import { compareBatchesByPurchaseDate, localTodayKey } from "./purchase-age.js";

const clone = (value) => structuredClone(value);

function baseQuantity(quantity, unit) {
  if (quantity === null) return null;
  if (unit === "kg") return { quantity: Number(quantity) * 1000, unit: "g", factor: 1000 };
  return { quantity: Number(quantity), unit, factor: 1 };
}

function orderedBatches(batches, todayKey) {
  return batches
    .map((batch, originalIndex) => ({ batch, originalIndex }))
    .sort((left, right) =>
      compareBatchesByPurchaseDate(left.batch, right.batch, todayKey) ||
      left.originalIndex - right.originalIndex
    )
    .map(({ batch }) => batch);
}

export function buildDeduction(candidate, inventory, todayKey = localTodayKey()) {
  const items = [];
  for (const need of candidate.ingredients.filter((ingredient) => !ingredient.pantry)) {
    const inventoryItem = inventory.find((item) => item.id === need.itemId || item.id === need.id || item.name === need.name);
    if (!inventoryItem) continue;
    let remaining = Number(need.required);
    const batches = orderedBatches(inventoryItem.batches, todayKey);
    for (const batch of batches) {
      const available = baseQuantity(batch.quantity, batch.unit);
      if (!available || available.unit !== need.unit || available.quantity <= 0 || remaining <= 0) continue;
      const amountBase = Math.min(remaining, available.quantity);
      items.push({
        key: inventoryItem.id + ":" + batch.id,
        ingredientId: need.id,
        itemId: inventoryItem.id,
        batchId: batch.id,
        name: need.name,
        amount: Math.round((amountBase / available.factor) * 100) / 100,
        unit: batch.unit,
        max: Number(batch.quantity),
        precision: batch.precision,
        purchasedOn: batch.purchasedOn ?? null,
        skip: false
      });
      remaining -= amountBase;
    }
    if (remaining > 0 && batches.some((batch) => batch.quantity === null)) {
      const batch = batches.find((entry) => entry.quantity === null);
      items.push({
        key: inventoryItem.id + ":" + batch.id,
        ingredientId: need.id,
        itemId: inventoryItem.id,
        batchId: batch.id,
        name: need.name,
        amount: 0,
        unit: batch.unit,
        max: null,
        precision: "unknown",
        purchasedOn: batch.purchasedOn ?? null,
        skip: true
      });
    }
  }
  return {
    recipeId: candidate.recipe.id,
    recipeTitle: candidate.title || candidate.recipe.title,
    diners: candidate.diners,
    createdAt: new Date().toISOString(),
    items
  };
}

export function applyDeduction(document, deduction) {
  const next = clone(document);
  for (const edit of deduction.items) {
    if (edit.skip) continue;
    const amount = Number(edit.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new TypeError(edit.name + "的扣减数量无效");
    const item = next.inventory.find((entry) => entry.id === edit.itemId);
    const batch = item?.batches.find((entry) => entry.id === edit.batchId);
    if (!item || !batch) throw new Error(edit.name + "的库存批次已变化");
    if (batch.quantity === null) throw new Error(edit.name + "的批次数量未知，请先跳过或补充数量");
    if (batch.unit !== edit.unit) throw new Error(edit.name + "的单位已变化");
    if (amount > Number(batch.quantity)) throw new Error(edit.name + "的扣减数量超过当前库存");
    batch.quantity = Math.round((Number(batch.quantity) - amount) * 100) / 100;
  }
  next.inventory = next.inventory
    .map((item) => ({ ...item, batches: item.batches.filter((batch) => batch.quantity !== 0) }))
    .filter((item) => item.batches.length > 0);
  return next;
}

export function adjustInventoryBatch(document, { itemId, batchId, action, amount }) {
  const next = clone(document);
  const item = next.inventory.find((entry) => entry.id === itemId);
  const batch = item?.batches.find((entry) => entry.id === batchId);
  if (!batch) throw new Error("库存批次已变化，请重新打开库存。");
  if (action === "deduct") {
    const quantity = Number(amount);
    if (batch.quantity === null) throw new Error("数量未知的批次不能直接扣减，请先编辑数量。");
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(batch.quantity) || Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-8) throw new TypeError("扣减量须大于 0、不超过库存，且最多保留两位小数。");
    batch.quantity = Math.round((Number(batch.quantity) - quantity) * 100) / 100;
  } else if (action !== "delete") {
    throw new TypeError("未知的库存操作。");
  }
  if (action === "delete" || batch.quantity === 0) item.batches = item.batches.filter((entry) => entry.id !== batchId);
  next.inventory = next.inventory.filter((entry) => entry.batches.length);
  return next;
}
