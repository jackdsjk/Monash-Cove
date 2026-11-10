export type Source = "gmail" | "ed" | "moodle" | "ontrack";
export type ContentType =
  | "required_action"
  | "requirement_change"
  | "staff_announcement"
  | "staff_answer"
  | "peer_question"
  | "learning_material"
  | "assessment_fact"
  | "administrative"
  | "promotion"
  | "noise";
export type Importance = "critical" | "important" | "reference" | "skip";
export type ActionRequired = "yes" | "no" | "uncertain";
export type OpenOriginal = "required" | "optional" | "no";

export interface FixtureItem {
  id: string;
  source: Source;
  course: string;
  title: string;
  authorRole: string;
  text: string;
  ageHours: number;
  contentType: ContentType;
  importance: Importance;
  actionRequired: ActionRequired;
  openOriginal: OpenOriginal;
  evidenceQuote: string;
}

export interface StoredItem {
  id: string;
  source: Source;
  sourceItemId: string;
  course: string;
  title: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  /** Local ingestion time, preserved when the source item is updated. */
  firstSeenAt: string;
  url: string;
  ageHours: number;
  dueAt: string | null;
  deadlineKind: string | null;
  /** Set once Moodle reports the submission as sent or graded, or by the user. */
  completedAt: string | null;
  /** "moodle" = 自动识别，"user" = 手动标记 */
  completedSource: string | null;
  contentHash: string;
  contentType: ContentType;
  importance: Importance;
  actionRequired: ActionRequired;
  openOriginal: OpenOriginal;
  evidenceQuote: string;
  text: string;
  triageVersion: string;
  model: string;
  read: boolean;
  correction?: {
    pinned?: boolean;
    dismissed?: boolean;
    feedback?: { reason: string; note: string; at: string };
  };
}

export interface NewItem {
  id: string;
  source: Source;
  sourceItemId: string;
  course: string;
  title: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
  dueAt?: string | null;
  deadlineKind?: string | null;
  completedAt?: string | null;
  contentHash: string;
  contentType: ContentType;
  importance: Importance;
  actionRequired: ActionRequired;
  openOriginal: OpenOriginal;
  evidenceQuote: string;
  text: string;
  triageVersion: string;
  model: string;
}

export interface SourceStatus {
  id: Source;
  label: string;
  status: "connected" | "degraded" | "error" | "disconnected" | "fixture";
  lastSyncAt: string | null;
  lastError: string | null;
  itemCount: number;
  contentCount?: number;
  /** Signed-in account for this source; null when the platform never told us. */
  account?: string | null;
}

export interface BriefResponse {
  items: StoredItem[];
  sources: SourceStatus[];
  syncedAt: string | null;
  lastCheckedAt: string | null;
}

export type ChangeField = "due_at" | "title" | "course" | "text";

/** 一条源头内容的变化记录，用于「自上次查看，哪几条改过」。 */
export interface ItemChange {
  id: number;
  itemId: string;
  field: ChangeField;
  before: string | null;
  after: string | null;
  changedAt: string;
  source: Source;
  course: string;
  title: string;
}

export interface ChangesResponse {
  changes: ItemChange[];
  since: string | null;
}

export interface MoodleCourseSummary {
  id: number;
  shortname: string;
  fullname: string;
}

export interface MoodleContentRow {
  id: string;
  courseId: string;
  courseName: string;
  sectionNumber: number;
  sectionTitle: string;
  module: string;
  title: string;
  url: string;
  text: string;
  updatedAt: string;
  campus?: "malaysia" | "australia" | "indonesia" | "shared";
  /** Absolute URLs of images inside a label/forum, captured at sync time. */
  images?: string[];
  /** Content-Length of a resource/url file; null when Moodle did not report one. */
  sizeBytes?: number | null;
}

/** One exam row captured from the Monash student portal. */
export interface PortalExam {
  id: string;
  courseCode: string;
  /** The portal's activity type ("Final Examination"), not the unit name. */
  title: string;
  startMs: number;
  endMs: number;
  /** IANA zone the portal reports for this exam, e.g. "Asia/Kuala_Lumpur". */
  timezone: string;
  campus: string;
  location: string;
  seat: string | null;
  durationMin: number | null;
  /** The original portal event, kept for re-parsing after a mapper change. */
  rawJson: string;
}

/** What the browser sees: the raw portal event stays in SQLite. */
export interface PortalExamView extends Omit<PortalExam, "rawJson"> {
  syncedAt: string;
}

export interface ApiError {
  error: { code: string; message: string; retryable: boolean };
}
