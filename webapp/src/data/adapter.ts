import type { BriefItem, ItemChange as ApiChange, SourceStatus } from "../types";
import type { AuthorRole, ChangeField, Course, Item, ItemChange, SourceId, SourceState, SyncState } from "./model";

const H = 3600_000;
const EPOCH = Date.parse("1970-01-01T00:00:00Z");

function role(value: string): AuthorRole {
  if (value === "staff") return "staff";
  if (value === "student") return "student";
  return "system";
}

function ms(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > EPOCH ? parsed : fallback;
}

/** 本地服务的条目 → Make 版界面的 Item。字段含义不变，只做形状转换。 */
export function toItem(item: BriefItem, now: number): Item {
  const publishedAt = ms(item.publishedAt, now - (item.ageHours ?? 0) * H);
  const firstSeenAt = ms(item.firstSeenAt, publishedAt);
  return {
    id: item.id,
    source: item.source as SourceId,
    course: item.course ?? "",
    title: item.title,
    objectType: item.contentType ?? "",
    author: { name: "", role: role(item.authorRole ?? "unknown") },
    publishedAt: ms(item.publishedAt ?? item.updatedAt, publishedAt),
    firstSeenAt,
    dueAt: item.dueAt ? ms(item.dueAt, 0) || undefined : undefined,
    completedAt: item.completedAt ? ms(item.completedAt, 0) || undefined : undefined,
    excerpt: item.evidenceQuote ?? "",
    body: item.text ?? "",
    url: item.url ?? "",
    location: item.deadlineKind ?? "",
  };
}

const FIELD_MAP: Record<string, ChangeField> = {
  due_at: "due_at",
  title: "title",
  course: "course",
  text: "body",
};

/** item_changes 表的字段名 → 界面上的字段名 */
export function toChange(change: ApiChange): ItemChange {
  const field = FIELD_MAP[change.field] ?? "body";
  return {
    id: String(change.id),
    itemId: change.itemId,
    field,
    before: change.before ?? "",
    after: change.after ?? "",
    detectedAt: ms(change.changedAt, 0),
  };
}

function syncState(status: SourceStatus["status"]): SyncState {
  if (status === "connected") return "idle";
  if (status === "degraded") return "error";
  if (status === "fixture") return "idle";
  if (status === "disconnected") return "disconnected";
  return "error";
}

export function toSource(source: SourceStatus, itemCount: number): SourceState {
  return {
    id: source.id as SourceId,
    // 「连过没有」看凭据，不看上次同步成不成功；error/degraded 仍然是已连接。
    connected: source.status !== "disconnected" && source.status !== "fixture",
    state: syncState(source.status),
    lastSyncAt: source.lastSyncAt ? ms(source.lastSyncAt, 0) : undefined,
    lastSuccessAt: source.lastSyncAt ? ms(source.lastSyncAt, 0) : undefined,
    error: source.lastError ?? undefined,
    itemCount,
    account: source.account ?? "",
  };
}

/** 课程清单从真实条目里长出来，不再用写死的四门课。 */
export function coursesOf(items: Item[]): Course[] {
  const seen = new Map<string, Course>();
  for (const item of items) {
    if (!item.course || seen.has(item.course)) continue;
    seen.set(item.course, { code: item.course, name: "" });
  }
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
}
