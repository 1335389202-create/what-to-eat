"use strict";

const FRAMES = [
  ["01", "P0-01_HOME-01_FirstVisit_Empty", "HOME-01", "独立页面"],
  ["02", "P0-02_INV-02_QuickAdd_Entry", "INV-02", "Bottom Sheet"],
  ["03", "P0-03_INV-06_MappingConfirm_Tomato", "INV-06", "Bottom Sheet 状态"],
  ["04", "P0-04_INV-02_QuickAdd_Completed", "INV-02", "Bottom Sheet 状态"],
  ["05", "P0-05_HOME-02_SafetyConfirm_None", "HOME-02", "Bottom Sheet"],
  ["06", "P0-06_INV-01_Inventory_Ready", "INV-01", "独立页面"],
  ["07", "P0-07_REC-01_Conditions_Default", "REC-01", "Bottom Sheet"],
  ["08", "P0-08_REC-02_Draw_Active", "REC-02", "独立页面 / 动效"],
  ["09", "P0-09_REC-03_Result_Satisfied", "REC-03", "独立页面"],
  ["10", "P0-10_RCP-01_Recipe_TomatoEggRice", "RCP-01", "独立页面"],
  ["11", "P0-11_COOK-01_Deduction_Suggested", "COOK-01", "独立页面"],
  ["12", "P0-12_COOK-02_Deduction_Edit_Tomato", "COOK-02", "Bottom Sheet"],
  ["13", "P0-13_COOK-01_Deduction_Adjusted", "COOK-01", "独立页面状态"],
  ["14", "P0-14_COOK-03_Update_Success", "COOK-03", "独立页面"],
  ["15", "P0-15_HOME-01_Returning_Updated", "HOME-01", "独立页面"],
  ["16", "P0-16_REC-03_Result_Possible", "REC-03", "独立页面"],
  ["17", "P0-17_REC-05_StatusDetail_Possible", "REC-05", "Bottom Sheet"],
  ["18", "P0-18_REC-03_Result_Unknown", "REC-03", "独立页面"],
  ["19", "P0-19_INV-03_QuantityCorrection_Chicken", "INV-03", "Bottom Sheet"],
  ["20", "P0-20_REC-01_Conditions_TopUp", "REC-01", "Bottom Sheet 状态"],
  ["21", "P0-21_REC-03_Result_Insufficient_TopUp", "REC-03", "独立页面"],
  ["22", "P0-22_REC-05_MissingDetail_TopUp", "REC-05", "Bottom Sheet"],
  ["23", "P0-23_REC-04_NoResult_Recovery", "REC-04", "独立页面"],
  ["24", "P0-24_COOK-04_Update_Failed", "COOK-04", "独立页面"]
].map(([id, name, pageId, type]) => ({ id, name, pageId, type }));

const TEST_STARTS = [
  ["起点 1 · 首次使用", "01"],
  ["起点 2 · 库存页", "06"],
  ["起点 3 · 返回用户", "15"],
  ["起点 4A · 可能满足", "16"],
  ["起点 4B · 未知", "18"],
  ["起点 5 · 无结果", "23"],
  ["起点 6 · 扣减失败", "24"]
];

const DEFERRED_PAGE_IDS = "INV-04 INV-05 AI-01 RND-01 RND-02 OUT-01 OUT-02 OUT-03 OUT-04 OUT-05 OUT-06 LOC-01 LOC-02 FAV-01 FBK-01 FBK-02 FBK-03 CUS-01 CUS-02 AUTH-01 AUTH-02 AUTH-03 AUTH-04 SET-01 SET-02 SET-03 SET-04 SET-05 SET-06 SET-07 SET-08 SET-09 ADM-01 ADM-02 ADM-03 ADM-04 ADM-05 ADM-06".split(" ");
const CORE_PAGE_IDS = "HOME-01 INV-01 INV-02 REC-01 REC-02 REC-03 REC-04 RCP-01 COOK-01 COOK-03 COOK-04".split(" ");
const SUPPORTING_PAGE_IDS = "HOME-02 INV-03 INV-06 REC-05 COOK-02".split(" ");

const COMPONENTS = [
  "App Navigation · Selected / Focus", "Scene Switch · Home / Outside / Focus", "Context Summary · Default / Modified / Expanded", "Primary Button · Default / Pressed / Loading / Disabled / Focus", "Secondary / Tertiary Button", "Ingredient Chip · Default / Selected / Added / Mapping Warning", "Inventory Card · Normal / Expiring / Approximate / Unknown / Multi-batch", "Expiring Badge · Expiring / Resolved", "Inventory Status Badge · Satisfied / Possible / Insufficient / Unknown", "Recipe / Menu Card · Loading / Four States / Placeholder", "Recommendation Reason", "Missing Ingredient Card · Required / Estimate", "Budget Summary · Unset / Within / Exceeded / Partial", "Nutrition Estimate · Available / Partial / Unavailable", "Filter Chip / Segmented Control", "Bottom Sheet · Default / Keyboard / Unsaved / Loading", "Toast / Live Feedback", "Empty State · Inventory / No Result", "Error State · Atomic Failure", "Loading State / Skeleton", "Recipe Ingredient Row", "Recipe Step Row", "Deduction Preview Item · Suggested / Edited / Skipped / Invalid", "Deduction Edit Row · Default / Edited / Invalid", "Confirmation Pattern", "Status Detail Row"
];

const TEST_TASKS = [
  ["首次添加库存并获得推荐", "01"], ["返回用户快速推荐", "15"], ["理解可能满足与未知", "16"], ["允许补买并理解预算", "07"], ["菜谱与可控库存扣减", "09"], ["无结果后恢复", "23"], ["扣减失败后保护编辑", "24"]
];

const VALIDATION_QUESTIONS = [
  "首页是否首先表达利用库存做决定？", "轻量添加是否避免完整建库压力？", "安全确认是否明确且不像问卷？", "四态能否不依赖颜色区分？", "严格库存下的不确定状态是否易懂？", "补买总预算与外出人均预算是否可区分？", "0.8–1.2 秒盲盒是否轻而不等？", "Reduce Motion 是否仍保留因果？", "推荐理由是否可信且不制造承诺？", "我做了这顿饭是否明确先预览？", "临期优先是否被理解为建议？", "失败后是否相信编辑保留且无部分扣减？", "返回首页是否感知临期批次消失？", "Sheet、固定 CTA、键盘和返回是否自然？"
];

const INITIAL_STATE = Object.freeze({
  currentFrame: "01",
  reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  drawTarget: "09",
  previousFrame: null,
  safetyChoice: null,
  quickAddQuery: "",
  showSatisfiedDetail: false,
  chickenQuantity: "220",
  tomatoT01: "180",
  tomatoT02: "100",
  dirtyDeduction: false,
  dirtyChicken: false,
  discardPrompt: false,
  returnFocusKey: null,
  pendingFocusKey: null,
  notice: ""
});

const state = { ...INITIAL_STATE };
const app = document.querySelector("#app");
const liveRegion = document.querySelector("#live-region");
let drawTimer = null;

const INVENTORY_BEFORE = [
  ["西红柿", "400 g · 2 个批次", "1 批临期", "expiring"],
  ["青菜", "约 1 把", "约数，需确认", "possible"],
  ["鸡胸肉", "余量未填", "数量未知", "unknown"],
  ["鸡蛋", "4 个", "预计 8 月 29 日到期", "normal"],
  ["大米", "200 g", "日期未录入", "normal"],
  ["土豆", "100 g", "日期未录入", "normal"]
];

const INVENTORY_AFTER = [
  ["西红柿", "120 g", "剩余批次 T-02", "normal"],
  ["鸡蛋", "2 个", "预计 8 月 29 日到期", "normal"],
  ["大米", "110 g", "日期未录入", "normal"]
];

function getFrame(frameId) {
  return FRAMES.find((frame) => frame.id === String(frameId).padStart(2, "0")) || FRAMES[0];
}

function icon(name) {
  const paths = {
    back: '<path d="M15 18l-6-6 6-6"/><path d="M9 12h10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  return `<svg class="icon-glyph" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.more}</svg>`;
}

function announce(message) {
  liveRegion.textContent = "";
  window.requestAnimationFrame(() => { liveRegion.textContent = message; });
}

function statusBadge(kind, label) {
  return `<span class="status-badge status-${kind}">${label}</span>`;
}

function header(title, backTarget = null) {
  return `<header class="screen-header">
    ${backTarget ? `<button class="icon-button" type="button" aria-label="返回" data-go="${backTarget}">${icon("back")}</button>` : "<span></span>"}
    <h1 tabindex="-1" data-page-heading>${title}</h1>
    <span></span>
  </header>`;
}

function bottomNav(active = "today") {
  return `<nav class="bottom-nav" aria-label="主要导航">
    <button class="nav-item" type="button" ${active === "today" ? 'aria-current="page"' : ""} data-go="15">今天</button>
    <button class="nav-item" type="button" ${active === "inventory" ? 'aria-current="page"' : ""} data-go="06">库存</button>
    <button class="nav-item" type="button" aria-disabled="true" data-action="deferred">我的</button>
  </nav>`;
}

function fixedAction(label, attrs, options = {}) {
  const secondary = options.secondary
    ? `<button class="button button-secondary button-full" type="button" ${options.secondary.attrs}>${options.secondary.label}</button>`
    : "";
  return `<div class="fixed-action ${options.withNav ? "with-nav" : ""}">
    <button class="button button-primary button-full" type="button" ${attrs}>${label}</button>${secondary}
  </div>`;
}

function screen({ title, body, back = null, action = "", nav = "" }) {
  return `<section class="screen" data-frame-view="${state.currentFrame}">
    ${header(title, back)}
    <div class="screen-body ${nav ? "" : "no-bottom-nav"} ${action ? "" : "no-fixed-action"}">${body}</div>
    ${action}${nav}
  </section>`;
}

function contextCard(updated = false) {
  return `<button class="card card-muted button-full" type="button" data-go="07" data-focus-key="conditions" style="text-align:left">
    <strong>今晚 · 1 人 · 正常正餐</strong>
    <span class="helper-text">尽量只用现有食材 · 微辣 · 均衡</span>
    ${updated ? '<span class="helper-text">最近条件，可点击调整</span>' : ""}
  </button>`;
}

function inventoryList(items) {
  return `<ul class="list">${items.map(([name, amount, detail, kind]) => `
    <li class="list-row">
      <div><strong>${name}</strong><small>${amount} · ${detail}</small></div>
      ${kind === "expiring" ? '<span class="status-badge status-insufficient">临期</span>' : kind === "possible" ? '<span class="status-badge status-possible">约数</span>' : kind === "unknown" ? '<button class="list-action" type="button" data-go="19">补充</button>' : ""}
    </li>`).join("")}</ul>`;
}

function renderHomeFirst() {
  const body = `
    <div class="split"><div><p class="eyebrow">晚上好，小林</p><h2 class="screen-title">今晚吃什么？</h2></div><span class="plain-badge">游客</span></div>
    <p class="helper-text">数据仅保存在本设备</p>
    <div class="segmented" aria-label="用餐场景"><button type="button" aria-pressed="true">在家吃</button><button type="button" aria-pressed="false" data-action="deferred">外出吃</button></div>
    <div class="spacer-16"></div>
    ${contextCard(false)}
    <div class="spacer-16"></div>
    <section class="card card-strong text-center">
      <div class="empty-mark" aria-hidden="true">0</div>
      <h2>库存还是空的</h2>
      <p>先添加几样家里有的食材，就能更好地帮你减少浪费。</p>
    </section>
    <button class="button-link" type="button" data-action="deferred">暂不看库存，随机一顿（后续轮次）</button>`;
  return screen({
    title: "今天",
    body,
    action: fixedAction("添加几个食材", 'data-go="02" data-focus-key="quick-add"', { withNav: true }),
    nav: bottomNav("today")
  });
}

function renderInventory() {
  const body = `
    <p class="eyebrow">个人库存</p>
    <h2 class="screen-title">7 类食材</h2>
    <div class="notice"><strong>1 批食材临期</strong><span>西红柿 T-01 预计 8 月 21 日到期</span></div>
    <h2 class="section-title">需优先使用</h2>
    ${inventoryList(INVENTORY_BEFORE.slice(0, 1))}
    <h2 class="section-title">需确认余量</h2>
    ${inventoryList(INVENTORY_BEFORE.slice(1, 3))}
    <h2 class="section-title">其他库存</h2>
    ${inventoryList(INVENTORY_BEFORE.slice(3))}`;
  return screen({
    title: "我的库存",
    body,
    action: fixedAction("添加食材", 'data-go="02"', { withNav: true, secondary: { label: "用库存推荐", attrs: 'data-go="07"' } }),
    nav: bottomNav("inventory")
  });
}

function renderDraw() {
  const reduced = state.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return `<section class="draw-stage ${reduced ? "" : "draw-active"}" data-frame-view="08" aria-labelledby="draw-title">
    <div><p class="eyebrow">今晚 · 1 人 · 正常正餐</p><h1 id="draw-title" tabindex="-1">正在从符合条件的菜单中抽取</h1></div>
    <div class="card-stack" aria-hidden="true"><div class="draw-card"></div><div class="draw-card"></div><div class="draw-card"><strong>${reduced ? "结果准备中" : "今日菜单"}</strong></div></div>
    <div class="stack"><button class="button button-primary button-full" type="button" data-action="finish-draw">跳过并看结果</button><button class="button button-secondary button-full" type="button" data-go="${state.drawTarget === "21" ? "20" : "07"}">取消并返回条件</button></div>
  </section>`;
}

const RESULT_DATA = {
  "09": { kind: "satisfied", label: "库存满足", title: "番茄炒蛋配米饭", meta: "1 人 · 约 24 分钟 · 约 610 kcal", reasons: ["优先用掉 1 批临期西红柿", "主要食材数量明确足够"], primary: ["查看菜谱", "10"], detail: "西红柿需 300 g / 有 400 g；鸡蛋需 2 个 / 有 4 个；大米需 100 g / 有 200 g。" },
  "16": { kind: "possible", label: "可能够用", title: "蒜蓉青菜配米饭", meta: "1 人 · 约 18 分钟", reasons: ["青菜需约 150 g，库存记录为约 1 把", "单位无法精确换算，制作前需确认"], primary: ["确认青菜余量", "17"] },
  "18": { kind: "unknown", label: "余量未知", title: "香煎鸡胸配米饭", meta: "1 人 · 约 28 分钟", reasons: ["鸡胸肉需 180 g，但库存没有填写数量", "大米需 100 g / 有 200 g，库存满足"], primary: ["补充鸡胸肉数量", "19"] },
  "21": { kind: "insufficient", label: "库存不足 · 可补买完成", title: "酸辣土豆丝配米饭", meta: "1 人 · 约 22 分钟", reasons: ["缺土豆 200 g、青椒 80 g", "预计补买总额 ¥3.5，低于本次 ¥10"], primary: ["查看缺少项", "22"] }
};

function renderResult(frameId) {
  const data = RESULT_DATA[frameId];
  const isSatisfied = frameId === "09";
  const body = `
    <article class="result-hero">
      ${statusBadge(data.kind, data.label)}
      <h2 tabindex="-1" data-result-heading>${data.title}</h2>
      <p class="helper-text">${data.meta}${frameId === "21" ? " · 金额均为估算" : ""}</p>
      <ul class="reason-list">${data.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>
    </article>
    ${frameId === "21" ? `<section class="card card-muted"><div class="split"><strong>预计补买总额</strong><strong class="mono-number">¥3.5</strong></div><p class="helper-text">居家补买总预算 ¥10 · 这一顿额外采购总额，不是人均</p></section>` : ""}
    ${isSatisfied && state.showSatisfiedDetail ? `<section class="notice"><strong>库存判断依据</strong><span>${data.detail}</span></section>` : ""}
    <div class="cluster">
      ${isSatisfied ? '<button class="button-link" type="button" data-action="toggle-satisfied-detail">查看库存依据</button>' : '<button class="button-link" type="button" data-action="prototype-intent">仍然查看菜谱</button>'}
      <button class="button-link" type="button" data-go="08" data-draw-target="${frameId}">再来一次</button>
      <button class="button-link" type="button" data-go="${frameId === "21" ? "20" : "07"}">调整条件</button>
    </div>`;
  return screen({
    title: "推荐结果",
    back: frameId === "21" ? "20" : "15",
    body,
    action: fixedAction(data.primary[0], `data-go="${data.primary[1]}" data-focus-key="result-primary"`)
  });
}

function renderRecipe() {
  const ingredients = [
    ["西红柿", "300 g", "库存 400 g"], ["鸡蛋", "2 个", "库存 4 个"], ["大米", "100 g", "库存 200 g"],
    ["食用油", "约 10 ml", "按常备项假设"], ["盐", "约 2 g", "按常备项假设"], ["生抽", "少量", "按常备项假设"]
  ];
  const body = `
    <p class="eyebrow">结构化系统菜谱 · AI 未参与</p>
    <h2 class="screen-title">番茄炒蛋配米饭</h2>
    <div class="cluster"><span class="chip chip-selected">1 人份</span><span class="chip">约 24 分钟</span><span class="chip">微辣</span></div>
    <div class="notice"><strong>安全提示</strong><span>当前已明确暂无限制；请按个人实际情况确认食材。</span></div>
    <h2 class="section-title">食材与用量</h2>
    <ul class="list">${ingredients.map(([name, amount, stock]) => `<li class="list-row"><div><strong>${name} · ${amount}</strong><small>${stock}</small></div><span>${stock.includes("库存") ? "已有" : "假设"}</span></li>`).join("")}</ul>
    <h2 class="section-title">步骤</h2>
    <ol class="step-list"><li>淘米并煮饭</li><li>番茄切块，鸡蛋打散</li><li>炒鸡蛋后盛出</li><li>炒软番茄</li><li>鸡蛋回锅，加盐和少量生抽</li><li>搭配米饭食用</li></ol>
    <h2 class="section-title">营养估算</h2>
    <div class="metric-grid"><div class="metric"><strong>约 610 kcal</strong><small>热量估算</small></div><div class="metric"><strong>约 23 g</strong><small>蛋白质估算</small></div></div>
    <p class="helper-text">实际结果会受食材品牌、油盐、用量与烹饪损耗影响。</p>
    <button class="button-link" type="button" data-action="deferred">AI 帮我调整（后续轮次）</button>`;
  return screen({ title: "菜谱", back: "09", body, action: fixedAction("我做了这顿饭", 'data-go="11"') });
}

function deductionRows(adjusted) {
  const rows = adjusted
    ? [["西红柿 T-01", "180 g", "用完"], ["西红柿 T-02", "100 g", "剩余 120 g"], ["鸡蛋 E-01", "2 个", "剩余 2 个"], ["大米 R-01", "90 g", "剩余 110 g"]]
    : [["西红柿 T-01", "180 g", "建议优先使用临期批次"], ["西红柿 T-02", "120 g", "预计剩余 100 g"], ["鸡蛋 E-01", "2 个", "预计剩余 2 个"], ["大米 R-01", "100 g", "预计剩余 100 g"]];
  return `<ul class="list">${rows.map(([name, used, remaining], index) => `<li class="list-row"><div><strong>${name}</strong><small>扣减 ${used} · ${remaining}</small></div>${index < 2 ? '<button class="list-action" type="button" data-go="12">修改</button>' : ""}</li>`).join("")}</ul>`;
}

function renderDeduction(adjusted) {
  const body = `
    <div class="notice ${adjusted ? "notice-success" : ""}"><strong>${adjusted ? "已按实际用量调整" : "确认后才更新库存"}</strong><span>${adjusted ? "尚未更新库存，请核对后确认。" : "查看和修改实际用了多少；临期优先只是建议。"}</span></div>
    <h2 class="section-title">预计扣减</h2>
    ${deductionRows(adjusted)}
    <section class="card card-muted"><strong>${adjusted ? "最终实际用量" : "系统建议"}</strong><p>西红柿 ${adjusted ? "280" : "300"} g · 鸡蛋 2 个 · 大米 ${adjusted ? "90" : "100"} g</p></section>
    <button class="button-link" type="button" data-go="10">取消并返回菜谱</button>`;
  return screen({
    title: "库存扣减预览",
    back: "10",
    body,
    action: fixedAction("确认更新库存", `data-action="commit-deduction" data-success-target="14" ${adjusted ? 'data-adjusted="true"' : ""}`)
  });
}

function renderSuccess() {
  const body = `<div class="text-center"><div class="success-mark" aria-hidden="true">✓</div><h2 class="screen-title" tabindex="-1" data-result-heading>库存已更新</h2><p>临期西红柿 T-01 已用完。</p></div>
    <section class="card"><h2>更新后余量</h2>${inventoryList(INVENTORY_AFTER)}</section>
    <p class="helper-text">已保存在本设备</p>`;
  return screen({ title: "更新完成", body, action: fixedAction("完成", 'data-go="15"', { secondary: { label: "查看库存", attrs: 'data-action="show-updated-inventory"' } }) });
}

function renderReturningHome() {
  const body = `
    <div class="split"><div><p class="eyebrow">晚上好，小林</p><h2 class="screen-title">今晚继续用库存</h2></div><span class="status-badge status-satisfied">已确认</span></div>
    <p class="helper-text">数据仅保存在本设备</p>
    <div class="segmented" aria-label="用餐场景"><button type="button" aria-pressed="true">在家吃</button><button type="button" aria-pressed="false" data-action="deferred">外出吃</button></div>
    <div class="spacer-16"></div>${contextCard(true)}
    <div class="notice notice-success"><strong>刚刚已用完 1 批临期西红柿</strong><span>临期批次已从提醒中移除</span></div>
    <section class="card"><h2>当前库存摘要</h2>${inventoryList(INVENTORY_AFTER)}</section>
    <button class="button-link" type="button" data-action="deferred">暂不看库存，随机一顿（后续轮次）</button>`;
  return screen({
    title: "今天",
    body,
    action: fixedAction("今天吃什么", 'data-go="08" data-draw-target="09"', { withNav: true }),
    nav: bottomNav("today")
  });
}

function renderNoResult() {
  const body = `<div class="text-center"><div class="empty-mark" aria-hidden="true">—</div><h2 class="screen-title">这次没有合适结果</h2><p>现有库存暂时没有同时符合 20 分钟内和粤菜偏好的菜单。</p></div>
    <section class="card card-muted"><strong>当前条件仍已保留</strong><p>今晚 · 1 人 · 严格只用库存 · 20 分钟内 · 粤菜偏好</p></section>
    <div class="stack-tight"><button class="button button-secondary button-full" type="button" data-go="20">允许少量补买</button><button class="button button-secondary button-full" type="button" data-go="02">添加库存</button><button class="button-link" type="button" data-go="15">返回首页</button></div>`;
  return screen({ title: "没有结果", back: "07", body, action: fixedAction("调整条件", 'data-go="07" data-open-advanced="true"') });
}

function renderFailure() {
  const body = `<div class="text-center"><div class="error-mark" aria-hidden="true">!</div><h2 class="screen-title">库存还没有更新</h2><p>本次更新整体失败，没有任何食材被部分扣减。</p></div>
    <div class="notice notice-error"><strong>你调整的用量已保留</strong><span>西红柿 280 g · 鸡蛋 2 个 · 大米 90 g</span></div>
    <section class="card"><h2>制作前库存仍为</h2><p>西红柿 400 g · 鸡蛋 4 个 · 大米 200 g</p></section>`;
  return screen({ title: "更新失败", body, action: fixedAction("重试更新", 'data-go="13"', { secondary: { label: "暂不更新库存", attrs: 'data-go="10" data-notice="本次未扣减"' } }) });
}

const OVERLAY_FRAMES = new Set(["02", "03", "04", "05", "07", "12", "17", "19", "20", "22"]);

function sheet({ title, body, primaryLabel, primaryAttrs, closeTarget, secondary = "", full = true }) {
  const discardDialog = state.discardPrompt ? `
    <div class="inline-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-copy">
      <h3 id="discard-title">放弃未保存的修改？</h3>
      <p id="discard-copy">关闭后，本次尚未保存的输入会恢复。</p>
      <div class="stack-tight"><button class="button button-primary button-full" type="button" data-action="discard-and-close" data-close-target="${closeTarget}">放弃修改</button><button class="button button-secondary button-full" type="button" data-action="keep-editing">继续编辑</button></div>
    </div>` : "";
  return `<div class="scrim" data-overlay-frame="${state.currentFrame}">
    <section class="sheet ${full ? "sheet-full" : ""}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="sheet-header"><span></span><h2 id="sheet-title" tabindex="-1">${title}</h2><button class="icon-button" type="button" aria-label="关闭" data-action="close-overlay" data-close-target="${closeTarget}">${icon("close")}</button></header>
      <div class="sheet-body">${body}</div>
      <div class="sheet-actions"><button class="button button-primary button-full" type="button" ${primaryAttrs}>${primaryLabel}</button>${secondary}</div>
      ${discardDialog}
    </section>
  </div>`;
}

function overlayBase(frameId) {
  if (["02", "03", "04", "05"].includes(frameId)) return renderHomeFirst();
  if (["07", "20"].includes(frameId)) return renderReturningHome();
  if (frameId === "12") return renderDeduction(state.previousFrame === "13");
  if (frameId === "17") return renderResult("16");
  if (frameId === "19") return state.previousFrame === "06" ? renderInventory() : renderResult("18");
  if (frameId === "22") return renderResult("21");
  return renderHomeFirst();
}

function renderQuickAddEntry() {
  const hasQuery = state.quickAddQuery.trim().length > 0;
  const suggestion = hasQuery ? `<button class="card card-muted button-full" type="button" data-action="confirm-mapping" style="text-align:left"><strong>可能是：西红柿</strong><span class="helper-text">你输入了“${state.quickAddQuery.replace(/[<>]/g, "")}”</span></button>` : "";
  const body = `<div class="field"><label for="quick-add-input">食材名称</label><input id="quick-add-input" type="search" value="${state.quickAddQuery.replace(/"/g, "&quot;")}" placeholder="例如：番茄" autocomplete="off" data-input="quick-add"><p class="helper-text">数量和日期可稍后补充</p></div>
    ${suggestion}
    <h3 class="section-title">常见食材</h3><div class="cluster"><button class="chip" type="button" data-action="quick-chip" data-value="番茄">番茄</button><button class="chip" type="button" data-action="prototype-intent">鸡蛋</button><button class="chip" type="button" data-action="prototype-intent">青菜</button></div>
    <div class="notice"><strong>轻量录入</strong><span>只填名称也能保存；分类、批次和日期不是首次必填。</span></div>`;
  const secondary = `<p class="helper-text">${hasQuery ? "选择映射建议后即可添加" : "请先添加至少 1 项"}</p>`;
  return sheet({ title: "快速添加食材", body, primaryLabel: "添加当前食材", primaryAttrs: `${hasQuery ? 'data-action="confirm-mapping"' : "disabled"}`, closeTarget: "01", secondary });
}

function renderMappingConfirm() {
  const body = `<p class="helper-text">你输入了：番茄</p>
    <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="field-label">选择标准食材</legend><label class="card card-strong"><input type="radio" name="mapping" checked> <strong>西红柿</strong><span class="helper-text">标准匹配有助于菜谱和库存判断</span></label><label class="card"><input type="radio" name="mapping"> 保留“番茄”作为自定义名称<span class="helper-text">可能减少可匹配菜谱，但仍允许继续</span></label></fieldset>`;
  return sheet({ title: "确认食材名称", body, primaryLabel: "使用“西红柿”", primaryAttrs: 'data-go="04"', closeTarget: "02", secondary: '<button class="button button-secondary button-full" type="button" data-go="02">返回修改</button>' });
}

function renderQuickAddCompleted() {
  const items = [["西红柿", "400 g · 2 批次"], ["鸡蛋", "4 个"], ["大米", "200 g"], ["青菜", "约 1 把"], ["鸡胸肉", "数量未填"], ["土豆", "100 g"], ["常备调料", "油、盐、生抽"]];
  const body = `<div class="notice notice-success"><strong>已添加 7 类食材</strong><span>已逐项保存在本设备，可以继续补充或直接推荐。</span></div><ul class="list">${items.map(([name, amount]) => `<li class="list-row"><div><strong>${name}</strong><small>${amount}</small></div><button class="list-action" type="button" data-action="prototype-intent">补充</button></li>`).join("")}</ul>`;
  return sheet({ title: "快速添加食材", body, primaryLabel: "用这些食材推荐", primaryAttrs: 'data-go="05"', closeTarget: "01", secondary: '<button class="button button-secondary button-full" type="button" data-go="06">查看库存</button>' });
}

function renderSafetyConfirm() {
  const selected = state.safetyChoice === "none";
  const body = `<p>开始推荐前，请明确当前的过敏原、不吃和饮食类型。这里只做一次短确认。</p>
    <div class="stack"><button class="card ${selected ? "card-strong" : ""}" type="button" aria-pressed="${selected}" data-action="select-safety" data-value="none"><strong>暂无限制</strong><span class="helper-text">本轮测试选择此项</span></button><button class="card" type="button" aria-pressed="false" data-action="deferred"><strong>我有需要避开的食材</strong><span class="helper-text">进入安全设置（后续轮次）</span></button></div>
    <div class="notice"><strong>说明</strong><span>结果为日常饮食建议，不替代医疗意见。</span></div>`;
  return sheet({ title: "开始前确认一下饮食限制", body, primaryLabel: "确认并继续", primaryAttrs: selected ? 'data-go="07"' : 'disabled aria-describedby="safety-required"', closeTarget: "04", secondary: selected ? "" : '<p id="safety-required" class="helper-text">请选择一项</p>' });
}

function conditionsBody(topUp) {
  return `<p class="helper-text">本次修改只影响这次推荐，不自动改变长期偏好。</p>
    <div class="field"><span class="field-label">用餐人数</span><div class="segmented"><button type="button" aria-pressed="true">1 人</button><button type="button" aria-pressed="false" data-action="prototype-intent">2 人</button><button type="button" aria-pressed="false" data-action="prototype-intent">4 人</button></div></div>
    <div class="field"><span class="field-label">餐次</span><div class="segmented"><button type="button" aria-pressed="false">午餐</button><button type="button" aria-pressed="true">晚餐</button></div></div>
    <div class="field"><span class="field-label">结果形式</span><div class="segmented"><button type="button" aria-pressed="false">简餐</button><button type="button" aria-pressed="true">正常正餐</button><button type="button" aria-pressed="false">一道菜</button></div></div>
    <div class="field"><span class="field-label">库存模式</span><div class="stack-tight"><button class="card ${topUp ? "" : "card-strong"}" type="button" aria-pressed="${!topUp}" data-go="07"><strong>尽量只用现有食材</strong><span class="helper-text">可能满足或未知时会提示确认</span></button><button class="card ${topUp ? "card-strong" : ""}" type="button" aria-pressed="${topUp}" data-go="20"><strong>允许补买少量</strong><span class="helper-text">展示缺少项与这一顿的补买总额</span></button></div></div>
    ${topUp ? `<div class="field"><label for="top-up-budget">居家补买总预算</label><div class="input-row"><input id="top-up-budget" inputmode="decimal" value="10" aria-describedby="budget-help"><select aria-label="货币"><option>人民币</option></select></div><p id="budget-help" class="helper-text">这一顿额外购买食材的总额，不含已有库存价值，也不是人均预算。</p><label class="switch-row"><span>设为严格上限</span><input type="checkbox"></label></div>` : ""}
    <details><summary>更多条件</summary><div class="stack-tight"><p>辣度：微辣</p><p>营养目标：均衡</p><p>烹饪时间：不限</p><p>菜系：不限</p></div></details>
    <div class="notice"><strong>安全摘要</strong><span>暂无限制</span></div>`;
}

function renderConditions(topUp) {
  return sheet({
    title: topUp ? "允许少量补买" : "推荐条件",
    body: conditionsBody(topUp),
    primaryLabel: "开始抽取",
    primaryAttrs: `data-go="08" data-draw-target="${topUp ? "21" : "09"}"`,
    closeTarget: state.previousFrame === "05" ? "05" : "15"
  });
}

function renderDeductionEdit() {
  const total = Number(state.tomatoT01 || 0) + Number(state.tomatoT02 || 0);
  const invalid = Number(state.tomatoT01) > 180 || Number(state.tomatoT02) > 220 || total <= 0;
  const body = `<p>制作前西红柿共 400 g。系统建议扣 300 g，你可以按实际使用修改。</p>
    <div class="field"><label for="tomato-t01">T-01 临期批次（最多 180 g）</label><div class="input-row"><input id="tomato-t01" inputmode="decimal" value="${state.tomatoT01}" data-input="tomato-t01"><select aria-label="单位"><option>g</option></select></div></div>
    <div class="field"><label for="tomato-t02">T-02 普通批次（最多 220 g）</label><div class="input-row"><input id="tomato-t02" inputmode="decimal" value="${state.tomatoT02}" data-input="tomato-t02"><select aria-label="单位"><option>g</option></select></div></div>
    <section class="card card-muted"><div class="split"><strong>编辑后合计</strong><strong class="mono-number">${total} g</strong></div><p class="helper-text">与菜谱建议相差 ${Math.abs(300 - total)} g，以你的实际使用为准。</p></section>
    ${invalid ? '<p class="input-error" role="alert">单批次用量不能超过制作前余量，且合计需大于 0。</p>' : ""}`;
  return sheet({ title: "修改西红柿用量", body, primaryLabel: "保存调整", primaryAttrs: invalid ? "disabled" : 'data-action="save-deduction-edit"', closeTarget: state.previousFrame === "13" ? "13" : "11", secondary: '<button class="button button-secondary button-full" type="button" data-action="restore-deduction">恢复系统建议</button>' });
}

function renderPossibleDetail() {
  const rows = [["青菜", "需约 150 g", "有约 1 把", "可能够用"], ["大米", "需 100 g", "有 200 g", "满足"], ["油、盐", "菜谱需要", "按常备项假设", "假设可用"]];
  const body = `<div class="notice"><strong>总体：可能够用</strong><span>约数和单位无法精确换算，制作前请确认。</span></div><ul class="list">${rows.map(([name, need, have, status]) => `<li class="list-row"><div><strong>${name} · ${status}</strong><small>${need} / ${have}</small></div>${name === "青菜" ? '<button class="list-action" type="button" data-action="prototype-intent">编辑</button>' : ""}</li>`).join("")}</ul><button class="button-link" type="button" data-go="23">标记没有了</button>`;
  return sheet({ title: "库存判断依据", body, primaryLabel: "确认库存信息", primaryAttrs: 'data-action="close-overlay" data-close-target="16"', closeTarget: "16" });
}

function renderChickenCorrection() {
  const amount = Number(state.chickenQuantity);
  const invalid = !Number.isFinite(amount) || amount <= 0;
  const body = `<p>补充后将重新计算当前推荐，不会静默把未知结果改成满足。</p><div class="field"><label for="chicken-name">食材名称</label><input id="chicken-name" value="鸡胸肉" readonly></div><div class="field"><label for="chicken-quantity">数量</label><div class="input-row"><input id="chicken-quantity" inputmode="decimal" value="${state.chickenQuantity}" data-input="chicken-quantity"><select aria-label="单位"><option>g</option></select></div>${invalid ? '<p class="input-error" role="alert">请输入大于 0 的数量。</p>' : ""}</div><details><summary>日期与其他信息</summary><p class="helper-text">本轮不要求填写日期。</p></details>`;
  return sheet({ title: "补充鸡胸肉余量", body, primaryLabel: "保存并重新计算", primaryAttrs: invalid ? "disabled" : 'data-action="save-chicken"', closeTarget: state.previousFrame === "06" ? "06" : "18", secondary: '<button class="button button-secondary button-full" type="button" data-action="prototype-intent">标记没有了</button>' });
}

function renderMissingDetail() {
  const body = `<div class="notice"><strong>总体：库存不足</strong><span>允许补买后可在本次预算内完成。</span></div>
    <h3 class="section-title">需要补买</h3><ul class="list"><li class="list-row"><div><strong>土豆 · 缺 200 g</strong><small>需 300 g / 有 100 g</small></div><strong>约 ¥1.6</strong></li><li class="list-row"><div><strong>青椒 · 缺 80 g</strong><small>需 80 g / 无库存</small></div><strong>约 ¥1.9</strong></li></ul>
    <h3 class="section-title">库存满足</h3><div class="list-row"><div><strong>大米</strong><small>需 100 g / 有 200 g</small></div><span>满足</span></div>
    <h3 class="section-title">常备假设</h3><p>油、盐、生抽按常备项假设可用。</p>
    <section class="card card-strong"><div class="split"><strong>预计补买总额</strong><strong>¥3.5</strong></div><p class="helper-text">预算上限 ¥10 · 金额均为估算</p></section>`;
  return sheet({ title: "缺少项与补买估算", body, primaryLabel: "确认缺少项", primaryAttrs: 'data-action="close-overlay" data-close-target="21"', closeTarget: "21", secondary: '<button class="button button-secondary button-full" type="button" data-go="20">调整预算</button>' });
}

function renderOverlayFrame(frameId) {
  const overlays = {
    "02": renderQuickAddEntry,
    "03": renderMappingConfirm,
    "04": renderQuickAddCompleted,
    "05": renderSafetyConfirm,
    "07": () => renderConditions(false),
    "12": renderDeductionEdit,
    "17": renderPossibleDetail,
    "19": renderChickenCorrection,
    "20": () => renderConditions(true),
    "22": renderMissingDetail
  };
  return `${overlayBase(frameId)}${overlays[frameId]()}`;
}

function renderIndependentFrame(frameId) {
  const renderers = {
    "01": renderHomeFirst,
    "06": renderInventory,
    "08": renderDraw,
    "09": () => renderResult("09"),
    "10": renderRecipe,
    "11": () => renderDeduction(false),
    "13": () => renderDeduction(true),
    "14": renderSuccess,
    "15": renderReturningHome,
    "16": () => renderResult("16"),
    "18": () => renderResult("18"),
    "21": () => renderResult("21"),
    "23": renderNoResult,
    "24": renderFailure
  };
  return renderers[frameId] ? renderers[frameId]() : renderHomeFirst();
}

function renderFrame() {
  clearTimeout(drawTimer);
  const frame = getFrame(state.currentFrame);
  app.innerHTML = OVERLAY_FRAMES.has(frame.id) ? renderOverlayFrame(frame.id) : renderIndependentFrame(frame.id);
  if (OVERLAY_FRAMES.has(frame.id)) {
    const background = app.querySelector(":scope > .screen");
    if (background) { background.inert = true; background.setAttribute("aria-hidden", "true"); }
  }
  document.querySelector("#current-frame-name").textContent = frame.name;
  document.querySelector("#current-page-id").textContent = `${frame.pageId} · ${frame.type}`;
  if (frame.id === "08") {
    const delay = state.reduceMotion ? 120 : 950;
    drawTimer = window.setTimeout(finishDraw, delay);
  }
  const focusKey = state.pendingFocusKey;
  state.pendingFocusKey = null;
  const applyRouteFocus = () => {
    const target = focusKey
      ? app.querySelector(`[data-focus-key="${focusKey}"]`)
      : app.querySelector(".sheet [tabindex='-1']") || app.querySelector("[data-page-heading], [data-result-heading], h1");
    if (target) target.focus({ preventScroll: true });
  };
  applyRouteFocus();
  window.setTimeout(applyRouteFocus, 32);
}

function updateHash(frameId) {
  const nextHash = `#frame=${frameId}`;
  if (window.location.hash === nextHash) renderFrame();
  else window.location.hash = nextHash;
}

function goToFrame(frameId, options = {}) {
  const next = getFrame(frameId).id;
  state.previousFrame = state.currentFrame;
  if (options.drawTarget) state.drawTarget = getFrame(options.drawTarget).id;
  if (OVERLAY_FRAMES.has(next) && options.focusKey) state.returnFocusKey = options.focusKey;
  state.discardPrompt = false;
  state.currentFrame = next;
  updateHash(next);
  announce(`已进入 Frame ${next}`);
}

function closeOverlay(target, force = false) {
  const dirty = (state.currentFrame === "12" && state.dirtyDeduction) || (state.currentFrame === "19" && state.dirtyChicken);
  if (dirty && !force) {
    state.discardPrompt = true;
    renderFrame();
    return;
  }
  if (force) {
    state.dirtyDeduction = false;
    state.dirtyChicken = false;
  }
  state.pendingFocusKey = state.returnFocusKey;
  goToFrame(target);
}

function finishDraw() {
  clearTimeout(drawTimer);
  const target = state.drawTarget || "09";
  goToFrame(target);
  announce("抽取完成，结果已呈现");
}

function buildFacilitatorPanel() {
  document.querySelector("#task-starts").innerHTML = TEST_STARTS.map(([label, frameId]) =>
    `<button class="button button-secondary button-full" type="button" data-frame="${frameId}">${label}</button>`
  ).join("");
  document.querySelector("#frame-index-list").innerHTML = FRAMES.map((frame) =>
    `<li><button class="button-link" type="button" data-frame="${frame.id}">${frame.id} · ${frame.pageId}</button></li>`
  ).join("");
  document.querySelector("#scope-inventory").innerHTML = `<div class="scope-counts"><span><strong>11</strong><br>Core</span><span><strong>5</strong><br>Supporting</span><span><strong>38</strong><br>Deferred</span></div><p class="deferred-copy">${DEFERRED_PAGE_IDS.join(" · ")}</p>`;
  document.querySelector("#component-inventory").innerHTML = COMPONENTS.map((item) => `<li>${item}</li>`).join("");
  document.querySelector("#test-task-list").innerHTML = TEST_TASKS.map(([label, frameId]) => `<li><button class="button-link" type="button" data-frame="${frameId}">${label}</button></li>`).join("");
  document.querySelector("#validation-question-list").innerHTML = VALIDATION_QUESTIONS.map((question) => `<li>${question}</li>`).join("");
  const toggle = document.querySelector("#reduce-motion-toggle");
  toggle.checked = state.reduceMotion;
  document.querySelector("#draw-outcome-select").value = state.drawTarget;
  document.documentElement.classList.toggle("reduce-motion", state.reduceMotion);
}

function resetPrototype() {
  clearTimeout(drawTimer);
  Object.assign(state, { ...INITIAL_STATE, reduceMotion: document.querySelector("#reduce-motion-toggle").checked });
  state.currentFrame = "01";
  goToFrame("01");
  announce("样例数据已复位");
}

document.addEventListener("click", (event) => {
  const frameButton = event.target.closest("[data-frame]");
  if (frameButton) {
    goToFrame(frameButton.dataset.frame);
    return;
  }
  const nav = event.target.closest("[data-go]");
  if (nav) {
    if (nav.dataset.notice) state.notice = nav.dataset.notice;
    goToFrame(nav.dataset.go, { drawTarget: nav.dataset.drawTarget, focusKey: nav.dataset.focusKey });
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "reset-prototype") resetPrototype();
  if (action === "finish-draw") finishDraw();
  if (action === "close-overlay") closeOverlay(event.target.closest("[data-close-target]").dataset.closeTarget);
  if (action === "discard-and-close") closeOverlay(event.target.closest("[data-close-target]").dataset.closeTarget, true);
  if (action === "keep-editing") { state.discardPrompt = false; renderFrame(); }
  if (action === "confirm-mapping") goToFrame("03");
  if (action === "quick-chip") { state.quickAddQuery = event.target.closest("[data-value]").dataset.value; goToFrame("03"); }
  if (action === "select-safety") { state.safetyChoice = event.target.closest("[data-value]").dataset.value; renderFrame(); announce("已选择暂无限制"); }
  if (action === "restore-deduction") { state.tomatoT01 = "180"; state.tomatoT02 = "120"; state.dirtyDeduction = false; goToFrame("11"); announce("已恢复系统建议，库存尚未更新"); }
  if (action === "save-deduction-edit") { state.dirtyDeduction = false; state.discardPrompt = false; goToFrame("13"); announce("调整已保存到预览，库存尚未更新"); }
  if (action === "save-chicken") { state.dirtyChicken = false; state.discardPrompt = false; goToFrame("08", { drawTarget: "09" }); announce("已更新鸡胸肉余量，正在重新计算"); }
  if (action === "toggle-satisfied-detail") { state.showSatisfiedDetail = !state.showSatisfiedDetail; renderFrame(); }
  if (action === "commit-deduction") {
    event.target.disabled = true;
    event.target.textContent = "正在更新…";
    announce("正在更新库存");
    window.setTimeout(() => goToFrame("14"), state.reduceMotion ? 80 : 320);
  }
  if (action === "show-updated-inventory") {
    state.notice = "库存已更新：西红柿 120 g、鸡蛋 2 个、大米 110 g";
    goToFrame("15");
  }
  if (action === "deferred") announce("此入口属于 Prototype Deferred，本轮不展开");
  if (action === "prototype-intent") announce("已记录查看菜谱意图；该结果的专属菜谱不是本轮独立 Frame");
});

document.addEventListener("input", (event) => {
  const input = event.target.closest("[data-input]");
  if (!input) return;
  if (input.dataset.input === "quick-add") {
    state.quickAddQuery = input.value;
    renderFrame();
    window.requestAnimationFrame(() => {
      const nextInput = app.querySelector("#quick-add-input");
      if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length); }
    });
  }
  if (input.dataset.input === "tomato-t01" || input.dataset.input === "tomato-t02" || input.dataset.input === "chicken-quantity") {
    const inputId = input.id;
    if (input.dataset.input === "tomato-t01") { state.tomatoT01 = input.value; state.dirtyDeduction = true; }
    if (input.dataset.input === "tomato-t02") { state.tomatoT02 = input.value; state.dirtyDeduction = true; }
    if (input.dataset.input === "chicken-quantity") { state.chickenQuantity = input.value; state.dirtyChicken = true; }
    renderFrame();
    window.requestAnimationFrame(() => {
      const nextInput = app.querySelector(`#${inputId}`);
      if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length); }
    });
  }
});

document.addEventListener("keydown", (event) => {
  const sheetElement = app.querySelector(".sheet");
  if (!sheetElement) return;
  if (event.key === "Escape") {
    event.preventDefault();
    const closeButton = sheetElement.querySelector('[data-action="close-overlay"]');
    if (closeButton) closeOverlay(closeButton.dataset.closeTarget);
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...sheetElement.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex="0"]')].filter((element) => !element.closest('[aria-hidden="true"]'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

document.querySelector("#reduce-motion-toggle").addEventListener("change", (event) => {
  state.reduceMotion = event.target.checked;
  document.documentElement.classList.toggle("reduce-motion", state.reduceMotion);
  announce(state.reduceMotion ? "已开启减少动态效果" : "已关闭减少动态效果");
  if (state.currentFrame === "08") renderFrame();
});

document.querySelector("#draw-outcome-select").addEventListener("change", (event) => {
  state.drawTarget = getFrame(event.target.value).id;
  announce(`下一次盲盒分支已设为 Frame ${state.drawTarget}`);
});

window.addEventListener("hashchange", () => {
  const match = window.location.hash.match(/frame=(\d{1,2})/);
  if (match) {
    state.currentFrame = getFrame(match[1]).id;
    renderFrame();
  }
});

window.__PROTOTYPE__ = { FRAMES, TEST_STARTS, TEST_TASKS, VALIDATION_QUESTIONS, COMPONENTS, CORE_PAGE_IDS, SUPPORTING_PAGE_IDS, DEFERRED_PAGE_IDS, state, goToFrame, resetPrototype, getFrame };

buildFacilitatorPanel();
const initialMatch = window.location.hash.match(/frame=(\d{1,2})/);
if (initialMatch) state.currentFrame = getFrame(initialMatch[1]).id;
updateHash(state.currentFrame);
