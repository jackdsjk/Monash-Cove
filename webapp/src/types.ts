export type Source = "gmail" | "ed" | "moodle";

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

export interface SyncSourceProgress {
  status: "pending" | "running" | "done" | "error";
  processed: number;
  total: number | null;
  message?: string;
}

export interface FullSyncJob {
  id: string;
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  sources: Record<Source, SyncSourceProgress>;
}

export interface AttendanceCode {
  id: string;
  source: "gmail" | "moodle" | "ed";
  course: string;
  week: number;
  session: string;
  code: string;
  title: string;
  url: string;
  publishedAt: string;
}

export interface AttendancePreferenceCourse {
  course: string;
  sessions: string[];
}

export interface AttendancePreferences {
  courses: AttendancePreferenceCourse[];
}

export interface AttendanceAssistantState {
  status: "idle" | "waiting_login" | "connected" | "error" | "cancelled";
  message: string;
  startedAt?: string;
}

export interface AttendanceStatus {
  connected: boolean;
  assistant: AttendanceAssistantState;
}

export interface RuntimeCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface RuntimeStatus {
  platform: string;
  arch: string;
  node: string;
  desktop: boolean;
  dataDir: string;
  checks: RuntimeCheck[];
}

export interface SetupStatus {
  gmailConnected: boolean;
  edConnected: boolean;
  moodleConnected: boolean;
  fullSyncCompleted: boolean;
  setupRequired: boolean;
}

export interface MoodleAssistantState {
  status: "idle" | "waiting_login" | "connected" | "error" | "cancelled";
  message: string;
  startedAt?: string;
}

export interface SyncStatus {
  fullSyncCompleted: boolean;
  job: FullSyncJob | null;
}

export interface SourceStatus {
  id: Source;
  label: string;
  status: "connected" | "degraded" | "error" | "disconnected" | "fixture";
  lastSyncAt: string | null;
  lastError: string | null;
  itemCount: number;
  contentCount?: number;
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
}

export interface MoodleContentItem {
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
}

export interface BriefItem extends DemoItem {
  sourceItemId?: string;
  publishedAt?: string;
  updatedAt?: string;
  url?: string;
  dueAt?: string | null;
  deadlineKind?: string | null;
  contentHash?: string;
  triageVersion?: string;
  model?: string;
  read?: boolean;
  correction?: Correction;
}

export interface DemoItem {
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

export interface DemoMeta {
  title: string;
  generatedAt: string;
  dataset: string;
  model: string;
  modelRun: string;
  privacy: string;
}

export interface DemoData {
  meta: DemoMeta;
  items: DemoItem[];
}

export type FeedbackReason = "content_type" | "importance" | "action" | "other";

export interface Feedback {
  reason: FeedbackReason;
  note: string;
  at: string;
}

export interface Correction {
  pinned?: boolean;
  dismissed?: boolean;
  feedback?: Feedback;
}

export interface DemoState {
  version: 1;
  corrections: Record<string, Correction>;
  read: Record<string, true>;
  windowHours: number;
}

export type SectionId = "action" | "staff" | "important" | "material" | "folded";

export interface SectionMeta {
  id: SectionId;
  title: string;
  note: string;
}

export interface SectionGroup extends SectionMeta {
  items: DemoItem[];
}
