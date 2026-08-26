"use strict";

export const STORAGE_KEY = "what-to-eat.portfolio.v1";
export const SCHEMA_VERSION = 1;

const clone = (value) => structuredClone(value);

export function createDefaultDocument() {
  return {
    schemaVersion: SCHEMA_VERSION,
    inventory: [
      { id: "tomato", name: "西红柿", category: "蔬菜", batches: [
        { id: "T-01", quantity: 180, unit: "g", precision: "exact", expiresOn: "2026-08-22", useSoon: true },
        { id: "T-02", quantity: 220, unit: "g", precision: "exact", expiresOn: "2026-08-27", useSoon: false }
      ] },
      { id: "egg", name: "鸡蛋", category: "蛋奶", batches: [{ id: "E-01", quantity: 4, unit: "个", precision: "exact", expiresOn: "2026-08-29", useSoon: false }] },
      { id: "rice", name: "大米", category: "主食", batches: [{ id: "R-01", quantity: 200, unit: "g", precision: "exact", expiresOn: null, useSoon: false }] },
      { id: "greens", name: "青菜", category: "蔬菜", batches: [{ id: "G-01", quantity: 1, unit: "把", precision: "approximate", expiresOn: null, useSoon: false }] },
      { id: "chicken", name: "鸡胸肉", category: "肉类", batches: [{ id: "C-01", quantity: null, unit: "g", precision: "unknown", expiresOn: null, useSoon: false }] },
      { id: "potato", name: "土豆", category: "蔬菜", batches: [{ id: "P-01", quantity: 100, unit: "g", precision: "exact", expiresOn: null, useSoon: false }] }
    ],
    pantry: ["食用油", "盐", "生抽"],
    conditions: { diners: 1, meal: "dinner", format: "regular", stockMode: "strict", cuisine: "any", diet: "any", spice: "mild", maxMinutes: 45, topUpBudget: 10 },
    preferences: { reduceMotion: false },
    session: { lastRecipeId: null, recentRecipeIds: [], pendingDeduction: null, lastCompletedAt: null, lastCompletedRecipeTitle: null, lastDeductionSummary: [] },
    updatedAt: new Date().toISOString()
  };
}

function isBatch(batch) {
  return batch && typeof batch.id === "string" && (batch.quantity === null || Number.isFinite(Number(batch.quantity))) && typeof batch.unit === "string" && ["exact", "approximate", "unknown"].includes(batch.precision);
}

export function isValidDocument(value) {
  return Boolean(value && value.schemaVersion === SCHEMA_VERSION && Array.isArray(value.inventory) && value.inventory.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.batches) && item.batches.every(isBatch)) && value.conditions && [1, 2, 4].includes(Number(value.conditions.diners)) && value.session);
}

function migrate(value) {
  if (!value || typeof value !== "object") return null;
  if (value.schemaVersion === SCHEMA_VERSION) return value;
  if (value.schemaVersion === 0 && Array.isArray(value.inventory)) {
    const next = createDefaultDocument();
    next.inventory = value.inventory;
    if (value.conditions) next.conditions = { ...next.conditions, ...value.conditions };
    return next;
  }
  return null;
}

export function createStore(storage = globalThis.localStorage) {
  let current = null;

  function persist(next) {
    const candidate = clone(next);
    candidate.schemaVersion = SCHEMA_VERSION;
    candidate.updatedAt = new Date().toISOString();
    if (!isValidDocument(candidate)) throw new TypeError("本地数据结构无效");
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    current = candidate;
    return clone(current);
  }

  function load() {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { document: persist(createDefaultDocument()), recovered: false, migrated: false };
    try {
      const parsed = JSON.parse(raw);
      const migrated = migrate(parsed);
      if (!migrated || !isValidDocument(migrated)) throw new TypeError("本地数据无法校验");
      current = clone(migrated);
      if (parsed.schemaVersion !== SCHEMA_VERSION) persist(current);
      return { document: clone(current), recovered: false, migrated: parsed.schemaVersion !== SCHEMA_VERSION };
    } catch {
      const fallback = createDefaultDocument();
      return { document: persist(fallback), recovered: true, migrated: false };
    }
  }

  function snapshot() {
    if (!current) return load().document;
    return clone(current);
  }

  function update(mutator) {
    const before = snapshot();
    const draft = clone(before);
    const returned = mutator(draft);
    const next = returned ?? draft;
    try {
      return { ok: true, document: persist(next), error: null };
    } catch (error) {
      current = before;
      return { ok: false, document: clone(before), error };
    }
  }

  function reset() {
    return persist(createDefaultDocument());
  }

  return { load, snapshot, update, reset };
}
