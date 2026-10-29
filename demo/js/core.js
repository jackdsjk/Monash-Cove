// Pure presentation rules for the anonymous Cove demo.
// No DOM, storage, network, or model calls belong in this module.

export const SOURCE_LABELS = {
  gmail: "Gmail",
  ed: "Ed",
  moodle: "Moodle",
};

export const CONTENT_TYPE_LABELS = {
  required_action: "要求行动",
  requirement_change: "要求变更",
  staff_announcement: "教学通知",
  staff_answer: "教师答复",
  peer_question: "学生提问",
  learning_material: "学习资料",
  assessment_fact: "考核事实",
  administrative: "行政通知",
  promotion: "推广活动",
  noise: "无关内容",
};

export const IMPORTANCE_LABELS = {
  critical: "必须处理",
  important: "重要",
  reference: "参考",
  skip: "折叠",
};

export const ACTION_LABELS = {
  yes: "需要行动",
  no: "无需行动",
  uncertain: "待确认",
};

export const OPEN_LABELS = {
  required: "建议看原文",
  optional: "可看原文",
  no: "无需打开",
};

export const SECTION_META = [
  { id: "action", title: "必须处理", note: "错过可能影响提交、资格或成绩", tone: "critical" },
  { id: "staff", title: "教师答复", note: "教学人员给出的可复用结论", tone: "staff" },
  { id: "important", title: "重要更新", note: "与课程安排或作业理解直接相关", tone: "important" },
  { id: "material", title: "新资料", note: "录播、阅读和补充材料，默认折叠", tone: "material" },
  { id: "folded", title: "已折叠", note: "推广、重复、低相关或参考内容", tone: "folded" },
];

export function sectionFor(item, correction = {}) {
  if (correction.dismissed) return "folded";
  if (correction.pinned) return "action";
  if (item.importance === "critical") return "action";
  if (item.actionRequired === "yes" && item.importance === "important") return "action";
  if (item.importance === "important" && item.contentType === "staff_answer") return "staff";
  if (item.importance === "important") return "important";
  if (item.importance === "reference" && item.contentType === "learning_material") return "material";
  return "folded";
}

export function groupBySection(items, corrections = {}) {
  const buckets = new Map(SECTION_META.map((section) => [section.id, []]));
  for (const item of items) {
    const section = sectionFor(item, corrections[item.id]);
    buckets.get(section)?.push(item);
  }
  for (const section of SECTION_META) {
    buckets.get(section.id).sort((a, b) => compareItems(a, b, corrections));
  }
  return SECTION_META
    .map((section) => ({ ...section, items: buckets.get(section.id) }))
    .filter((section) => section.items.length > 0);
}

function compareItems(a, b, corrections) {
  const pinnedA = corrections[a.id]?.pinned ? 0 : 1;
  const pinnedB = corrections[b.id]?.pinned ? 0 : 1;
  if (pinnedA !== pinnedB) return pinnedA - pinnedB;
  const rank = { critical: 0, important: 1, reference: 2, skip: 3 };
  const byImportance = (rank[a.importance] ?? 4) - (rank[b.importance] ?? 4);
  return byImportance !== 0 ? byImportance : a.ageHours - b.ageHours;
}

export function filterItems(items, options = {}) {
  const query = (options.query ?? "").trim().toLowerCase();
  const source = options.source ?? "all";
  const sinceHours = options.sinceHours;
  return items
    .filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      if (sinceHours != null && item.ageHours > sinceHours) return false;
      if (options.onlyAction && item.actionRequired !== "yes" && item.importance !== "critical") return false;
      if (!query) return true;
      return [item.title, item.course, item.text, SOURCE_LABELS[item.source] ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => a.ageHours - b.ageHours);
}

export function summarize(items, corrections = {}) {
  const summary = {
    total: items.length,
    action: 0,
    staff: 0,
    important: 0,
    material: 0,
    folded: 0,
    sources: { gmail: 0, ed: 0, moodle: 0 },
  };
  for (const item of items) {
    summary[sectionFor(item, corrections[item.id])] += 1;
    if (item.source in summary.sources) summary.sources[item.source] += 1;
  }
  return summary;
}

export function formatAge(ageHours) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return "刚刚";
  if (ageHours < 1) return `${Math.max(1, Math.round(ageHours * 60))} 分钟前`;
  if (ageHours < 24) return `${Math.round(ageHours)} 小时前`;
  if (ageHours < 48) return "昨天";
  return `${Math.floor(ageHours / 24)} 天前`;
}

export function formatSince(hours) {
  if (hours < 36) return `${Math.max(1, Math.round(hours))} 小时`;
  return `${Math.round(hours / 24)} 天`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function highlightQuote(text, quote) {
  const source = String(text ?? "");
  const needle = String(quote ?? "");
  const index = needle ? source.indexOf(needle) : -1;
  if (index === -1) return escapeHtml(source);
  return [
    escapeHtml(source.slice(0, index)),
    "<mark>",
    escapeHtml(needle),
    "</mark>",
    escapeHtml(source.slice(index + needle.length)),
  ].join("");
}

export function itemSummary(item) {
  const quote = item.evidenceQuote || item.text;
  return quote.length > 150 ? `${quote.slice(0, 147).trimEnd()}…` : quote;
}
