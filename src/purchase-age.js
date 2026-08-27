"use strict";

const DAY_BONUS = { normal: 0, prioritize: 2, "long-held": 3, unknown: 0 };

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function calendarOrdinal(year, month, day) {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

export function localTodayKey(clock = new Date()) {
  if (!(clock instanceof Date) || Number.isNaN(clock.getTime())) throw new TypeError("当前日期无效");
  const year = String(clock.getFullYear()).padStart(4, "0");
  const month = String(clock.getMonth() + 1).padStart(2, "0");
  const day = String(clock.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function parseLocalDateKey(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { key: value, year, month, day, ordinal: calendarOrdinal(year, month, day) };
}

export function derivePurchaseAge(purchasedOn, todayKey = localTodayKey()) {
  if (purchasedOn === null || purchasedOn === undefined || purchasedOn === "") {
    return { purchasedOn: null, days: null, status: "unknown", reason: "missing" };
  }
  const purchased = parseLocalDateKey(purchasedOn);
  if (!purchased) return { purchasedOn: null, days: null, status: "unknown", reason: "invalid" };
  const today = parseLocalDateKey(todayKey);
  if (!today) throw new TypeError("用于计算购买时长的本地日期无效");
  const days = today.ordinal - purchased.ordinal;
  if (days < 0) return { purchasedOn: purchased.key, days: null, status: "unknown", reason: "future" };
  if (days >= 7) return { purchasedOn: purchased.key, days, status: "long-held", reason: "known" };
  if (days >= 5) return { purchasedOn: purchased.key, days, status: "prioritize", reason: "known" };
  return { purchasedOn: purchased.key, days, status: "normal", reason: "known" };
}

export function purchaseAgeBonus(result) {
  return DAY_BONUS[result?.status] ?? 0;
}

export function purchaseAgeText(result) {
  if (!result || result.status === "unknown") {
    return result?.reason === "future" || result?.reason === "invalid"
      ? "购买日期异常 · 请检查"
      : "购买时间未知";
  }
  if (result.days === 0) return "今天购买";
  if (result.status === "prioritize") return "已购买 " + result.days + " 天 · 建议优先使用";
  if (result.status === "long-held") return "已购买 " + result.days + " 天 · 已购买较久";
  return "已购买 " + result.days + " 天";
}

export function purchaseAgeSafetyText(result) {
  return result?.status === "long-held" ? "使用前请自行确认食材状态" : "";
}

export function compareBatchesByPurchaseDate(a, b, todayKey = localTodayKey()) {
  const left = derivePurchaseAge(a?.purchasedOn, todayKey);
  const right = derivePurchaseAge(b?.purchasedOn, todayKey);
  const leftKnown = left.days !== null;
  const rightKnown = right.days !== null;
  if (leftKnown && rightKnown) return left.purchasedOn.localeCompare(right.purchasedOn);
  if (leftKnown) return -1;
  if (rightKnown) return 1;
  return 0;
}
