import assert from "node:assert/strict";
import {
  compareBatchesByPurchaseDate,
  derivePurchaseAge,
  localTodayKey,
  parseLocalDateKey,
  purchaseAgeBonus,
  purchaseAgeSafetyText,
  purchaseAgeText
} from "../src/purchase-age.js";

const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
const today = "2026-08-26";

const expected = [
  ["2026-08-26", 0, "normal", 0],
  ["2026-08-22", 4, "normal", 0],
  ["2026-08-21", 5, "prioritize", 2],
  ["2026-08-20", 6, "prioritize", 2],
  ["2026-08-19", 7, "long-held", 3],
  ["2026-08-10", 16, "long-held", 3]
];
for (const [purchasedOn, days, status, bonus] of expected) {
  check(days + " 天购买时长边界", () => {
    const result = derivePurchaseAge(purchasedOn, today);
    assert.equal(result.days, days);
    assert.equal(result.status, status);
    assert.equal(purchaseAgeBonus(result), bonus);
  });
}

check("当天与普通状态文案", () => {
  assert.equal(purchaseAgeText(derivePurchaseAge(today, today)), "今天购买");
  assert.equal(purchaseAgeText(derivePurchaseAge("2026-08-23", today)), "已购买 3 天");
});

check("建议优先与较久状态文案", () => {
  assert.equal(purchaseAgeText(derivePurchaseAge("2026-08-21", today)), "已购买 5 天 · 建议优先使用");
  assert.equal(purchaseAgeText(derivePurchaseAge("2026-08-18", today)), "已购买 8 天 · 已购买较久");
  assert.equal(purchaseAgeSafetyText(derivePurchaseAge("2026-08-18", today)), "使用前请自行确认食材状态");
});

check("未知日期不加权", () => {
  const result = derivePurchaseAge(null, today);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "missing");
  assert.equal(result.days, null);
  assert.equal(purchaseAgeBonus(result), 0);
  assert.equal(purchaseAgeText(result), "购买时间未知");
});

check("无效日期不加权并提示检查", () => {
  const result = derivePurchaseAge("2026-02-30", today);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "invalid");
  assert.equal(result.days, null);
  assert.equal(purchaseAgeBonus(result), 0);
  assert.equal(purchaseAgeText(result), "购买日期异常 · 请检查");
});

check("未来日期不产生负天数或权重", () => {
  const result = derivePurchaseAge("2026-08-27", today);
  assert.equal(result.status, "unknown");
  assert.equal(result.reason, "future");
  assert.equal(result.days, null);
  assert.equal(purchaseAgeBonus(result), 0);
  assert.equal(purchaseAgeText(result), "购买日期异常 · 请检查");
});

check("跨月按自然日计算", () => {
  assert.equal(derivePurchaseAge("2026-07-31", "2026-08-02").days, 2);
});

check("跨年按自然日计算", () => {
  assert.equal(derivePurchaseAge("2025-12-31", "2026-01-01").days, 1);
});

check("闰年按日历日计算", () => {
  assert.equal(derivePurchaseAge("2024-02-28", "2024-03-01").days, 2);
});

check("日期解析严格 round-trip", () => {
  assert.equal(parseLocalDateKey("2026-08-26").key, "2026-08-26");
  assert.equal(parseLocalDateKey("2026-8-26"), null);
  assert.equal(parseLocalDateKey("not-a-date"), null);
});

check("本地午夜边界使用本地日期组件", () => {
  assert.equal(localTodayKey(new Date(2026, 7, 25, 23, 59, 59)), "2026-08-25");
  assert.equal(localTodayKey(new Date(2026, 7, 26, 0, 0, 1)), "2026-08-26");
});

check("批次按已知日期升序且未知在后", () => {
  const batches = [
    { id: "unknown", purchasedOn: null },
    { id: "newer", purchasedOn: "2026-08-24" },
    { id: "older", purchasedOn: "2026-08-20" },
    { id: "future", purchasedOn: "2026-08-27" }
  ];
  assert.deepEqual([...batches].sort((a, b) => compareBatchesByPurchaseDate(a, b, today)).map((item) => item.id), ["older", "newer", "unknown", "future"]);
});

check("同日期与未知 comparator 保持稳定", () => {
  assert.equal(compareBatchesByPurchaseDate({ purchasedOn: "2026-08-20" }, { purchasedOn: "2026-08-20" }, today), 0);
  assert.equal(compareBatchesByPurchaseDate({ purchasedOn: null }, { purchasedOn: "bad" }, today), 0);
});

console.log(JSON.stringify({ passed: checks.length, total: checks.length, checks }, null, 2));
