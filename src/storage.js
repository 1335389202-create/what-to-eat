"use strict";

export const STORAGE_KEY = "what-to-eat.portfolio.v1";
export const BACKUP_KEY = "what-to-eat.portfolio.backup.schema-v1";
export const SCHEMA_VERSION = 2;

const clone = (value) => structuredClone(value);

function localDateDaysAgo(now, daysAgo) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function createDefaultDocument(now = new Date()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    inventory: [
      { id: "tomato", name: "西红柿", category: "蔬菜", batches: [
        { id: "T-01", quantity: 180, unit: "g", precision: "exact", purchasedOn: localDateDaysAgo(now, 6) },
        { id: "T-02", quantity: 220, unit: "g", precision: "exact", purchasedOn: localDateDaysAgo(now, 2) }
      ] },
      { id: "egg", name: "鸡蛋", category: "蛋奶", batches: [{ id: "E-01", quantity: 4, unit: "个", precision: "exact", purchasedOn: localDateDaysAgo(now, 3) }] },
      { id: "rice", name: "大米", category: "主食", batches: [{ id: "R-01", quantity: 200, unit: "g", precision: "exact", purchasedOn: null }] },
      { id: "greens", name: "青菜", category: "蔬菜", batches: [{ id: "G-01", quantity: 1, unit: "把", precision: "approximate", purchasedOn: localDateDaysAgo(now, 5) }] },
      { id: "chicken", name: "鸡胸肉", category: "肉类", batches: [{ id: "C-01", quantity: null, unit: "g", precision: "unknown", purchasedOn: localDateDaysAgo(now, 1) }] },
      { id: "potato", name: "土豆", category: "蔬菜", batches: [{ id: "P-01", quantity: 100, unit: "g", precision: "exact", purchasedOn: localDateDaysAgo(now, 8) }] }
    ],
    pantry: ["食用油", "盐", "生抽"],
    conditions: { diners: 1, meal: "dinner", format: "regular", stockMode: "strict", cuisine: "any", diet: "any", spice: "mild", maxMinutes: 45, topUpBudget: 10 },
    preferences: { reduceMotion: false },
    session: { lastRecipeId: null, recentRecipeIds: [], pendingDeduction: null, lastCompletedAt: null, lastCompletedRecipeTitle: null, lastDeductionSummary: [] },
    updatedAt: now.toISOString()
  };
}

function hasValidQuantity(batch) {
  return batch.quantity === null || Number.isFinite(Number(batch.quantity));
}

function isBatchV1(batch) {
  return Boolean(batch && typeof batch.id === "string" && hasValidQuantity(batch) && typeof batch.unit === "string" && ["exact", "approximate", "unknown"].includes(batch.precision));
}

function isBatchV2(batch) {
  return Boolean(isBatchV1(batch) && (batch.purchasedOn === undefined || batch.purchasedOn === null || typeof batch.purchasedOn === "string") && (batch.legacy === undefined || (batch.legacy && typeof batch.legacy === "object")));
}

function hasDocumentShape(value, batchValidator) {
  return Boolean(value && Array.isArray(value.inventory) && value.inventory.every((item) =>
    item && typeof item.id === "string" && typeof item.name === "string" &&
    Array.isArray(item.batches) && item.batches.every(batchValidator)
  ) && value.conditions && [1, 2, 4].includes(Number(value.conditions.diners)) && value.session);
}

function isValidV1Document(value) {
  return Boolean(value && value.schemaVersion === 1 && hasDocumentShape(value, isBatchV1));
}

export function isValidDocument(value) {
  return Boolean(value && value.schemaVersion === SCHEMA_VERSION && hasDocumentShape(value, isBatchV2));
}

export function migrateV1ToV2(value, migratedAt = new Date().toISOString()) {
  if (!isValidV1Document(value)) throw new TypeError("Schema v1 数据结构无效");
  const next = clone(value);
  next.schemaVersion = SCHEMA_VERSION;
  next.inventory = next.inventory.map((item) => ({
    ...item,
    batches: item.batches.map((batch) => {
      const { expiresOn = null, useSoon = false, ...active } = batch;
      return {
        ...active,
        purchasedOn: null,
        legacy: { expiresOn, useSoon: Boolean(useSoon) }
      };
    })
  }));
  if (next.session.pendingDeduction) {
    next.session.pendingDeduction = {
      ...next.session.pendingDeduction,
      migrationReviewRequired: true,
      items: next.session.pendingDeduction.items.map((item) => {
        const { useSoon = false, ...active } = item;
        return { ...active, legacy: { useSoon: Boolean(useSoon) } };
      })
    };
  }
  next.migration = {
    fromSchemaVersion: 1,
    migratedAt,
    upgradeNoticeAcknowledged: false
  };
  if (!isValidDocument(next)) throw new TypeError("迁移后的 Schema v2 数据结构无效");
  return next;
}

function loadResult(status, document, errorKind = null, error = null, details = {}) {
  return {
    status,
    document: document ? clone(document) : null,
    errorKind,
    error,
    migrated: status === "migrated",
    recovered: false,
    ...details
  };
}

export function createStore(storage = globalThis.localStorage, {
  now = () => new Date(),
  migrateDocument = (value, timestamp) => migrateV1ToV2(value, timestamp)
} = {}) {
  let current = null;
  let blockedResult = null;

  function persist(next) {
    const candidate = clone(next);
    candidate.schemaVersion = SCHEMA_VERSION;
    candidate.updatedAt = now().toISOString();
    if (!isValidDocument(candidate)) throw new TypeError("本地数据结构无效");
    storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    current = candidate;
    blockedResult = null;
    return clone(current);
  }

  function blocked(status, errorKind, error, details = {}) {
    current = null;
    blockedResult = loadResult(status, null, errorKind, error, details);
    return blockedResult;
  }

  function rollbackPrimary(raw) {
    try {
      storage.setItem(STORAGE_KEY, raw);
      return storage.getItem(STORAGE_KEY) === raw;
    } catch {
      return false;
    }
  }

  function load() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      return blocked("read-failed", "storage-read-failed", error);
    }

    if (!raw) {
      try {
        const document = persist(createDefaultDocument(now()));
        return loadResult("initialized", document);
      } catch (error) {
        return blocked("write-failed", "initial-write-failed", error);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return blocked("damaged", "invalid-json", error, { rawPreserved: true });
    }

    if (parsed.schemaVersion === SCHEMA_VERSION) {
      if (!isValidDocument(parsed)) return blocked("damaged", "invalid-schema", new TypeError("Schema v2 数据结构无效"), { rawPreserved: true });
      current = clone(parsed);
      blockedResult = null;
      return loadResult("ready", current);
    }

    if (parsed.schemaVersion !== 1 || !isValidV1Document(parsed)) {
      return blocked("damaged", "invalid-schema", new TypeError("旧版数据结构无效"), { rawPreserved: true });
    }

    try {
      storage.setItem(BACKUP_KEY, raw);
    } catch (error) {
      return blocked("write-failed", "backup-write-failed", error, { rawPreserved: true });
    }

    let migrated;
    let serialized;
    try {
      migrated = migrateDocument(parsed, now().toISOString());
      if (!isValidDocument(migrated)) throw new TypeError("迁移后的数据无法校验");
      serialized = JSON.stringify(migrated);
    } catch (error) {
      return blocked("migration-failed", "migration-failed", error, { rawPreserved: true });
    }

    try {
      storage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      return blocked("write-failed", "primary-write-failed", error, { rawPreserved: true, backupAvailable: true });
    }

    try {
      const readback = JSON.parse(storage.getItem(STORAGE_KEY));
      if (!isValidDocument(readback)) throw new TypeError("Schema v2 回读校验失败");
      current = clone(readback);
      blockedResult = null;
      return loadResult("migrated", current, null, null, { backupAvailable: true });
    } catch (error) {
      const rollbackSucceeded = rollbackPrimary(raw);
      return blocked("write-failed", "primary-readback-failed", error, {
        rawPreserved: rollbackSucceeded,
        backupAvailable: true,
        rollbackSucceeded
      });
    }
  }

  function snapshot() {
    if (current) return clone(current);
    const loaded = load();
    if (!loaded.document) throw loaded.error || new Error("本地数据尚未就绪");
    return loaded.document;
  }

  function update(mutator) {
    let before;
    try {
      before = snapshot();
    } catch (error) {
      return { ok: false, document: null, error, errorKind: blockedResult?.errorKind || "storage-not-ready" };
    }
    const draft = clone(before);
    const returned = mutator(draft);
    const next = returned ?? draft;
    try {
      return { ok: true, document: persist(next), error: null, errorKind: null };
    } catch (error) {
      current = before;
      return { ok: false, document: clone(before), error, errorKind: "storage-write-failed" };
    }
  }

  function reset() {
    const document = persist(createDefaultDocument(now()));
    storage.removeItem(BACKUP_KEY);
    return document;
  }

  return { load, snapshot, update, reset };
}
