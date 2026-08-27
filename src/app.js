"use strict";

import { createStore } from "./storage.js";
import { recipes, findRecipe } from "./data/recipes.js";
import { cuisines, getCuisineCandidates, pickCuisine } from "./data/cuisines.js";
import { evaluateRecipe, pickRecommendation, statusLabels } from "./recommender.js";
import { applyDeduction, buildDeduction } from "./deduction.js";
import { derivePurchaseAge, localTodayKey, parseLocalDateKey, purchaseAgeBonus, purchaseAgeSafetyText, purchaseAgeText } from "./purchase-age.js";

const app = document.querySelector("#app");
const liveRegion = document.querySelector("#live-region");
const store = createStore();
let loaded = store.load();
let data = loaded.document;
const state = {
  route: "home",
  overlay: null,
  previousRoute: "home",
  drawTimer: null,
  storageStatus: loaded.status,
  editingIngredientId: null,
  ingredientForm: null,
  conditionsDraft: null,
  dirty: false,
  confirmDiscard: false,
  confirmReset: null,
  returnFocus: null,
  pendingFocus: null,
  recommendation: null,
  eatOut: {
    taste: "any",
    mood: "casual",
    selectedIds: [],
    recommendation: null,
    confirmed: false
  },
  noResultMessage: "",
  pendingDeduction: data?.session.pendingDeduction ? structuredClone(data.session.pendingDeduction) : null,
  commitError: ""
};

function icon(name) {
  const paths = {
    back: '<path d="M15 18l-6-6 6-6"/><path d="M9 12h10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function announce(message) {
  liveRegion.textContent = "";
  requestAnimationFrame(() => { liveRegion.textContent = message; });
}

function header(title, back = null) {
  return `<header class="screen-header">
    ${back ? `<button class="icon-button" type="button" aria-label="返回" data-route="${back}">${icon("back")}</button>` : "<span></span>"}
    <h1 tabindex="-1" data-page-heading>${title}</h1><span></span>
  </header>`;
}

function nav(active) {
  return `<nav class="bottom-nav" aria-label="主要导航">
    <button class="nav-item" type="button" data-route="home" ${active === "home" ? 'aria-current="page"' : ""}>今天</button>
    <button class="nav-item" type="button" data-route="inventory" ${active === "inventory" ? 'aria-current="page"' : ""}>库存</button>
  </nav>`;
}

function action(label, attrs, task = false) {
  return `<div class="fixed-action ${task ? "task" : ""}"><button class="button primary full" type="button" ${attrs}>${label}</button></div>`;
}

function screen({ title, body, back = null, active = null, cta = "" }) {
  return `<section class="screen">${header(title, back)}<div class="screen-body ${active ? "" : "task"}">${body}</div>${cta}${active ? nav(active) : ""}</section>`;
}

function batchAgeView(batch, todayKey = localTodayKey()) {
  const age = derivePurchaseAge(batch?.purchasedOn, todayKey);
  const variant = age.reason === "future" || age.reason === "invalid" ? "future" : age.status;
  return { age, variant, text: purchaseAgeText(age), safety: purchaseAgeSafetyText(age) };
}

function itemAgeView(item, todayKey = localTodayKey()) {
  const views = item.batches.map((batch) => batchAgeView(batch, todayKey));
  return views.find((view) => view.variant === "future")
    || [...views].sort((left, right) => purchaseAgeBonus(right.age) - purchaseAgeBonus(left.age) || (right.age.days ?? -1) - (left.age.days ?? -1))[0]
    || batchAgeView(null, todayKey);
}

function purchaseAgeAlerts(todayKey = localTodayKey()) {
  return data.inventory.flatMap((item) => item.batches
    .filter((batch) => batch.quantity !== null && Number(batch.quantity) > 0 && batch.precision !== "unknown")
    .map((batch) => ({ item, ...batchAgeView(batch, todayKey) }))
    .filter((entry) => purchaseAgeBonus(entry.age) > 0));
}

function purchaseAgeMarkup(view) {
  return `<span class="purchase-age purchase-age-${view.variant}">${view.text}</span>${view.safety ? `<small class="safety-note">${view.safety}</small>` : ""}`;
}

function inventoryRows() {
  const todayKey = localTodayKey();
  return `<ul class="list">${data.inventory.map((item) => {
    const known = item.batches.filter((batch) => batch.quantity !== null);
    const total = known.reduce((sum, batch) => sum + Number(batch.quantity), 0);
    const units = new Set(known.map((batch) => batch.unit));
    const amount = !known.length ? "余量未填" : units.size === 1 ? `${known.some((batch) => batch.precision === "approximate") ? "约 " : ""}${total} ${known[0].unit}` : "单位待确认";
    const note = item.batches.some((batch) => batch.precision === "unknown") ? `${item.batches.length} 个批次 · 数量含未知` : `${item.batches.length} 个批次`;
    const ageView = itemAgeView(item, todayKey);
    return `<li class="list-row inventory-row"><div><strong>${escapeAttribute(item.name)}</strong><small>${amount} · ${note}</small>${purchaseAgeMarkup(ageView)}</div><div class="list-actions"><button class="list-action" type="button" data-edit-ingredient="${escapeAttribute(item.id)}">编辑</button></div></li>`;
  }).join("")}</ul>`;
}

function currentRecommendation() {
  if (state.recommendation) return state.recommendation;
  const recipe = findRecipe(data.session.lastRecipeId);
  return recipe ? evaluateRecipe(recipe, data) : null;
}

function requirementRows(candidate) {
  return `<ul class="list">${candidate.ingredients.filter((ingredient) => !ingredient.pantry).map((ingredient) => `<li class="list-row"><div><strong>${ingredient.name}</strong><small>需要 ${ingredient.required} ${ingredient.unit}</small></div><span class="status status-${ingredient.status}">${statusLabels[ingredient.status]}</span></li>`).join("")}</ul>`;
}

function homeView() {
  const alerts = purchaseAgeAlerts();
  const alertItems = new Set(alerts.map((entry) => entry.item.id));
  const conditions = data.conditions;
  const migrationNotice = data.migration && !data.migration.upgradeNoticeAcknowledged
    ? '<div class="notice migration-notice"><div class="split"><div><strong>本地数据已升级</strong><div class="helper">旧库存已安全迁移；原有批次的购买时间保持未知，可在库存中补充。</div></div><button class="list-action" type="button" data-action="dismiss-migration">知道了</button></div></div>'
    : "";
  return screen({
    title: "今天",
    active: "home",
    body: `<div class="home-intro"><div><p class="eyebrow">欢迎回来</p><h2 class="page-title">把家里的食材，<br>变成今天这一顿。</h2></div><button class="motion-toggle" type="button" data-action="toggle-motion" aria-pressed="${data.preferences.reduceMotion}"><span aria-hidden="true">${data.preferences.reduceMotion ? "◼" : "◉"}</span>${data.preferences.reduceMotion ? "已减少动效" : "标准动效"}</button></div><p class="helper">数据只保存在当前浏览器，刷新后也不会丢失。</p>
      <section class="scene-picker" aria-labelledby="scene-title"><div><p class="eyebrow">双场景决策</p><h2 id="scene-title">先选一个场景</h2><p class="helper">在家做饭，或让盲盒决定出去吃什么。</p></div><div class="scene-actions"><button class="scene-button home-scene" type="button" data-overlay="conditions"><span aria-hidden="true">🏠</span><strong>在家吃</strong><small>从库存到菜谱</small></button><button class="scene-button eat-out-scene" type="button" data-route="eat-out"><span aria-hidden="true">🍽️</span><strong>出去吃</strong><small>抽一个餐饮类型</small></button></div></section>
      <section class="hero-card home-hero"><div class="meal-illustration" aria-hidden="true"><span class="plate"></span><span class="food food-a"></span><span class="food food-b"></span><span class="food food-c"></span></div><div class="split hero-copy"><div><p class="eyebrow">${conditions.meal === "lunch" ? "午餐" : "晚餐"} · ${conditions.diners} 人</p><h2>今天吃什么？</h2></div><span class="status">库存可用</span></div><p>根据购买时长建议优先考虑部分食材，在合格菜谱里留一点随机惊喜。</p><button class="button link" type="button" data-overlay="conditions">调整推荐条件</button></section>
      ${migrationNotice}
      ${data.session.lastCompletedAt ? `<div class="notice success-notice"><strong>最近完成：${data.session.lastCompletedRecipeTitle}</strong><div class="helper">库存已经过确认并更新。</div></div>` : ""}
      <h2 class="section-title">库存提醒</h2><div class="notice"><strong>${alerts.length ? `${alertItems.size} 类食材建议优先考虑` : "暂时没有需要优先考虑的食材"}</strong><div class="helper">依据购买日期提供排序提示，不代表食材安全或保质判断；制作前请自行确认状态。</div></div>`,
    cta: action("今天吃什么", 'data-overlay="conditions" data-focus-key="conditions"')
  });
}

function inventoryView() {
  return screen({ title: "我的库存", active: "inventory", body: `<p class="eyebrow">个人库存</p><h2 class="page-title">${data.inventory.length} 类食材</h2><div class="notice"><strong>按购买时长合理安排</strong><div class="helper">购买日期用于推荐和扣减排序，不等同于保质期或食用安全判断。</div></div><h2 class="section-title">当前库存</h2>${inventoryRows()}<button class="button link" type="button" data-action="reset-data">恢复演示数据</button>`, cta: action("添加食材", 'data-overlay="ingredient" data-focus-key="add-ingredient"') });
}

function eatOutView() {
  const tasteButton = (value, label) => `<button type="button" data-eat-out-condition="taste" data-value="${value}" aria-pressed="${state.eatOut.taste === value}">${label}</button>`;
  const moodButton = (value, label) => `<button type="button" data-eat-out-condition="mood" data-value="${value}" aria-pressed="${state.eatOut.mood === value}">${label}</button>`;
  const options = cuisines.map((item) => `<button class="cuisine-option" type="button" data-cuisine-id="${item.id}" aria-pressed="${state.eatOut.selectedIds.includes(item.id)}"><span aria-hidden="true">${item.emoji}</span><strong>${item.name}</strong></button>`).join("");
  return screen({ title: "出去吃", back: "home", body: `<p class="eyebrow">Eat Out · 轻量盲盒</p><h2 class="page-title">把选择交给今天。</h2><p>不选类型就是完全随机；也可以先圈定几个想吃的，再交给盲盒。</p><div class="stack eat-out-filters">
    <div><span class="field-label">口味</span><div class="segmented eat-out-segmented">${tasteButton("any", "不限")}${tasteButton("light", "清淡")}${tasteButton("spicy", "香辣")}${tasteButton("rich", "重口")}</div></div>
    <div><span class="field-label">用餐感觉</span><div class="segmented">${moodButton("casual", "随便吃点")}${moodButton("meal", "正经吃饭")}${moodButton("treat", "想吃点好的")}</div></div>
    <fieldset class="cuisine-fieldset"><legend>想吃的类型 <span>可不选</span></legend><div class="cuisine-grid">${options}</div></fieldset>
    <div class="notice location-note"><strong>📍 附近餐厅推荐将在后续版本开放</strong><div class="helper">本轮只推荐餐饮类型，不使用位置、评分或店铺数据。</div></div>
  </div>`, cta: action("帮我选", 'data-action="draw-cuisine"', true) });
}

function eatOutDrawView() {
  return `<section class="draw-stage eat-out-draw"><div><p class="eyebrow">${state.eatOut.selectedIds.length ? `从 ${state.eatOut.selectedIds.length} 个候选里选` : "完全随机"}</p><h1 tabindex="-1" data-page-heading>正在翻开今天这一顿</h1></div><div class="cuisine-draw-mark" aria-hidden="true"><span>🍜</span><span>🍲</span><span>🥢</span></div><div class="stack"><button class="button primary full" type="button" data-route="eat-out-result">跳过并看结果</button><button class="button full" type="button" data-route="eat-out">返回条件</button></div></section>`;
}

function eatOutResultView() {
  const cuisine = state.eatOut.recommendation;
  if (!cuisine) return eatOutView();
  const tags = cuisine.tastes.map((taste) => ({ light: "清淡", spicy: "香辣", rich: "重口" })[taste]).join(" · ");
  if (state.eatOut.confirmed) {
    return screen({ title: "今天就吃这个", back: "eat-out", body: `<article class="hero-card eat-out-result confirmed"><div class="cuisine-emoji" aria-hidden="true">${cuisine.emoji}</div><p class="eyebrow">决定好了</p><h2 tabindex="-1" data-page-heading>${cuisine.name}</h2><p>${cuisine.description}</p><div class="notice location-note"><strong>下一步：找一家想去的店</strong><div class="helper">附近餐厅推荐将在后续版本开放。</div></div></article>`, cta: action("回到今天", 'data-route="home"', true) });
  }
  return screen({ title: "推荐结果", back: "eat-out", body: `<article class="hero-card eat-out-result"><div class="cuisine-emoji" aria-hidden="true">${cuisine.emoji}</div><p class="eyebrow">今天就吃</p><h2 tabindex="-1" data-page-heading>${cuisine.name}</h2><p>${cuisine.description}</p><div class="cluster"><span class="taste-tag">${tags}</span></div></article><button class="button link reroll-cuisine" type="button" data-action="reroll-cuisine">换一个</button>`, cta: action("就吃这个", 'data-action="confirm-cuisine"', true) });
}

function drawView() {
  const conditions = data.conditions;
  return `<section class="draw-stage"><div><p class="eyebrow">${conditions.meal === "lunch" ? "午餐" : "晚餐"} · ${conditions.diners} 人 · ${conditions.stockMode === "strict" ? "尽量用库存" : "允许少量补买"}</p><h1 tabindex="-1" data-page-heading>正在挑一顿合适的</h1></div><div class="card-stack" aria-hidden="true"><div class="draw-card"></div><div class="draw-card"></div><div class="draw-card"><strong>今日菜单</strong></div></div><div class="stack"><button class="button primary full" type="button" data-route="result">跳过并看结果</button><button class="button full" type="button" data-overlay="conditions">返回条件</button></div></section>`;
}

function resultView() {
  const candidate = currentRecommendation();
  if (!candidate) return noResultView();
  return screen({ title: "推荐结果", back: "home", body: `<article class="hero-card result-card"><div class="reveal-mark" aria-hidden="true">✦</div><span class="status status-${candidate.status}">库存${statusLabels[candidate.status]}</span><p class="eyebrow">盲盒为你选中了</p><h2 tabindex="-1" data-page-heading>${candidate.recipe.title}</h2><p class="helper">${candidate.diners} 人 · 约 ${candidate.recipe.minutes} 分钟 · 营养数据为估算</p>${candidate.missingCost > 0 ? `<p class="helper">预计补买约 ¥${candidate.missingCost.toFixed(1)}，不超过本次补买预算。</p>` : ""}<div class="notice"><strong>为什么推荐</strong><div>${candidate.reason}</div></div></article><button class="button link" type="button" data-action="reroll">再来一次</button>`, cta: action("查看菜谱", 'data-route="recipe"', true) });
}

function recipeView() {
  const candidate = currentRecommendation();
  if (!candidate) return noResultView();
  const recipe = candidate.recipe;
  return screen({ title: "菜谱", back: "result", body: `<p class="eyebrow">结构化菜谱</p><h2 class="page-title">${recipe.title}</h2><div class="cluster"><span class="status">${candidate.diners} 人份</span><span>约 ${recipe.minutes} 分钟</span><span>${recipe.difficulty}</span></div><h2 class="section-title">食材与库存</h2>${requirementRows(candidate)}<h2 class="section-title">步骤</h2><ol class="step-list">${recipe.steps.map((step) => `<li>${step}</li>`).join("")}</ol><div class="metric-grid"><div class="metric"><strong>约 ${recipe.calories * candidate.diners} kcal</strong><small>热量估算</small></div><div class="metric"><strong>约 ${recipe.protein * candidate.diners} g</strong><small>蛋白质估算</small></div></div>`, cta: action("我做了这顿饭", 'data-action="prepare-deduction"', true) });
}

function noResultView() {
  return screen({ title: "暂时没有结果", back: "home", body: `<div class="hero-card"><p class="eyebrow">没有勉强推荐</p><h2 tabindex="-1" data-page-heading>换一个条件，再抽一次。</h2><p>${state.noResultMessage || "当前条件与库存暂时无法组成合适的一顿。"}</p></div><div class="stack"><button class="button full" type="button" data-route="inventory">查看库存</button></div>`, cta: action("调整推荐条件", 'data-overlay="conditions" data-focus-key="conditions"', true) });
}

function deductionView() {
  const deduction = state.pendingDeduction || data.session.pendingDeduction;
  if (!deduction) return recipeView();
  const rows = deduction.items.length ? deduction.items.map((item) => {
    const ageView = batchAgeView(item);
    return `<li class="deduction-row"><div class="split"><div><strong>${item.name}</strong><small>批次 ${item.batchId}${item.precision === "unknown" ? " · 数量未知" : ""}</small>${purchaseAgeMarkup(ageView)}</div><label class="check-inline"><input type="checkbox" data-deduction-skip="${item.key}" ${item.skip ? "checked" : ""}>跳过</label></div><div class="deduction-input"><label for="deduction-${item.key.replaceAll(":", "-")}">实际使用量</label><div><input id="deduction-${item.key.replaceAll(":", "-")}" type="number" min="0" ${item.max !== null ? `max="${item.max}"` : ""} step="any" value="${item.amount}" data-deduction-amount="${item.key}" ${item.skip ? "disabled" : ""}><span>${item.unit}</span></div></div></li>`;
  }).join("") : '<li class="notice"><strong>没有可扣减的已知库存</strong><div class="helper">缺少或未知的食材不会被擅自更新。</div></li>';
  const migrationReview = deduction.migrationReviewRequired ? '<div class="notice"><strong>请复核旧版制作预览</strong><div>迁移前保存的扣减项没有购买日期，请确认批次与用量后再提交。</div></div>' : "";
  return screen({ title: "库存扣减预览", back: "recipe", body: `<div class="notice"><strong>确认后才更新库存</strong><div>系统按已知购买日期从早到晚排列批次；未知或异常日期排在后面。你可以修改或跳过任一项，所有项目会一次提交。</div></div>${migrationReview}<h2 class="section-title">${deduction.recipeTitle}</h2><ul class="deduction-list">${rows}</ul>`, cta: action("确认更新库存", 'data-action="commit-deduction"', true) });
}

function successView() {
  const summary = data.session.lastDeductionSummary || [];
  return screen({ title: "制作完成", body: `<div class="hero-card success-card"><p class="eyebrow">库存已更新</p><h2 tabindex="-1" data-page-heading>这一顿，完成了。</h2><p>${data.session.lastCompletedRecipeTitle || "本次菜谱"}的库存扣减已一次完成。</p></div>${summary.length ? `<h2 class="section-title">本次更新</h2><ul class="list">${summary.map((item) => `<li class="list-row"><div><strong>${item.name}</strong><small>已扣减 ${item.amount} ${item.unit}</small></div></li>`).join("")}</ul>` : ""}`, cta: action("回到今天", 'data-route="home"', true) });
}

function deductionFailureView() {
  return screen({ title: "库存更新失败", back: "deduction", body: `<div class="hero-card"><p class="eyebrow">库存没有变化</p><h2 tabindex="-1" data-page-heading>这次提交没有完成。</h2><p>${state.commitError || "浏览器暂时无法保存，请稍后重试。"}</p></div><div class="notice"><strong>你的修改还在</strong><div>返回预览后仍可继续调整，重试会再次整体提交。</div></div>`, cta: `<div class="fixed-action task stack"><button class="button primary full" type="button" data-action="commit-deduction">重试更新库存</button><button class="button full" type="button" data-route="deduction">返回修改</button></div>` });
}

function conditionsSheet() {
  const conditions = state.conditionsDraft || structuredClone(data.conditions);
  const optionButton = (key, value, label) => `<button type="button" data-condition="${key}" data-value="${value}" aria-pressed="${String(conditions[key]) === String(value)}">${label}</button>`;
  return `<div class="scrim"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><header class="sheet-header"><span></span><h2 id="sheet-title" tabindex="-1">推荐条件</h2><button class="icon-button" type="button" aria-label="关闭" data-action="close-sheet">${icon("close")}</button></header><form id="conditions-form" class="sheet-body stack" data-form="conditions">
    <div><span class="field-label">用餐人数</span><div class="segmented">${optionButton("diners", 1, "1 人")}${optionButton("diners", 2, "2 人")}${optionButton("diners", 4, "4 人")}</div></div>
    <div><span class="field-label">餐次</span><div class="segmented">${optionButton("meal", "lunch", "午餐")}${optionButton("meal", "dinner", "晚餐")}</div></div>
    <div><span class="field-label">结果形式</span><div class="segmented">${optionButton("format", "simple", "简餐")}${optionButton("format", "regular", "正常正餐")}${optionButton("format", "single", "一道菜")}</div></div>
    <div><span class="field-label">库存模式</span><div class="segmented">${optionButton("stockMode", "strict", "尽量只用库存")}${optionButton("stockMode", "topup", "允许少量补买")}</div></div>
    <details><summary>更多条件</summary><div class="stack">
      <div class="field"><label for="condition-cuisine">菜系</label><select id="condition-cuisine" data-condition-input="cuisine"><option value="any" ${conditions.cuisine === "any" ? "selected" : ""}>不限</option><option value="chinese" ${conditions.cuisine === "chinese" ? "selected" : ""}>中式家常</option><option value="western" ${conditions.cuisine === "western" ? "selected" : ""}>西式简餐</option></select></div>
      <div class="field"><label for="condition-diet">荤素</label><select id="condition-diet" data-condition-input="diet"><option value="any" ${conditions.diet === "any" ? "selected" : ""}>不限</option><option value="vegetarian" ${conditions.diet === "vegetarian" ? "selected" : ""}>素食</option><option value="meat" ${conditions.diet === "meat" ? "selected" : ""}>可含肉类</option></select></div>
      <div class="field"><label for="condition-spice">辣度</label><select id="condition-spice" data-condition-input="spice"><option value="none" ${conditions.spice === "none" ? "selected" : ""}>不辣</option><option value="mild" ${conditions.spice === "mild" ? "selected" : ""}>微辣</option><option value="hot" ${conditions.spice === "hot" ? "selected" : ""}>辣</option></select></div>
      <div class="field"><label for="condition-minutes">最长烹饪时间</label><select id="condition-minutes" data-condition-input="maxMinutes"><option value="20" ${Number(conditions.maxMinutes) === 20 ? "selected" : ""}>20 分钟</option><option value="30" ${Number(conditions.maxMinutes) === 30 ? "selected" : ""}>30 分钟</option><option value="45" ${Number(conditions.maxMinutes) === 45 ? "selected" : ""}>45 分钟</option></select></div>
      ${conditions.stockMode === "topup" ? `<div class="field"><label for="condition-budget">本次补买预算（元）</label><input id="condition-budget" type="number" min="0" step="1" value="${Number(conditions.topUpBudget || 0)}" data-condition-input="topUpBudget"><p class="helper">只计算这顿饭缺少食材的 Mock 估价，不是外出人均预算。</p></div>` : ""}
    </div></details>
    <div class="notice"><strong>当前条件</strong><div>${conditions.meal === "lunch" ? "午餐" : "晚餐"} · ${conditions.diners} 人 · ${conditions.format === "regular" ? "正常正餐" : conditions.format === "simple" ? "简餐" : "一道菜"}</div></div>
  </form><div class="sheet-actions"><button class="button primary full" type="submit" form="conditions-form">开始抽取</button></div>${discardDialog()}</section></div>`;
}

function ingredientSheet() {
  const form = state.ingredientForm;
  const isEdit = Boolean(state.editingIngredientId);
  return `<div class="scrim"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><header class="sheet-header"><span></span><h2 id="sheet-title" tabindex="-1">${isEdit ? "编辑食材" : "添加食材"}</h2><button class="icon-button" type="button" aria-label="关闭" data-action="close-sheet">${icon("close")}</button></header><form id="ingredient-form" class="sheet-body stack" data-form="ingredient" novalidate>
    <div class="field"><label for="ingredient-name">食材名称 <span aria-hidden="true">*</span></label><input id="ingredient-name" name="name" value="${escapeAttribute(form.name)}" autocomplete="off" required><p class="helper">名称是唯一必填项；同名食材会保存为新批次。</p></div>
    <div class="field-grid"><div class="field"><label for="ingredient-quantity">数量</label><input id="ingredient-quantity" name="quantity" type="number" min="0" step="any" inputmode="decimal" value="${escapeAttribute(form.quantity)}"></div><div class="field"><label for="ingredient-unit">单位</label><select id="ingredient-unit" name="unit">${["g", "kg", "个", "把", "盒", "袋", "ml"].map((unit) => `<option ${form.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></div></div>
    <div class="field"><label for="ingredient-precision">数量精度</label><select id="ingredient-precision" name="precision"><option value="exact" ${form.precision === "exact" ? "selected" : ""}>精确</option><option value="approximate" ${form.precision === "approximate" ? "selected" : ""}>约数</option><option value="unknown" ${form.precision === "unknown" ? "selected" : ""}>未知</option></select></div>
    <div class="field"><label for="ingredient-purchased">购买日期（可选）</label><input id="ingredient-purchased" name="purchasedOn" type="date" max="${localTodayKey()}" value="${escapeAttribute(form.purchasedOn)}"><p class="helper">用于购买时长提示和批次排序，不用于判断保质期或食用安全。</p></div>
    ${form.error ? `<p class="form-error" role="alert">${form.error}</p>` : ""}
  </form><div class="sheet-actions"><button class="button primary full" type="submit" form="ingredient-form">保存食材</button></div>${discardDialog()}</section></div>`;
}

function discardDialog() {
  return state.confirmDiscard ? `<div class="inline-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-title"><h3 id="discard-title">放弃未保存的修改？</h3><p>本次输入尚未保存。</p><div class="stack"><button class="button primary full" type="button" data-action="discard-changes">放弃修改</button><button class="button full" type="button" data-action="keep-editing">继续编辑</button></div></div>` : "";
}

function resetDialog() {
  if (!state.confirmReset) return "";
  const blocked = state.confirmReset === "blocked";
  const title = blocked ? "清除本地数据？" : "恢复演示数据？";
  const message = blocked
    ? "无法读取的原始本地数据会被清除，并替换为演示库存。此操作不可撤销。"
    : "当前库存、条件和制作记录会被演示数据替换。此操作不可撤销。";
  const confirmLabel = blocked ? "确认清除" : "确认恢复";
  return `<div class="dialog-scrim"><section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description"><h2 id="reset-title" tabindex="-1">${title}</h2><p id="reset-description">${message}</p><div class="stack"><button class="button primary full" type="button" data-action="confirm-reset">${confirmLabel}</button><button class="button full" type="button" data-action="cancel-reset">取消</button></div></section></div>`;
}

function storageRecoveryView() {
  const messages = {
    damaged: ["本地数据暂时无法读取", "检测到无法解析或结构异常的数据。为避免覆盖，原始内容仍保留在当前浏览器。"],
    "migration-failed": ["本地数据升级未完成", "旧版数据仍保留，当前没有写入不完整的新版本。"],
    "read-failed": ["浏览器存储暂时不可用", "无法读取本地库存，请检查浏览器设置后重试。"],
    "write-failed": ["本地数据暂时无法保存", "初始化或升级写入未完成；原始数据会尽量保持不变。"]
  };
  const [title, description] = messages[state.storageStatus] || messages.damaged;
  return `<section class="screen recovery-screen">${header("数据恢复")}<div class="screen-body task"><div class="hero-card"><p class="eyebrow">库存没有被自动覆盖</p><h2 tabindex="-1" data-page-heading>${title}</h2><p>${description}</p></div><div class="notice"><strong>建议先重试</strong><div class="helper">如果问题持续，可在确认后清除本地数据并恢复演示库存。</div></div><div class="stack recovery-actions"><button class="button primary full" type="button" data-action="retry-storage">重试读取</button><button class="button full" type="button" data-action="request-blocked-reset">清除并恢复演示数据</button></div></div></section>`;
}

function acceptLoad(result) {
  loaded = result;
  data = result.document;
  state.storageStatus = result.status;
  state.pendingDeduction = data?.session.pendingDeduction ? structuredClone(data.session.pendingDeduction) : null;
}

function escapeAttribute(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function openIngredient(itemId = null) {
  const item = itemId ? data.inventory.find((entry) => entry.id === itemId) : null;
  const batch = item?.batches[0];
  state.editingIngredientId = itemId;
  state.ingredientForm = { name: item?.name || "", quantity: batch?.quantity ?? "", unit: batch?.unit || "g", precision: batch?.precision || "exact", purchasedOn: batch?.purchasedOn || "", error: "" };
  state.overlay = "ingredient";
  state.dirty = false;
  state.confirmDiscard = false;
  render();
}

function closeSheet(force = false) {
  if (state.dirty && !force) { state.confirmDiscard = true; render(); return; }
  state.overlay = null;
  state.dirty = false;
  state.confirmDiscard = false;
  state.conditionsDraft = null;
  state.pendingFocus = state.returnFocus;
  render();
}

const views = { home: homeView, inventory: inventoryView, "eat-out": eatOutView, "eat-out-draw": eatOutDrawView, "eat-out-result": eatOutResultView, draw: drawView, result: resultView, recipe: recipeView, deduction: deductionView, success: successView, "no-result": noResultView, "deduction-failure": deductionFailureView };

function beginCuisineRecommendation(random = Math.random, excludeCurrent = false) {
  const options = { taste: state.eatOut.taste, mood: state.eatOut.mood, selectedIds: state.eatOut.selectedIds };
  const candidates = getCuisineCandidates(options);
  const eligible = excludeCurrent && candidates.length > 1 ? candidates.filter((item) => item.id !== state.eatOut.recommendation?.id) : candidates;
  const picked = pickCuisine({}, random, eligible);
  if (!picked.cuisine) return false;
  state.eatOut.recommendation = picked.cuisine;
  state.eatOut.confirmed = false;
  navigate("eat-out-draw");
  return true;
}

function beginRecommendation(random = Math.random) {
  const picked = pickRecommendation(recipes, data, random);
  if (!picked.candidate) {
    state.recommendation = null;
    state.noResultMessage = picked.message;
    navigate("no-result");
    return false;
  }
  state.recommendation = picked.candidate;
  state.noResultMessage = "";
  const recipeId = picked.candidate.recipe.id;
  const saved = store.update((draft) => {
    draft.session.lastRecipeId = recipeId;
    draft.session.recentRecipeIds = [recipeId, ...draft.session.recentRecipeIds.filter((id) => id !== recipeId)].slice(0, 5);
  });
  data = saved.document;
  navigate("draw");
  return true;
}

function prepareDeduction() {
  const candidate = currentRecommendation();
  if (!candidate) { navigate("no-result"); return false; }
  state.pendingDeduction = buildDeduction(candidate, data.inventory, localTodayKey());
  const saved = store.update((draft) => { draft.session.pendingDeduction = structuredClone(state.pendingDeduction); });
  if (!saved.ok) {
    state.commitError = "无法保存制作预览，库存没有变化。";
    navigate("deduction-failure");
    return false;
  }
  data = saved.document;
  navigate("deduction");
  return true;
}

function commitDeduction(forceFailure = false) {
  if (!state.pendingDeduction) { navigate("deduction"); return false; }
  if (forceFailure) {
    state.commitError = "模拟写入失败：库存已保持提交前状态。";
    navigate("deduction-failure");
    return false;
  }
  const summary = state.pendingDeduction.items.filter((item) => !item.skip && Number(item.amount) > 0).map(({ name, amount, unit }) => ({ name, amount: Number(amount), unit }));
  const saved = store.update((draft) => {
    const next = applyDeduction(draft, state.pendingDeduction);
    next.session.pendingDeduction = null;
    next.session.lastCompletedAt = new Date().toISOString();
    next.session.lastCompletedRecipeTitle = state.pendingDeduction.recipeTitle;
    next.session.lastDeductionSummary = summary;
    return next;
  });
  if (!saved.ok) {
    state.commitError = saved.error?.message || "浏览器暂时无法保存，库存没有变化。";
    navigate("deduction-failure");
    return false;
  }
  data = saved.document;
  state.pendingDeduction = null;
  state.commitError = "";
  navigate("success");
  announce("库存已更新");
  return true;
}

function render() {
  clearTimeout(state.drawTimer);
  document.documentElement.classList.toggle("reduce-motion", Boolean(data?.preferences.reduceMotion));
  if (!data) {
    app.innerHTML = storageRecoveryView() + resetDialog();
    const blockedFocus = app.querySelector(".confirm-dialog [tabindex='-1']") || app.querySelector("[data-page-heading]");
    if (blockedFocus) blockedFocus.focus({ preventScroll: true });
    return;
  }
  const overlay = state.overlay === "conditions" ? conditionsSheet() : state.overlay === "ingredient" ? ingredientSheet() : "";
  app.innerHTML = (views[state.route] || homeView)() + overlay + resetDialog();
  if (state.overlay || state.confirmReset) {
    const base = app.querySelector(":scope > .screen");
    if (base) { base.inert = true; base.setAttribute("aria-hidden", "true"); }
  }
  const routeChanged = state.previousRoute !== state.route;
  const focusTarget = state.confirmReset
    ? app.querySelector(".confirm-dialog [tabindex='-1']")
    : state.pendingFocus
      ? app.querySelector(`[data-focus-key="${state.pendingFocus}"]`)
      : app.querySelector(".sheet [tabindex='-1']") || (routeChanged ? app.querySelector("[data-page-heading]") : null);
  state.pendingFocus = null;
  state.previousRoute = state.route;
  if (focusTarget) {
    const focus = () => focusTarget.focus({ preventScroll: true });
    focus();
    setTimeout(focus, 32);
  }
  if (state.route === "draw" || state.route === "eat-out-draw") {
    state.drawTimer = setTimeout(() => navigate(state.route === "draw" ? "result" : "eat-out-result"), data.preferences.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 950);
  }
}

function navigate(route) {
  state.previousRoute = state.route;
  state.route = views[route] ? route : "home";
  state.overlay = null;
  const nextHash = `#/${state.route}`;
  if (location.hash === nextHash) render(); else location.hash = nextHash;
  announce(`已进入${state.route === "home" ? "首页" : appTitle(state.route)}`);
}

function appTitle(route) {
  return ({ inventory: "库存", "eat-out": "外出就餐", "eat-out-draw": "餐饮类型抽取", "eat-out-result": "外出推荐结果", draw: "盲盒抽取", result: "推荐结果", recipe: "菜谱", deduction: "库存扣减预览", success: "制作完成", "no-result": "暂无结果", "deduction-failure": "库存更新失败" })[route] || "首页";
}

document.addEventListener("click", (event) => {
  const route = event.target.closest("[data-route]")?.dataset.route;
  if (route) { navigate(route); return; }
  const overlay = event.target.closest("[data-overlay]")?.dataset.overlay;
  if (overlay) {
    state.returnFocus = event.target.closest("[data-focus-key]")?.dataset.focusKey || null;
    if (overlay === "ingredient") openIngredient();
    else { state.overlay = overlay; state.conditionsDraft = structuredClone(data.conditions); state.dirty = false; render(); }
    return;
  }
  const editIngredient = event.target.closest("[data-edit-ingredient]")?.dataset.editIngredient;
  if (editIngredient) { openIngredient(editIngredient); return; }
  const condition = event.target.closest("[data-condition]");
  if (condition) {
    const key = condition.dataset.condition;
    const raw = condition.dataset.value;
    state.conditionsDraft[key] = key === "diners" ? Number(raw) : raw;
    state.dirty = true;
    render();
    return;
  }
  const eatOutCondition = event.target.closest("[data-eat-out-condition]");
  if (eatOutCondition) {
    state.eatOut[eatOutCondition.dataset.eatOutCondition] = eatOutCondition.dataset.value;
    render();
    return;
  }
  const cuisineOption = event.target.closest("[data-cuisine-id]");
  if (cuisineOption) {
    const id = cuisineOption.dataset.cuisineId;
    state.eatOut.selectedIds = state.eatOut.selectedIds.includes(id) ? state.eatOut.selectedIds.filter((item) => item !== id) : [...state.eatOut.selectedIds, id];
    render();
    return;
  }
  const actionName = event.target.closest("[data-action]")?.dataset.action;
  if (actionName === "draw-cuisine") beginCuisineRecommendation();
  if (actionName === "reroll-cuisine") beginCuisineRecommendation(Math.random, true);
  if (actionName === "confirm-cuisine") { state.eatOut.confirmed = true; render(); announce(`今天就吃${state.eatOut.recommendation.name}`); }
  if (actionName === "close-sheet") closeSheet();
  if (actionName === "shell-notice") announce("库存编辑将在下一步接入本地数据");
  if (actionName === "reset-data") { state.confirmReset = "normal"; render(); }
  if (actionName === "request-blocked-reset") { state.confirmReset = "blocked"; render(); }
  if (actionName === "cancel-reset") { state.confirmReset = null; render(); }
  if (actionName === "confirm-reset") {
    try {
      const resetMode = state.confirmReset;
      data = store.reset();
      loaded = { status: "ready", document: data };
      state.storageStatus = "ready";
      state.pendingDeduction = null;
      state.confirmReset = null;
      if (resetMode === "blocked") {
        state.route = "home";
        if (location.hash !== "#/home") location.hash = "#/home";
        else render();
      } else {
        render();
      }
      announce("已恢复演示数据");
    } catch {
      state.confirmReset = null;
      state.storageStatus = "write-failed";
      data = null;
      render();
    }
  }
  if (actionName === "retry-storage") { acceptLoad(store.load()); render(); }
  if (actionName === "dismiss-migration") {
    const saved = store.update((draft) => { draft.migration.upgradeNoticeAcknowledged = true; });
    if (saved.ok) { data = saved.document; render(); announce("升级说明已确认"); }
  }
  if (actionName === "discard-changes") closeSheet(true);
  if (actionName === "keep-editing") { state.confirmDiscard = false; render(); }
  if (actionName === "reroll") beginRecommendation();
  if (actionName === "prepare-deduction") prepareDeduction();
  if (actionName === "commit-deduction") commitDeduction();
  if (actionName === "toggle-motion") {
    const saved = store.update((draft) => { draft.preferences.reduceMotion = !draft.preferences.reduceMotion; });
    data = saved.document;
    render();
    announce(data.preferences.reduceMotion ? "已减少动画" : "已恢复标准动画");
  }
});

document.addEventListener("change", (event) => {
  const conditionInput = event.target.closest("[data-condition-input]");
  if (conditionInput) {
    const key = conditionInput.dataset.conditionInput;
    state.conditionsDraft[key] = ["maxMinutes", "topUpBudget"].includes(key) ? Number(conditionInput.value) : conditionInput.value;
    state.dirty = true;
  }
  if (event.target.closest("#ingredient-form")) {
    state.dirty = true;
    if (event.target.name) state.ingredientForm[event.target.name] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  }
  const skipKey = event.target.dataset.deductionSkip;
  if (skipKey && state.pendingDeduction) {
    const item = state.pendingDeduction.items.find((entry) => entry.key === skipKey);
    if (item) { item.skip = event.target.checked; render(); }
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#ingredient-form")) {
    state.dirty = true;
    if (event.target.name) state.ingredientForm[event.target.name] = event.target.value;
  }
  const amountKey = event.target.dataset.deductionAmount;
  if (amountKey && state.pendingDeduction) {
    const item = state.pendingDeduction.items.find((entry) => entry.key === amountKey);
    if (item) item.amount = event.target.value;
  }
});

document.addEventListener("submit", (event) => {
  const formName = event.target.dataset.form;
  if (!formName) return;
  event.preventDefault();
  if (formName === "conditions") {
    const saved = store.update((draft) => { draft.conditions = structuredClone(state.conditionsDraft); });
    data = saved.document;
    state.dirty = false;
    state.conditionsDraft = null;
    beginRecommendation();
    return;
  }
  if (formName === "ingredient") {
    const formData = new FormData(event.target);
    Object.assign(state.ingredientForm, {
      name: String(formData.get("name") || ""),
      quantity: String(formData.get("quantity") || ""),
      unit: String(formData.get("unit") || "g"),
      precision: String(formData.get("precision") || "exact"),
      purchasedOn: String(formData.get("purchasedOn") || "")
    });
    const name = String(formData.get("name") || "").trim();
    if (!name) { state.ingredientForm.error = "请输入食材名称。"; render(); return; }
    const rawQuantity = String(formData.get("quantity") || "").trim();
    const quantity = rawQuantity === "" ? null : Number(rawQuantity);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) { state.ingredientForm.error = "数量必须是大于或等于 0 的数字。"; render(); return; }
    const unit = String(formData.get("unit") || "g");
    const precision = quantity === null ? "unknown" : String(formData.get("precision") || "exact");
    const rawPurchasedOn = String(formData.get("purchasedOn") || "").trim();
    const age = derivePurchaseAge(rawPurchasedOn, localTodayKey());
    if (rawPurchasedOn && !parseLocalDateKey(rawPurchasedOn)) { state.ingredientForm.error = "购买日期格式无效，请重新选择。"; render(); return; }
    if (age.reason === "future") { state.ingredientForm.error = "购买日期不能晚于今天。"; render(); return; }
    const batch = { id: `B-${Date.now().toString(36)}`, quantity, unit, precision, purchasedOn: rawPurchasedOn || null };
    const saved = store.update((draft) => {
      if (state.editingIngredientId) {
        const item = draft.inventory.find((entry) => entry.id === state.editingIngredientId);
        item.name = name;
        batch.id = item.batches[0]?.id || batch.id;
        if (item.batches[0]?.legacy) batch.legacy = structuredClone(item.batches[0].legacy);
        item.batches[0] = batch;
      } else {
        const existing = draft.inventory.find((entry) => entry.name === name);
        if (existing) existing.batches.push(batch);
        else draft.inventory.push({ id: `ingredient-${Date.now().toString(36)}`, name, category: "其他", batches: [batch] });
      }
    });
    if (!saved.ok) { state.ingredientForm.error = "保存失败，请检查浏览器存储后重试。"; render(); return; }
    data = saved.document;
    state.dirty = false;
    state.overlay = null;
    render();
    announce(`${name}已保存到库存`);
  }
});

document.addEventListener("keydown", (event) => {
  const modal = app.querySelector(".confirm-dialog") || app.querySelector(".sheet");
  if (!modal) return;
  if (event.key === "Escape") {
    if (state.confirmReset) { state.confirmReset = null; render(); }
    else closeSheet();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex='0']")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

addEventListener("hashchange", () => {
  state.route = location.hash.replace(/^#\//, "") || "home";
  state.overlay = null;
  render();
});

state.route = location.hash.replace(/^#\//, "") || "home";
window.__MVP__ = { store, getData: () => structuredClone(data), recommend: (random = Math.random) => beginRecommendation(random), recommendCuisine: (random = Math.random, excludeCurrent = false) => beginCuisineRecommendation(random, excludeCurrent), getEatOutState: () => structuredClone(state.eatOut), prepareDeduction, commitDeduction, getPendingDeduction: () => structuredClone(state.pendingDeduction), recipes, cuisines };
render();
