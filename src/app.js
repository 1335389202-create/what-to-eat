"use strict";

import { createStore } from "./storage.js";
import { recipes, findRecipe } from "./data/recipes.js";
import { evaluateRecipe, pickRecommendation, statusLabels } from "./recommender.js";
import { applyDeduction, buildDeduction } from "./deduction.js";

const app = document.querySelector("#app");
const liveRegion = document.querySelector("#live-region");
const store = createStore();
const loaded = store.load();
let data = loaded.document;
const state = {
  route: "home",
  overlay: null,
  previousRoute: "home",
  drawTimer: null,
  storageRecovered: loaded.recovered,
  editingIngredientId: null,
  ingredientForm: null,
  conditionsDraft: null,
  dirty: false,
  confirmDiscard: false,
  returnFocus: null,
  pendingFocus: null,
  recommendation: null,
  noResultMessage: "",
  pendingDeduction: data.session.pendingDeduction ? structuredClone(data.session.pendingDeduction) : null,
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

function inventoryRows() {
  return `<ul class="list">${data.inventory.map((item) => {
    const known = item.batches.filter((batch) => batch.quantity !== null);
    const total = known.reduce((sum, batch) => sum + Number(batch.quantity), 0);
    const units = new Set(known.map((batch) => batch.unit));
    const amount = !known.length ? "余量未填" : units.size === 1 ? `${known.some((batch) => batch.precision === "approximate") ? "约 " : ""}${total} ${known[0].unit}` : "单位待确认";
    const note = item.batches.some((batch) => batch.useSoon) ? `${item.batches.length} 个批次 · 1 批临期` : item.batches.some((batch) => batch.precision === "unknown") ? "数量未知" : `${item.batches.length} 个批次`;
    return `<li class="list-row"><div><strong>${escapeAttribute(item.name)}</strong><small>${amount} · ${note}</small></div><div class="list-actions"><button class="list-action" type="button" data-edit-ingredient="${escapeAttribute(item.id)}">编辑</button></div></li>`;
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
  const expiring = data.inventory.filter((item) => item.batches.some((batch) => batch.useSoon));
  const conditions = data.conditions;
  return screen({
    title: "今天",
    active: "home",
    body: `<div class="home-intro"><div><p class="eyebrow">欢迎回来</p><h2 class="page-title">把家里的食材，<br>变成今天这一顿。</h2></div><button class="motion-toggle" type="button" data-action="toggle-motion" aria-pressed="${data.preferences.reduceMotion}"><span aria-hidden="true">${data.preferences.reduceMotion ? "◼" : "◉"}</span>${data.preferences.reduceMotion ? "已减少动效" : "标准动效"}</button></div><p class="helper">数据只保存在当前浏览器，刷新后也不会丢失。</p>
      <section class="hero-card home-hero"><div class="meal-illustration" aria-hidden="true"><span class="plate"></span><span class="food food-a"></span><span class="food food-b"></span><span class="food food-c"></span></div><div class="split hero-copy"><div><p class="eyebrow">${conditions.meal === "lunch" ? "午餐" : "晚餐"} · ${conditions.diners} 人</p><h2>今天吃什么？</h2></div><span class="status">库存可用</span></div><p>优先使用临期食材，在合格菜谱里留一点随机惊喜。</p><button class="button link" type="button" data-overlay="conditions">调整推荐条件</button></section>
      ${state.storageRecovered ? '<div class="notice"><strong>已恢复演示数据</strong><div class="helper">原本地数据无法读取，未继续使用损坏内容。</div></div>' : ""}
      ${data.session.lastCompletedAt ? `<div class="notice success-notice"><strong>最近完成：${data.session.lastCompletedRecipeTitle}</strong><div class="helper">库存已经过确认并更新。</div></div>` : ""}
      <h2 class="section-title">库存提醒</h2><div class="notice"><strong>${expiring.length ? `${expiring.length} 类食材需优先使用` : "暂时没有临期提醒"}</strong><div class="helper">推荐时会优先考虑，不会自动扣减。</div></div>`,
    cta: action("今天吃什么", 'data-overlay="conditions" data-focus-key="conditions"')
  });
}

function inventoryView() {
  return screen({ title: "我的库存", active: "inventory", body: `<p class="eyebrow">个人库存</p><h2 class="page-title">${data.inventory.length} 类食材</h2><div class="notice"><strong>先吃临期</strong><div class="helper">标记为尽快食用的批次会优先参与推荐</div></div><h2 class="section-title">当前库存</h2>${inventoryRows()}<button class="button link" type="button" data-action="reset-data">恢复演示数据</button>`, cta: action("添加食材", 'data-overlay="ingredient" data-focus-key="add-ingredient"') });
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
  const rows = deduction.items.length ? deduction.items.map((item) => `<li class="deduction-row"><div class="split"><div><strong>${item.name}</strong><small>${item.useSoon ? "临期批次优先" : `批次 ${item.batchId}`}${item.precision === "unknown" ? " · 数量未知" : ""}</small></div><label class="check-inline"><input type="checkbox" data-deduction-skip="${item.key}" ${item.skip ? "checked" : ""}>跳过</label></div><div class="deduction-input"><label for="deduction-${item.key.replaceAll(":", "-")}">实际使用量</label><div><input id="deduction-${item.key.replaceAll(":", "-")}" type="number" min="0" ${item.max !== null ? `max="${item.max}"` : ""} step="any" value="${item.amount}" data-deduction-amount="${item.key}" ${item.skip ? "disabled" : ""}><span>${item.unit}</span></div></div></li>`).join("") : '<li class="notice"><strong>没有可扣减的已知库存</strong><div class="helper">缺少或未知的食材不会被擅自更新。</div></li>';
  return screen({ title: "库存扣减预览", back: "recipe", body: `<div class="notice"><strong>确认后才更新库存</strong><div>系统建议优先使用临期批次，你可以修改或跳过任一项；所有项目会一次提交。</div></div><h2 class="section-title">${deduction.recipeTitle}</h2><ul class="deduction-list">${rows}</ul>`, cta: action("确认更新库存", 'data-action="commit-deduction"', true) });
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
  return `<div class="scrim"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><header class="sheet-header"><span></span><h2 id="sheet-title" tabindex="-1">${isEdit ? "编辑食材" : "添加食材"}</h2><button class="icon-button" type="button" aria-label="关闭" data-action="close-sheet">${icon("close")}</button></header><form id="ingredient-form" class="sheet-body stack" data-form="ingredient">
    <div class="field"><label for="ingredient-name">食材名称 <span aria-hidden="true">*</span></label><input id="ingredient-name" name="name" value="${escapeAttribute(form.name)}" autocomplete="off" required><p class="helper">名称是唯一必填项；同名食材会保存为新批次。</p></div>
    <div class="field-grid"><div class="field"><label for="ingredient-quantity">数量</label><input id="ingredient-quantity" name="quantity" type="number" min="0" step="any" inputmode="decimal" value="${escapeAttribute(form.quantity)}"></div><div class="field"><label for="ingredient-unit">单位</label><select id="ingredient-unit" name="unit">${["g", "kg", "个", "把", "盒", "袋", "ml"].map((unit) => `<option ${form.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></div></div>
    <div class="field"><label for="ingredient-precision">数量精度</label><select id="ingredient-precision" name="precision"><option value="exact" ${form.precision === "exact" ? "selected" : ""}>精确</option><option value="approximate" ${form.precision === "approximate" ? "selected" : ""}>约数</option><option value="unknown" ${form.precision === "unknown" ? "selected" : ""}>未知</option></select></div>
    <div class="field"><label for="ingredient-expiry">预计到期日期</label><input id="ingredient-expiry" name="expiresOn" type="date" value="${escapeAttribute(form.expiresOn)}"></div>
    <label class="check-row"><input name="useSoon" type="checkbox" ${form.useSoon ? "checked" : ""}>标记为尽快食用</label>
    ${form.error ? `<p class="form-error" role="alert">${form.error}</p>` : ""}
  </form><div class="sheet-actions"><button class="button primary full" type="submit" form="ingredient-form">保存食材</button></div>${discardDialog()}</section></div>`;
}

function discardDialog() {
  return state.confirmDiscard ? `<div class="inline-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-title"><h3 id="discard-title">放弃未保存的修改？</h3><p>本次输入尚未保存。</p><div class="stack"><button class="button primary full" type="button" data-action="discard-changes">放弃修改</button><button class="button full" type="button" data-action="keep-editing">继续编辑</button></div></div>` : "";
}

function escapeAttribute(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function openIngredient(itemId = null) {
  const item = itemId ? data.inventory.find((entry) => entry.id === itemId) : null;
  const batch = item?.batches[0];
  state.editingIngredientId = itemId;
  state.ingredientForm = { name: item?.name || "", quantity: batch?.quantity ?? "", unit: batch?.unit || "g", precision: batch?.precision || "exact", expiresOn: batch?.expiresOn || "", useSoon: Boolean(batch?.useSoon), error: "" };
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

const views = { home: homeView, inventory: inventoryView, draw: drawView, result: resultView, recipe: recipeView, deduction: deductionView, success: successView, "no-result": noResultView, "deduction-failure": deductionFailureView };

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
  state.pendingDeduction = buildDeduction(candidate, data.inventory);
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
  document.documentElement.classList.toggle("reduce-motion", Boolean(data.preferences.reduceMotion));
  const overlay = state.overlay === "conditions" ? conditionsSheet() : state.overlay === "ingredient" ? ingredientSheet() : "";
  app.innerHTML = (views[state.route] || homeView)() + overlay;
  if (state.overlay) {
    const base = app.querySelector(":scope > .screen");
    if (base) { base.inert = true; base.setAttribute("aria-hidden", "true"); }
  }
  const routeChanged = state.previousRoute !== state.route;
  const focusTarget = state.pendingFocus
    ? app.querySelector(`[data-focus-key="${state.pendingFocus}"]`)
    : app.querySelector(".sheet [tabindex='-1']") || (routeChanged ? app.querySelector("[data-page-heading]") : null);
  state.pendingFocus = null;
  state.previousRoute = state.route;
  if (focusTarget) {
    const focus = () => focusTarget.focus({ preventScroll: true });
    focus();
    setTimeout(focus, 32);
  }
  if (state.route === "draw") state.drawTimer = setTimeout(() => navigate("result"), data.preferences.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 950);
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
  return ({ inventory: "库存", draw: "盲盒抽取", result: "推荐结果", recipe: "菜谱", deduction: "库存扣减预览", success: "制作完成", "no-result": "暂无结果", "deduction-failure": "库存更新失败" })[route] || "首页";
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
  const actionName = event.target.closest("[data-action]")?.dataset.action;
  if (actionName === "close-sheet") closeSheet();
  if (actionName === "shell-notice") announce("库存编辑将在下一步接入本地数据");
  if (actionName === "reset-data") { data = store.reset(); state.storageRecovered = false; render(); announce("已恢复演示数据"); }
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
      expiresOn: String(formData.get("expiresOn") || ""),
      useSoon: formData.get("useSoon") === "on"
    });
    const name = String(formData.get("name") || "").trim();
    if (!name) { state.ingredientForm.error = "请输入食材名称。"; render(); return; }
    const rawQuantity = String(formData.get("quantity") || "").trim();
    const quantity = rawQuantity === "" ? null : Number(rawQuantity);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) { state.ingredientForm.error = "数量必须是大于或等于 0 的数字。"; render(); return; }
    const unit = String(formData.get("unit") || "g");
    const precision = quantity === null ? "unknown" : String(formData.get("precision") || "exact");
    const batch = { id: `B-${Date.now().toString(36)}`, quantity, unit, precision, expiresOn: String(formData.get("expiresOn") || "") || null, useSoon: formData.get("useSoon") === "on" };
    const saved = store.update((draft) => {
      if (state.editingIngredientId) {
        const item = draft.inventory.find((entry) => entry.id === state.editingIngredientId);
        item.name = name;
        batch.id = item.batches[0]?.id || batch.id;
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
  const sheet = app.querySelector(".sheet");
  if (!sheet) return;
  if (event.key === "Escape") { closeSheet(); return; }
  if (event.key !== "Tab") return;
  const focusable = [...sheet.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex='0']")];
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
window.__MVP__ = { store, getData: () => structuredClone(data), recommend: (random = Math.random) => beginRecommendation(random), prepareDeduction, commitDeduction, getPendingDeduction: () => structuredClone(state.pendingDeduction), recipes };
render();
