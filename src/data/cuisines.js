"use strict";

export const cuisines = [
  { id: "korean", emoji: "🇰🇷", name: "韩餐", description: "烤肉、拌饭或热汤，适合想吃点有层次的时候。", tastes: ["rich", "spicy"], moods: ["meal", "treat"] },
  { id: "thai", emoji: "🇹🇭", name: "泰餐", description: "酸、辣、香一起打开胃口，今天来点明快的。", tastes: ["spicy", "rich"], moods: ["meal", "treat"] },
  { id: "sichuan", emoji: "🌶️", name: "川菜", description: "麻辣鲜香，适合想把这一顿吃得痛快。", tastes: ["spicy", "rich"], moods: ["meal", "treat"] },
  { id: "hunan", emoji: "🌶️", name: "湘菜", description: "香辣直接、很下饭，适合需要一点满足感。", tastes: ["spicy", "rich"], moods: ["meal"] },
  { id: "cantonese", emoji: "🥢", name: "粤菜", description: "清鲜舒服，想认真吃饭又不想太有负担。", tastes: ["light"], moods: ["meal", "treat"] },
  { id: "hotpot", emoji: "🍲", name: "火锅", description: "热乎、满足，适合今天不想纠结的时候。", tastes: ["spicy", "rich"], moods: ["meal", "treat"] },
  { id: "homestyle", emoji: "🍳", name: "小炒 / 家常菜", description: "熟悉、踏实，是大多数时候都不会出错的一顿。", tastes: ["light", "rich"], moods: ["casual", "meal"] },
  { id: "convenience", emoji: "🏪", name: "便利店", description: "快速组合一顿，适合今天只想随便吃点。", tastes: ["light", "rich"], moods: ["casual"] },
  { id: "lightmeal", emoji: "🥗", name: "轻食", description: "清爽简单，给忙碌的一天留一点轻盈。", tastes: ["light"], moods: ["casual", "meal"] },
  { id: "japanese", emoji: "🍣", name: "日料", description: "寿司、丼饭或定食，换一种清爽的节奏。", tastes: ["light", "rich"], moods: ["meal", "treat"] },
  { id: "noodles", emoji: "🍜", name: "粉面", description: "一碗热汤面或米粉，简单又管饱。", tastes: ["light", "spicy", "rich"], moods: ["casual", "meal"] },
  { id: "dumplings", emoji: "🥟", name: "饺子 / 馄饨", description: "有主食也有馅料，适合踏实吃一顿。", tastes: ["light", "rich"], moods: ["casual", "meal"] },
  { id: "bbq", emoji: "🍢", name: "烧烤", description: "香气十足，适合想吃得热闹一点。", tastes: ["spicy", "rich"], moods: ["meal", "treat"] },
  { id: "malatang", emoji: "🥘", name: "麻辣烫", description: "自己搭配食材，热乎又有变化。", tastes: ["spicy", "rich"], moods: ["casual", "meal"] },
  { id: "western", emoji: "🍝", name: "西式简餐", description: "意面、三明治或沙拉，换个口味。", tastes: ["light", "rich"], moods: ["casual", "meal"] },
  { id: "pizza", emoji: "🍕", name: "披萨", description: "轻松分享的一餐，适合想吃点满足的。", tastes: ["rich"], moods: ["meal", "treat"] },
  { id: "claypot", emoji: "🫕", name: "砂锅 / 煲仔饭", description: "热气腾腾，适合慢慢吃一顿。", tastes: ["rich", "light"], moods: ["meal"] }
];

export function getCuisineCandidates(options = {}, source = cuisines) {
  const selectedIds = Array.isArray(options.selectedIds) ? options.selectedIds : [];
  const selected = selectedIds.length ? source.filter((item) => selectedIds.includes(item.id)) : source;
  const byTaste = options.taste && options.taste !== "any" ? selected.filter((item) => item.tastes.includes(options.taste)) : selected;
  const byMood = options.mood ? byTaste.filter((item) => item.moods.includes(options.mood)) : byTaste;
  return byMood.length ? byMood : byTaste.length ? byTaste : selected;
}

export function pickCuisine(options = {}, random = Math.random, source = cuisines) {
  const candidates = getCuisineCandidates(options, source);
  if (!candidates.length) return { cuisine: null, candidates: [] };
  const index = Math.floor(Math.min(.999999, Math.max(0, Number(random()))) * candidates.length);
  return { cuisine: candidates[index], candidates };
}
