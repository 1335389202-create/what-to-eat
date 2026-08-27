import assert from "node:assert/strict";
import { BACKUP_KEY, SCHEMA_VERSION, STORAGE_KEY, createDefaultDocument, createStore } from "../src/storage.js";

function memoryStorage({ failReads = false, failSetKeys = [] } = {}) {
  const values = new Map();
  const failingKeys = new Set(failSetKeys);
  return {
    getItem(key) {
      if (failReads) throw new Error("read denied");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (failingKeys.has(key)) throw new Error("write denied: " + key);
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
    seed: (key, value) => values.set(key, String(value)),
    read: (key) => values.get(key),
    failKey: (key) => failingKeys.add(key)
  };
}

function v1Fixture() {
  return {
    schemaVersion: 1,
    inventory: [{
      id: "tomato", name: "西红柿", category: "蔬菜",
      batches: [
        { id: "T-01", quantity: 180, unit: "g", precision: "exact", expiresOn: "2026-08-22", useSoon: true },
        { id: "T-02", quantity: 220, unit: "g", precision: "exact", expiresOn: null, useSoon: false }
      ]
    }],
    pantry: ["盐"],
    conditions: { diners: 1, meal: "dinner", format: "regular", stockMode: "strict", cuisine: "any", diet: "any", spice: "mild", maxMinutes: 45, topUpBudget: 10 },
    preferences: { reduceMotion: true },
    session: {
      lastRecipeId: "tomato-egg-rice", recentRecipeIds: ["tomato-egg-rice"],
      pendingDeduction: {
        recipeId: "tomato-egg-rice", recipeTitle: "番茄炒蛋配米饭", diners: 1,
        createdAt: "2026-08-20T10:00:00.000Z",
        items: [{ key: "tomato:T-01", itemId: "tomato", batchId: "T-01", name: "西红柿", amount: 150, unit: "g", max: 180, precision: "exact", useSoon: true, skip: false }]
      },
      lastCompletedAt: null, lastCompletedRecipeTitle: null, lastDeductionSummary: []
    },
    updatedAt: "2026-08-20T10:00:00.000Z"
  };
}

const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

check("首次加载写入 Schema v2 演示数据", () => {
  const storage = memoryStorage();
  const loaded = createStore(storage).load();
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(loaded.status, "initialized");
  assert.equal(loaded.document.schemaVersion, 2);
  assert.ok(storage.read(STORAGE_KEY));
  assert.ok(loaded.document.inventory.every((item) => item.batches.every((batch) => Object.hasOwn(batch, "purchasedOn"))));
  assert.ok(loaded.document.inventory.every((item) => item.batches.every((batch) => !Object.hasOwn(batch, "expiresOn") && !Object.hasOwn(batch, "useSoon"))));
});

check("Schema v2 更新后可重新加载", () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.load();
  const updated = store.update((draft) => { draft.inventory[0].name = "测试西红柿"; draft.conditions.diners = 2; });
  assert.equal(updated.ok, true);
  const reloaded = createStore(storage).load();
  assert.equal(reloaded.status, "ready");
  assert.equal(reloaded.document.inventory[0].name, "测试西红柿");
  assert.equal(reloaded.document.conditions.diners, 2);
});

check("Schema v1 无损迁移并备份原始 payload", () => {
  const storage = memoryStorage();
  const raw = JSON.stringify(v1Fixture());
  storage.seed(STORAGE_KEY, raw);
  const loaded = createStore(storage, { now: () => new Date("2026-08-26T08:00:00+08:00") }).load();
  assert.equal(loaded.status, "migrated");
  assert.equal(loaded.document.schemaVersion, 2);
  assert.equal(storage.read(BACKUP_KEY), raw);
  const first = loaded.document.inventory[0].batches[0];
  assert.equal(first.purchasedOn, null);
  assert.deepEqual(first.legacy, { expiresOn: "2026-08-22", useSoon: true });
  assert.deepEqual(loaded.document.inventory[0].batches[1].legacy, { expiresOn: null, useSoon: false });
  assert.equal(loaded.document.session.pendingDeduction.items[0].amount, 150);
  assert.equal(loaded.document.session.pendingDeduction.migrationReviewRequired, true);
  assert.deepEqual(loaded.document.session.pendingDeduction.items[0].legacy, { useSoon: true });
  assert.equal(loaded.document.migration.fromSchemaVersion, 1);
  assert.equal(loaded.document.migration.upgradeNoticeAcknowledged, false);
});

check("迁移不从旧字段推断购买日期", () => {
  const storage = memoryStorage();
  const legacy = v1Fixture();
  legacy.inventory[0].batches[0].expiresOn = "2026-08-26";
  storage.seed(STORAGE_KEY, JSON.stringify(legacy));
  assert.equal(createStore(storage).load().document.inventory[0].batches[0].purchasedOn, null);
});

check("Schema v2 二次加载幂等", () => {
  const storage = memoryStorage();
  const raw = JSON.stringify(v1Fixture());
  storage.seed(STORAGE_KEY, raw);
  const first = createStore(storage).load();
  const primary = storage.read(STORAGE_KEY);
  const second = createStore(storage).load();
  assert.equal(first.status, "migrated");
  assert.equal(second.status, "ready");
  assert.equal(storage.read(STORAGE_KEY), primary);
  assert.equal(storage.read(BACKUP_KEY), raw);
  assert.deepEqual(second.document.inventory[0].batches[0].legacy, { expiresOn: "2026-08-22", useSoon: true });
});

check("损坏 JSON 与迁移失败区分且不覆盖主 key", () => {
  const storage = memoryStorage();
  const raw = "{broken-json";
  storage.seed(STORAGE_KEY, raw);
  const loaded = createStore(storage).load();
  assert.equal(loaded.status, "damaged");
  assert.equal(loaded.errorKind, "invalid-json");
  assert.equal(loaded.document, null);
  assert.equal(storage.read(STORAGE_KEY), raw);
});

check("结构损坏的 v1 不自动重置", () => {
  const storage = memoryStorage();
  const raw = JSON.stringify({ schemaVersion: 1, inventory: "broken" });
  storage.seed(STORAGE_KEY, raw);
  const loaded = createStore(storage).load();
  assert.equal(loaded.status, "damaged");
  assert.equal(loaded.errorKind, "invalid-schema");
  assert.equal(storage.read(STORAGE_KEY), raw);
});

check("Migration failure 保留原始主 key", () => {
  const storage = memoryStorage();
  const raw = JSON.stringify(v1Fixture());
  storage.seed(STORAGE_KEY, raw);
  const loaded = createStore(storage, { migrateDocument: () => { throw new Error("migration failed"); } }).load();
  assert.equal(loaded.status, "migration-failed");
  assert.equal(loaded.errorKind, "migration-failed");
  assert.equal(loaded.document, null);
  assert.equal(storage.read(STORAGE_KEY), raw);
});

check("备份写入失败不触碰主 key", () => {
  const storage = memoryStorage({ failSetKeys: [BACKUP_KEY] });
  const raw = JSON.stringify(v1Fixture());
  storage.seed(STORAGE_KEY, raw);
  const loaded = createStore(storage).load();
  assert.equal(loaded.status, "write-failed");
  assert.equal(loaded.errorKind, "backup-write-failed");
  assert.equal(storage.read(STORAGE_KEY), raw);
});

check("主 key 写入失败保留原始 payload", () => {
  const storage = memoryStorage({ failSetKeys: [STORAGE_KEY] });
  const raw = JSON.stringify(v1Fixture());
  storage.seed(STORAGE_KEY, raw);
  const loaded = createStore(storage).load();
  assert.equal(loaded.status, "write-failed");
  assert.equal(loaded.errorKind, "primary-write-failed");
  assert.equal(storage.read(STORAGE_KEY), raw);
  assert.equal(storage.read(BACKUP_KEY), raw);
});

check("Storage read failure 独立呈现", () => {
  const loaded = createStore(memoryStorage({ failReads: true })).load();
  assert.equal(loaded.status, "read-failed");
  assert.equal(loaded.errorKind, "storage-read-failed");
  assert.equal(loaded.document, null);
});

check("普通更新写入失败保留提交前内存状态", () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.load();
  const before = store.snapshot();
  storage.failKey(STORAGE_KEY);
  const failed = store.update((draft) => { draft.inventory = []; });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.document, before);
  assert.deepEqual(store.snapshot(), before);
});

check("显式 reset 清除迁移备份并恢复 Schema v2", () => {
  const storage = memoryStorage();
  const raw = JSON.stringify(v1Fixture());
  storage.seed(STORAGE_KEY, raw);
  const store = createStore(storage);
  store.load();
  assert.equal(storage.read(BACKUP_KEY), raw);
  const reset = store.reset();
  assert.equal(reset.schemaVersion, 2);
  assert.equal(storage.read(BACKUP_KEY), undefined);
  assert.equal(JSON.parse(storage.read(STORAGE_KEY)).schemaVersion, 2);
});

check("默认演示日期相对初始化日稳定生成", () => {
  const document = createDefaultDocument(new Date(2026, 7, 26, 12));
  const batches = Object.fromEntries(document.inventory.flatMap((item) => item.batches.map((batch) => [batch.id, batch])));
  assert.equal(batches["T-01"].purchasedOn, "2026-08-20");
  assert.equal(batches["T-02"].purchasedOn, "2026-08-24");
  assert.equal(batches["G-01"].purchasedOn, "2026-08-21");
  assert.equal(batches["P-01"].purchasedOn, "2026-08-18");
  assert.equal(batches["R-01"].purchasedOn, null);
});

console.log(JSON.stringify({ passed: checks.length, total: checks.length, checks }, null, 2));
