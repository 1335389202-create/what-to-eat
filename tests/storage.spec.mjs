import assert from "node:assert/strict";
import { createDefaultDocument, createStore, STORAGE_KEY } from "../src/storage.js";

function memoryStorage({ failWrites = false } = {}) {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { if (failWrites) throw new Error("quota"); values.set(key, String(value)); },
    seed: (key, value) => values.set(key, value),
    read: (key) => values.get(key),
    setFailWrites: (value) => { failWrites = value; }
  };
}

const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

const storage = memoryStorage();
const store = createStore(storage);
const first = store.load();
check("首次加载写入版本化演示数据", () => {
  assert.equal(first.document.schemaVersion, 1);
  assert.equal(first.document.inventory.length, 6);
  assert.ok(storage.read(STORAGE_KEY));
});

const updated = store.update((draft) => { draft.inventory[0].name = "测试西红柿"; draft.conditions.diners = 2; });
check("更新后可由新 Store 重新加载", () => {
  assert.equal(updated.ok, true);
  const reloaded = createStore(storage).load().document;
  assert.equal(reloaded.inventory[0].name, "测试西红柿");
  assert.equal(reloaded.conditions.diners, 2);
});

storage.seed(STORAGE_KEY, "{broken-json");
const recovered = createStore(storage).load();
check("损坏数据恢复为安全演示数据", () => {
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.document.inventory[0].name, "西红柿");
});

const legacy = createDefaultDocument();
legacy.schemaVersion = 0;
storage.seed(STORAGE_KEY, JSON.stringify(legacy));
const migrated = createStore(storage).load();
check("旧版本数据可迁移", () => {
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.document.schemaVersion, 1);
});

const protectedStorage = memoryStorage();
const protectedStore = createStore(protectedStorage);
protectedStore.load();
const before = protectedStore.snapshot();
protectedStorage.setFailWrites(true);
const failed = protectedStore.update((draft) => { draft.inventory = []; });
check("写入失败保留提交前内存状态", () => {
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.document, before);
  assert.deepEqual(protectedStore.snapshot(), before);
});

console.log(JSON.stringify({ passed: checks.length, total: checks.length, checks }, null, 2));
