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

export interface ItemReply {
  id: string;
  authorName: string;
  authorRole: "staff" | "student" | "unknown";
  text: string;
  createdAt: string;
  depth: number;
}

export interface ItemSourceDetail {
  authorName: string;
  authorRole: "staff" | "student" | "unknown";
  text: string;
  replies: ItemReply[];
  url: string;
  warning: string | null;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  hasUpdate: boolean;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  notes: string | null;
  checkedAt: string;
  error: string | null;
}

export interface EdCourse {
  id: number;
  code: string;
  name: string;
}

export interface EdLessonSummary {
  id: number;
  title: string;
  slideCount: number;
}

export interface EdMaterialFile {
  name: string;
  url: string;
  kind: "slides" | "pdf" | "file";
}

export interface EdMaterialSlide {
  id: number;
  title: string;
  type: "video" | "text" | "slides" | "quiz" | "file";
  url: string;
  text: string;
  markdown: string;
  videoUrls: string[];
  files: EdMaterialFile[];
}

export interface EdLessonDetail {
  id: number;
  courseId: number;
  title: string;
  slides: EdMaterialSlide[];
}

export interface AttendanceCode {
  id: string;
  source: "gmail" | "moodle" | "ed" | string;
  course: string;
  week: number;
  session: string;
  code: string;
  title: string;
  url: string;
  publishedAt: string;
  /** "text" 来自正文正则，"ocr" 来自图片识别，需要人工核对 */
  origin?: "text" | "ocr";
  filledAt?: string | null;
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
  campus?: "malaysia" | "australia" | "indonesia" | "shared";
}

/** 已连接的 OnTrack 账号，用于在界面上显示"现在是谁在用"。 */
export interface OnTrackAccount {
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  expiresAt: string | null;
  refreshedAt: string | null;
}

/** OnTrack 任务，来自只读 overview 接口。 */
export interface OnTrackTaskRow {
  id: number;
  taskDefinitionId: number;
  abbreviation: string;
  name: string;
  description: string;
  status: string;
  dueDate: string | null;
  targetDueDate: string | null;
  submissionDate: string | null;
  completionDate: string | null;
  weighting: number | null;
  timesAssessed: number;
  numNewComments: number;
}

export interface OnTrackOverview {
  connected: boolean;
  account: OnTrackAccount | null;
  projects: Array<{
    id: number;
    unitId: number;
    unitCode: string;
    unitName: string;
    tasks: OnTrackTaskRow[];
  }>;
  error?: string;
}

/** 一个 OnTrack 任务，来自实时只读接口（不是简报条目）。 */
export interface OnTrackTaskView {
  id: number;
  taskDefinitionId: number;
  abbreviation: string;
  name: string;
  description: string;
  status: string;
  dueDate: string | null;
  targetDueDate: string | null;
  submissionDate: string | null;
  completionDate: string | null;
  weighting: number | null;
  timesAssessed: number;
  numNewComments: number;
  projectId: number;
  unitCode: string;
  unitName: string;
}

export interface OnTrackProjectView {
  id: number;
  unitId: number;
  unitCode: string;
  unitName: string;
}

export type ChangeField = "due_at" | "title" | "course" | "text";

/** 一条源头内容的变化，用于「自上次查看，哪几条改过」。 */
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

export interface BriefItem extends DemoItem {
  sourceItemId?: string;
  publishedAt?: string;
  updatedAt?: string;
  url?: string;
  dueAt?: string | null;
  deadlineKind?: string | null;
  /** Moodle 已确认提交/评分的时间；有值时不再是待办 */
  completedAt?: string | null;
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
