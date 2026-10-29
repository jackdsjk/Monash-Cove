import type {
  ActionRequired,
  ContentType,
  Correction,
  DemoItem,
  Importance,
  OpenOriginal,
  SectionGroup,
  SectionId,
  Source,
} from "../types";

export const SOURCE_LABELS: Record<Source, string> = {
  gmail: "Gmail",
  ed: "Ed",
  moodle: "Moodle",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
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

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  critical: "必须处理",
  important: "重要",
  reference: "参考",
  skip: "折叠",
};

export const ACTION_LABELS: Record<ActionRequired, string> = {
  yes: "需要行动",
  no: "无需行动",
  uncertain: "待确认",
};

export const OPEN_LABELS: Record<OpenOriginal, string> = {
  required: "建议看原文",
  optional: "可看原文",
  no: "无需打开",
};

export const SECTION_META: Array<{ id: SectionId; title: string; note: string }> = [
  { id: "action", title: "必须处理", note: "错过可能影响提交、资格或成绩" },
  { id: "staff", title: "教师答复", note: "教学人员给出的可复用结论" },
  { id: "important", title: "重要更新", note: "与课程安排或作业理解直接相关" },
  { id: "material", title: "新资料", note: "录播、阅读和补充材料" },
  { id: "folded", title: "已折叠", note: "推广、重复或低相关内容" },
];

export function sectionFor(item: DemoItem, correction: Correction = {}): SectionId {
  if (correction.dismissed) return "folded";
  if (correction.pinned) return "action";
  if (item.importance === "critical") return "action";
  if (item.actionRequired === "yes" && item.importance === "important") return "action";
  if (item.importance === "important" && item.contentType === "staff_answer") return "staff";
  if (item.importance === "important") return "important";
  if (item.importance === "reference" && item.contentType === "learning_material") return "material";
  return "folded";
}

export function groupBySection(items: DemoItem[], corrections: Record<string, Correction> = {}): SectionGroup[] {
  const buckets = new Map<SectionId, DemoItem[]>(SECTION_META.map((section) => [section.id, []]));
  for (const item of items) {
    const section = sectionFor(item, corrections[item.id]);
    buckets.get(section)?.push(item);
  }
  return SECTION_META
    .map((section) => ({
      ...section,
      items: (buckets.get(section.id) ?? []).sort((a, b) => {
        const pinA = corrections[a.id]?.pinned ? 0 : 1;
        const pinB = corrections[b.id]?.pinned ? 0 : 1;
        if (pinA !== pinB) return pinA - pinB;
        return a.ageHours - b.ageHours;
      }),
    }))
    .filter((section) => section.items.length > 0);
}

export function filterItems(
  items: DemoItem[],
  options: { source: "all" | Source; query: string; onlyAction: boolean; sinceHours: number | null },
): DemoItem[] {
  const query = options.query.trim().toLowerCase();
  return items
    .filter((item) => {
      if (options.source !== "all" && item.source !== options.source) return false;
      if (options.sinceHours !== null && item.ageHours > options.sinceHours) return false;
      if (options.onlyAction && item.actionRequired !== "yes" && item.importance !== "critical") return false;
      if (!query) return true;
      return [item.title, item.course, item.text, SOURCE_LABELS[item.source]]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => a.ageHours - b.ageHours);
}

export function summarize(items: DemoItem[], corrections: Record<string, Correction> = {}) {
  const summary = { total: items.length, action: 0, staff: 0, important: 0, material: 0, folded: 0 };
  const sources: Record<Source, number> = { gmail: 0, ed: 0, moodle: 0 };
  for (const item of items) {
    summary[sectionFor(item, corrections[item.id])] += 1;
    sources[item.source] += 1;
  }
  return { ...summary, sources };
}

export function formatAge(ageHours: number): string {
  if (!Number.isFinite(ageHours) || ageHours < 0) return "刚刚";
  if (ageHours < 1) return `${Math.max(1, Math.round(ageHours * 60))} 分钟前`;
  if (ageHours < 24) return `${Math.round(ageHours)} 小时前`;
  if (ageHours < 48) return "昨天";
  return `${Math.floor(ageHours / 24)} 天前`;
}

export function formatWindow(hours: number): string {
  if (hours === 0) return "刚刚";
  if (hours < 24) return `${hours} 小时`;
  return `${Math.round(hours / 24)} 天`;
}
