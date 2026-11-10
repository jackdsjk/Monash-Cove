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

/**
 * `submitted` 只代表门户明确回显成功；`unknown` / `timeout` / `error` 都表示
 * 结果未知，界面不能把它们写成成功，也不能自动重试。
 */
export type AttendanceSubmitStatus =
  | 'submitted'
  | 'invalid_code'
  | 'not_open'
  | 'not_found'
  | 'timeout'
  | 'error'
  | 'unknown'
  | 'not_attempted';

export interface AttendanceSubmitResult {
  course?: string;
  week?: number;
  session?: string;
  code: string;
  status: AttendanceSubmitStatus;
  message: string;
  /** 门户原话，原样展示给用户核对 */
  feedback?: string;
}

export interface AttendanceSubmitSummary {
  submitted: number;
  failed: number;
  results: AttendanceSubmitResult[];
}

/** 一场考试，来自 Monash 学生门户（不是 Moodle）。 */
export interface PortalExam {
  id: string;
  courseCode: string;
  /** 门户里的考试类型（如 Final Examination），单位名称留在 raw_json。 */
  title: string;
  startMs: number;
  endMs: number;
  /** IANA 时区，如 Asia/Kuala_Lumpur；日期时间必须按它显示。 */
  timezone: string;
  campus: string;
  location: string;
  seat: string | null;
  durationMin: number | null;
}

export interface PortalExamsResponse {
  exams: PortalExam[];
  syncedAt: string | null;
  /** 已保存的学生门户登录 profile 是否存在；不代表这次会话仍有效。 */
  connected: boolean;
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
  /** 平台上报的登录账号；拿不到时为 null */
  account?: string | null;
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

/** Moodle 成绩册里的一个评分项。表格里没有的字段是 null / 空字符串，不补默认值。 */
export interface MoodleGradeItem {
  id: string;
  name: string;
  /** 已发布的分数；未发布时为 null（不是 0） */
  grade: number | null;
  /** 分项满分，来自 Range 列；Moodle 没印 Range 时为 null */
  gradeMax: number | null;
  /** 占总评的权重；没有 Weight 列时为 null */
  weight: number | null;
  feedback: string;
  /** Moodle 原文日期（按账号语言渲染），无法可靠转成时间戳 */
  gradedAt: string | null;
}

/** 一门课的成绩册内容，直接对应 Moodle 的用户成绩报告页。 */
export interface MoodleGradeCourse {
  courseId: string;
  courseName: string;
  items: MoodleGradeItem[];
  /** 课程总分行；Moodle 没印总分行时两项都是 null */
  total: { earned: number | null; max: number | null };
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

/** 一条 OnTrack 评论，用于任务对话抽屉。 */
export interface OnTrackCommentView {
  id: string;
  type: string;
  comment: string;
  createdAt: string;
  authorId: number | null;
  authorName: string;
}

/** 每个来源的登录凭据有效期。 */
export interface CredentialInfo {
  source: Source;
  connected: boolean;
  expiresAt: string | null;
  renewable: boolean;
  note: string;
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

/** 一条已同步到本机的 Moodle 作业，以及能安全关联到它的变更与 Ed 帖子。 */
export interface PackAssignmentView {
  id: string;
  courseId: string;
  /** 由课程名解析出的课程代码，如 FIT1047。 */
  course: string;
  /** Moodle 里的课程 shortname，如 FIT1047_S2_2026。 */
  courseName: string;
  sectionTitle: string;
  title: string;
  url: string;
  /** Moodle 作业正文；没有正文时为空字符串，不补默认值。 */
  text: string;
  updatedAt: string;
  dueAt: string | null;
  completedAt: string | null;
  changes: Array<{ field: string; before: string | null; after: string | null; changedAt: string }>;
  posts: Array<{
    id: string;
    number: number | null;
    title: string;
    text: string;
    authorRole: "staff" | "student";
    publishedAt: string;
    url: string;
  }>;
}

/** 「作业资料包」页的只读数据源；评分标准后端没有，固定为 null。 */
export interface PackResponse {
  rubric: null;
  /** 每份作业按角色最多带几条 Ed 帖子，用来在界面上如实说明范围。 */
  postsPerRole: number;
  assignments: PackAssignmentView[];
}
