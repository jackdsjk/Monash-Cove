import { demoData } from "../data/items.js";
import {
  ACTION_LABELS,
  CONTENT_TYPE_LABELS,
  IMPORTANCE_LABELS,
  OPEN_LABELS,
  SOURCE_LABELS,
  escapeHtml,
  filterItems,
  formatAge,
  formatSince,
  groupBySection,
  highlightQuote,
  summarize,
} from "./core.js";

const STORAGE_KEY = "cove-demo-state-v1";
const DEFAULT_STATE = {
  version: 1,
  view: "since",
  source: "all",
  query: "",
  onlyAction: false,
  windowHours: 24,
  foldedOpen: false,
  corrections: {},
  read: {},
};

const $ = (selector) => document.querySelector(selector);
const els = {
  viewTitle: $("#view-title"),
  viewSubtitle: $("#view-subtitle"),
  todayLabel: $("#today-label"),
  summary: $("#summary"),
  feed: $("#feed"),
  search: $("#search"),
  onlyAction: $("#only-action"),
  detail: $("#detail"),
  detailKicker: $("#detail-kicker"),
  detailTitle: $("#detail-title"),
  detailBody: $("#detail-body"),
  toast: $("#toast"),
  reset: $("#reset"),
  markCheck: $("#mark-check"),
  simulate: $("#simulate-sync"),
  sourceCounts: $("#source-counts"),
  sinceCount: $("#since-count"),
  allCount: $("#all-count"),
};

let state = loadState();
let lastFocus = null;

function freshState() {
  return { ...DEFAULT_STATE, corrections: {}, read: {} };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!raw || raw.version !== 1) return freshState();
    return {
      ...DEFAULT_STATE,
      ...raw,
      corrections: raw.corrections && typeof raw.corrections === "object" ? raw.corrections : {},
      read: raw.read && typeof raw.read === "object" ? raw.read : {},
    };
  } catch {
    return freshState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A demo must still work when storage is unavailable.
  }
}

function update(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function currentItems() {
  return filterItems(demoData.items, {
    source: state.source,
    query: state.query,
    onlyAction: state.onlyAction,
    sinceHours: state.view === "since" ? state.windowHours : null,
  });
}

function sourceCounts() {
  const result = { gmail: 0, ed: 0, moodle: 0 };
  for (const item of demoData.items) result[item.source] = (result[item.source] ?? 0) + 1;
  return result;
}

function unreadCount(items) {
  return items.filter((item) => !state.read[item.id]).length;
}

function render() {
  const items = currentItems();
  const summary = summarize(items, state.corrections);
  const allSummary = summarize(demoData.items, state.corrections);
  const counts = sourceCounts();
  const isSince = state.view === "since";

  els.todayLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  els.viewTitle.textContent = isSince ? "自上次查看" : "全部内容";
  els.viewSubtitle.textContent = subtitleFor(items, summary, isSince);
  els.summary.innerHTML = renderSummary(items, summary, allSummary);
  els.sourceCounts.innerHTML = Object.entries(counts)
    .map(([source, count]) => `<div class="source-row" role="listitem"><span class="source-dot source-dot--${source}"></span><span>${SOURCE_LABELS[source]}</span><span class="source-count">${count}</span></div>`)
    .join("");
  els.feed.innerHTML = renderFeed(items);
  els.sinceCount.textContent = String(filterItems(demoData.items, { sinceHours: state.windowHours }).length);
  els.allCount.textContent = String(demoData.items.length);
  els.onlyAction.checked = state.onlyAction;
  if (document.activeElement !== els.search) els.search.value = state.query;

  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelectorAll("[data-source]").forEach((button) => {
    const active = button.dataset.source === state.source;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function subtitleFor(items, summary, isSince) {
  const unread = unreadCount(items);
  if (!isSince) return `全部 ${items.length} 条匿名样本，按注意力层级分组。${unread ? `其中 ${unread} 条未读。` : ""}`;
  if (state.windowHours === 0) return "上次查看后没有新内容。可以点击「模拟同步」看下一次巡检，或切换到全部内容。";
  const windowText = `${formatSince(state.windowHours)}内`;
  return `${windowText}收到 ${items.length} 条更新，其中 ${summary.action} 条需要处理${unread ? `，${unread} 条未读` : ""}。`;
}

function renderSummary(items, summary, allSummary) {
  const uncertain = items.filter((item) => item.actionRequired === "uncertain").length;
  const foldedRatio = allSummary.total ? Math.round((allSummary.folded / allSummary.total) * 100) : 0;
  const tiles = [
    { label: "本次视图", value: items.length, note: "条内容" },
    { label: "必须处理", value: summary.action, note: "条需行动" },
    { label: "待确认", value: uncertain, note: "条缺权威结论" },
    { label: "已折叠", value: allSummary.folded, note: `全体占 ${foldedRatio}%` },
  ];
  return tiles.map((tile) => `<article class="stat"><span class="stat-label">${tile.label}</span><strong>${tile.value}</strong><span class="stat-note">${tile.note}</span></article>`).join("");
}

function renderFeed(items) {
  if (items.length === 0) return renderEmpty();
  return groupBySection(items, state.corrections)
    .map((section) => renderSection(section))
    .join("");
}

function renderSection(section) {
  const collapsed = section.id === "folded" && !state.foldedOpen;
  const cards = section.items.map((item) => renderCard(item)).join("");
  const preview = collapsed
    ? `<div class="folded-preview">${section.items.slice(0, 3).map((item) => `<span>${escapeHtml(item.title)}</span>`).join("")}${section.items.length > 3 ? `<span>等 ${section.items.length} 条</span>` : ""}</div>`
    : "";
  return `<section class="feed-section section--${section.tone}" data-section="${section.id}">
    <header class="section-head">
      <div>
        <p class="section-kicker">${section.tone === "folded" ? "FOLDED" : "BRIEF"}</p>
        <h2>${section.title}<span class="section-count">${section.items.length}</span></h2>
        <p class="section-note">${section.note}</p>
      </div>
      ${section.id === "folded" ? `<button class="button button--quiet" data-action="toggle-fold">${collapsed ? "展开" : "收起"}</button>` : ""}
    </header>
    ${collapsed ? preview : `<div class="card-list">${cards}</div>`}
  </section>`;
}

function renderCard(item) {
  const correction = state.corrections[item.id] ?? {};
  const unread = !state.read[item.id];
  return `<article class="card ${unread ? "is-unread" : "is-read"} ${correction.pinned ? "is-pinned" : ""}" data-card-id="${escapeHtml(item.id)}">
    <div class="card-meta">
      <span class="source-pill source-pill--${item.source}"><span class="source-dot source-dot--${item.source}"></span>${SOURCE_LABELS[item.source] ?? item.source}</span>
      <span>${escapeHtml(item.course || "未归属课程")}</span>
      <span class="meta-separator">·</span>
      <time>${formatAge(item.ageHours)}</time>
      <span class="badge badge--${item.importance}">${IMPORTANCE_LABELS[item.importance] ?? item.importance}</span>
      ${unread ? '<span class="unread-dot" role="img" aria-label="未读"></span>' : ""}
    </div>
    <h3><button class="card-title" data-action="open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button></h3>
    <blockquote>“${escapeHtml(item.evidenceQuote)}”</blockquote>
    <div class="card-tags">
      <span class="tag">${CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}</span>
      <span class="tag">${ACTION_LABELS[item.actionRequired] ?? item.actionRequired}</span>
      <span class="tag">${OPEN_LABELS[item.openOriginal] ?? item.openOriginal}</span>
      ${correction.feedback ? '<span class="tag tag--feedback">已反馈</span>' : ""}
      ${correction.pinned ? '<span class="tag tag--pinned">已置顶</span>' : ""}
    </div>
    <div class="card-actions">
      <button class="text-button" data-action="open" data-id="${escapeHtml(item.id)}">查看原文</button>
      <button class="text-button" data-action="pin" data-id="${escapeHtml(item.id)}">${correction.pinned ? "取消置顶" : "标为重要"}</button>
      <button class="text-button" data-action="dismiss" data-id="${escapeHtml(item.id)}">${correction.dismissed ? "恢复" : "不重要"}</button>
    </div>
  </article>`;
}

function renderEmpty() {
  if (state.query) {
    return `<div class="empty-state"><p class="section-kicker">NO MATCH</p><h2>没有匹配的内容</h2><p>试试更短的关键词，或清除来源筛选。</p><button class="button button--quiet" data-action="clear-search">清除搜索</button></div>`;
  }
  if (state.view === "since" && state.windowHours === 0) {
    return `<div class="empty-state"><p class="section-kicker">UP TO DATE</p><h2>这次巡检没有新内容</h2><p>你刚把当前视图标记为已查看。下一次同步后，新内容会出现在这里。</p><div class="empty-actions"><button class="button button--primary" data-action="simulate-sync">模拟一次同步</button><button class="button button--quiet" data-action="show-all">查看全部内容</button></div></div>`;
  }
  return `<div class="empty-state"><p class="section-kicker">NO ITEMS</p><h2>当前筛选没有内容</h2><p>调整来源或关闭「只看需要行动」再试。</p><button class="button button--quiet" data-action="clear-filters">清除筛选</button></div>`;
}

function openDetail(id) {
  const item = demoData.items.find((candidate) => candidate.id === id);
  if (!item) return;
  lastFocus = document.activeElement;
  if (!state.read[id]) {
    state.read[id] = true;
    saveState();
  }
  renderDetail(item);
  render();
  els.detailBody.scrollTop = 0;
  els.detail.showModal();
}

function renderDetail(item) {
  const correction = state.corrections[item.id] ?? {};
  const feedback = correction.feedback;
  els.detail.dataset.itemId = item.id;
  els.detailKicker.textContent = `${SOURCE_LABELS[item.source] ?? item.source} · ${item.course || "未归属课程"} · ${formatAge(item.ageHours)}`;
  els.detailTitle.textContent = item.title;
  els.detailBody.innerHTML = `
    <div class="detail-labels">
      <span class="badge badge--${item.importance}">${IMPORTANCE_LABELS[item.importance] ?? item.importance}</span>
      <span class="tag">${CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}</span>
      <span class="tag">${ACTION_LABELS[item.actionRequired] ?? item.actionRequired}</span>
      <span class="tag">${OPEN_LABELS[item.openOriginal] ?? item.openOriginal}</span>
    </div>
    <section class="detail-section">
      <h3>原文</h3>
      <p class="source-text">${highlightQuote(item.text, item.evidenceQuote)}</p>
      <p class="evidence-caption">高亮句是模型引用作为判断依据的原文片段。</p>
    </section>
    <section class="detail-section detail-section--panel">
      <div class="panel-head"><h3>模型判断</h3><span class="prelabel">${escapeHtml(demoData.meta.model)} · 预录</span></div>
      <dl class="judgement-grid">
        <div><dt>内容类型</dt><dd>${CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType}</dd></div>
        <div><dt>重要性</dt><dd>${IMPORTANCE_LABELS[item.importance] ?? item.importance}</dd></div>
        <div><dt>行动要求</dt><dd>${ACTION_LABELS[item.actionRequired] ?? item.actionRequired}</dd></div>
        <div><dt>原文建议</dt><dd>${OPEN_LABELS[item.openOriginal] ?? item.openOriginal}</dd></div>
      </dl>
      <p class="panel-note">这是 2026-10-29 的模型快照，不是实时推理。演示环境没有真实来源链接，判断和原文仅用于展示交互。</p>
    </section>
    <div class="detail-actions">
      <button class="button button--quiet" data-action="pin" data-id="${escapeHtml(item.id)}">${correction.pinned ? "取消置顶" : "标为重要"}</button>
      <button class="button button--quiet" data-action="dismiss" data-id="${escapeHtml(item.id)}">${correction.dismissed ? "恢复显示" : "标为不重要"}</button>
      <button class="button button--quiet" data-action="close-dialog">关闭</button>
    </div>
    <section class="detail-section">
      <h3>反馈这条判断</h3>
      <form id="feedback-form" class="feedback-form">
        <fieldset>
          <legend>哪里不对？</legend>
          <div class="radio-row">
            ${feedbackOption("content_type", "内容类型", feedback?.reason)}
            ${feedbackOption("importance", "重要性", feedback?.reason)}
            ${feedbackOption("action", "行动要求", feedback?.reason)}
            ${feedbackOption("other", "其他", feedback?.reason)}
          </div>
        </fieldset>
        <label class="field-label">补充说明<textarea name="note" rows="3" placeholder="可选：告诉 Cove 你期望的判断">${escapeHtml(feedback?.note ?? "")}</textarea></label>
        <div class="form-actions"><button class="button button--primary" type="submit">保存反馈</button>${feedback ? `<span class="saved-note">已在 ${escapeHtml(feedback.at)} 保存</span>` : ""}</div>
      </form>
    </section>`;
}

function feedbackOption(value, label, selected) {
  return `<label class="radio-pill"><input type="radio" name="reason" value="${value}" ${selected === value ? "checked" : ""}><span>${label}</span></label>`;
}

function saveFeedback(form) {
  const data = new FormData(form);
  const reason = String(data.get("reason") ?? "").trim();
  const note = String(data.get("note") ?? "").trim();
  if (!reason && !note) {
    toast("请选择一个原因或写一句说明");
    return;
  }
  const id = els.detail.dataset.itemId;
  const correction = state.corrections[id] ?? {};
  state.corrections[id] = {
    ...correction,
    feedback: {
      reason: reason || "other",
      note,
      at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    },
  };
  saveState();
  render();
  const item = demoData.items.find((candidate) => candidate.id === id);
  if (item) renderDetail(item);
  toast("反馈已保存，仅在本机生效");
}

function toggleCorrection(id, key) {
  const correction = state.corrections[id] ?? {};
  const next = { ...correction, [key]: !correction[key] };
  if (key === "pinned" && next.pinned) next.dismissed = false;
  if (key === "dismissed" && next.dismissed) next.pinned = false;
  state.corrections[id] = next;
  saveState();
  render();
  const item = demoData.items.find((candidate) => candidate.id === id);
  if (item && els.detail.open) renderDetail(item);
  toast(key === "pinned" ? (next.pinned ? "已标为重要" : "已取消置顶") : (next.dismissed ? "已移到折叠区" : "已恢复显示"));
}

function markChecked() {
  const items = currentItems();
  state.windowHours = 0;
  for (const item of items) state.read[item.id] = true;
  saveState();
  render();
  toast("已记录本次查看；下一次同步会显示新内容");
}

function simulateSync() {
  state.windowHours = 1.5;
  state.view = "since";
  saveState();
  render();
  toast("已模拟一次同步：过去 1.5 小时的更新已加载");
}

function resetDemo() {
  state = freshState();
  saveState();
  render();
  toast("演示状态已重置");
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
}

function handleFeedClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === "open") openDetail(id);
  if (action === "pin") toggleCorrection(id, "pinned");
  if (action === "dismiss") toggleCorrection(id, "dismissed");
  if (action === "toggle-fold") update({ foldedOpen: !state.foldedOpen });
  if (action === "simulate-sync") simulateSync();
  if (action === "show-all") update({ view: "all" });
  if (action === "clear-search") update({ query: "" });
  if (action === "clear-filters") update({ query: "", source: "all", onlyAction: false });
}

function bindEvents() {
  els.feed.addEventListener("click", handleFeedClick);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => update({ view: button.dataset.view }));
  });
  document.querySelectorAll("[data-source]").forEach((button) => {
    button.addEventListener("click", () => update({ source: button.dataset.source }));
  });
  els.search.addEventListener("input", () => update({ query: els.search.value }));
  els.onlyAction.addEventListener("change", () => update({ onlyAction: els.onlyAction.checked }));
  els.markCheck.addEventListener("click", markChecked);
  els.simulate.addEventListener("click", simulateSync);
  els.reset.addEventListener("click", resetDemo);
  els.detail.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (target?.dataset.action === "close-dialog") els.detail.close();
  });
  els.detail.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.dataset.action === "pin" || target.dataset.action === "dismiss") {
      toggleCorrection(target.dataset.id, target.dataset.action === "pin" ? "pinned" : "dismissed");
    }
  });
  els.detail.addEventListener("submit", (event) => {
    if (event.target.id !== "feedback-form") return;
    event.preventDefault();
    saveFeedback(event.target);
  });
  els.detail.addEventListener("close", () => {
    render();
    lastFocus?.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== els.search) {
      event.preventDefault();
      els.search.focus();
    }
  });
}

function init() {
  bindEvents();
  render();
}

init();
