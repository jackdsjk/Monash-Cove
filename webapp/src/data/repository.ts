import type { CredentialInfo, OnTrackAccount, OnTrackCommentView, OnTrackProjectView, OnTrackTaskView, OnTrackOverview, AttendanceAssistantState, AttendanceCode, AttendancePreferences, AttendanceStatus, BriefItem, EdCourse, EdLessonDetail, EdLessonSummary, ItemChange, ItemSourceDetail, MoodleAssistantState, MoodleContentItem, MoodleCourse, MoodleGradeCourse, PackResponse, PortalExamsResponse, RuntimeStatus, SetupStatus, SourceStatus, SyncStatus, UpdateStatus } from "../types";

export interface BriefData {
  items: BriefItem[];
  sources: SourceStatus[];
  syncedAt: string | null;
  lastCheckedAt: string | null;
}

const API = "/api";

/** Local service calls are quick; a hung request must not freeze the UI. */
const REQUEST_TIMEOUT_MS = 20_000;

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function getJson<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const response = await request(path, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Local API returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** The UI contract is a list of normalized items; the service owns source access. */
export async function fetchBrief(): Promise<BriefData> {
  return getJson<BriefData>("/brief");
}

/** Live OnTrack tasks grouped by project, for the OnTrack page. */
export async function fetchOnTrackOverview(): Promise<OnTrackOverview> {
  return getJson<OnTrackOverview>("/ontrack/overview");
}

/** The OnTrack account the local credential belongs to, if one is connected. */
export async function fetchOnTrackAccount(): Promise<{ connected: boolean; account: OnTrackAccount | null }> {
  return getJson<{ connected: boolean; account: OnTrackAccount | null }>("/ontrack/account");
}

/** Live task list straight from OnTrack; used by the OnTrack page. */
export async function fetchOnTrackTasks(): Promise<{ projects: OnTrackProjectView[]; tasks: OnTrackTaskView[] }> {
  return getJson<{ projects: OnTrackProjectView[]; tasks: OnTrackTaskView[] }>("/ontrack/tasks");
}

/** The full comment thread for one task, oldest first. */
export async function fetchOnTrackComments(projectId: number, taskDefinitionId: number): Promise<{
  comments: OnTrackCommentView[];
  viewerId: number | null;
}> {
  return getJson<{ comments: OnTrackCommentView[]; viewerId: number | null }>(
    `/ontrack/comments?project=${projectId}&task=${taskDefinitionId}`,
  );
}

/** How long each source's stored credential stays valid. */
export async function fetchCredentials(): Promise<CredentialInfo[]> {
  const data = await getJson<{ credentials: CredentialInfo[] }>("/credentials");
  return data.credentials;
}

/** Field-level changes recorded since a timestamp; empty when nothing changed. */
export async function fetchChanges(since?: string | null): Promise<ItemChange[]> {
  const path = since ? `/changes?since=${encodeURIComponent(since)}` : "/changes";
  const data = await getJson<{ changes: ItemChange[] }>(path);
  return data.changes;
}

export async function fetchUpdateStatus(refresh = false): Promise<UpdateStatus> {
  return getJson<UpdateStatus>(`/update${refresh ? "?refresh=1" : ""}`);
}

export async function fetchEdCourses(): Promise<EdCourse[]> {
  const data = await getJson<{ courses: EdCourse[] }>("/ed/courses");
  return data.courses;
}

export async function fetchEdLessons(courseId: number): Promise<EdLessonSummary[]> {
  const data = await getJson<{ lessons: EdLessonSummary[] }>(`/ed/lessons?courseId=${courseId}`);
  return data.lessons;
}

export async function fetchEdLesson(lessonId: number): Promise<EdLessonDetail> {
  return getJson<EdLessonDetail>(`/ed/lesson?lessonId=${lessonId}`);
}

export async function fetchItemDetail(id: string): Promise<ItemSourceDetail> {
  return getJson<ItemSourceDetail>(`/items/${encodeURIComponent(id)}/detail`);
}

export async function setItemCompleted(id: string, completed: boolean | null): Promise<BriefItem> {
  const response = await request(`/items/${encodeURIComponent(id)}/completed`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `更新完成状态失败（HTTP ${response.status}）`);
  }
  return response.json() as Promise<BriefItem>;
}

export async function fetchSources(): Promise<SourceStatus[]> {
  const data = await getJson<{ sources: SourceStatus[] }>("/sources");
  return data.sources;
}

export async function fetchAttendanceStatus(): Promise<AttendanceStatus> {
  return getJson<AttendanceStatus>("/attendance/status");
}

export interface AttendanceOcrStats {
  scanned: number;
  failed: number;
  pending: number;
}

export interface AttendanceCodesResult {
  codes: AttendanceCode[];
  ocr: AttendanceOcrStats | null;
  lastScanAt: string | null;
}

export async function fetchAttendanceCodes(refresh = false, rescan = false): Promise<AttendanceCodesResult> {
  const params = new URLSearchParams();
  if (refresh) params.set("refresh", "1");
  if (rescan) params.set("rescan", "1");
  const query = params.toString();
  return getJson<AttendanceCodesResult>(`/attendance/codes${query ? `?${query}` : ""}`);
}

export async function startAttendanceAssistant(): Promise<AttendanceAssistantState> {
  const response = await request("/attendance/connect/start", { method: "POST" });
  const data = (await response.json()) as { assistant: AttendanceAssistantState };
  return data.assistant;
}

export async function fetchAttendancePreferences(): Promise<AttendancePreferences> {
  return getJson<AttendancePreferences>("/attendance/preferences");
}

export async function saveAttendancePreferences(preferences: AttendancePreferences): Promise<AttendancePreferences> {
  const response = await request("/attendance/preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) throw new Error("保存签到班次失败");
  return response.json() as Promise<AttendancePreferences>;
}

export async function detectAttendancePreferences(): Promise<AttendancePreferences> {
  const response = await request("/attendance/detect", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { preferences?: AttendancePreferences; error?: { message?: string } } | null;
  if (!response.ok || !body?.preferences) throw new Error(body?.error?.message ?? "识别签到班次失败");
  return body.preferences;
}

export async function fetchAttendanceAssistant(): Promise<AttendanceAssistantState> {
  const data = await getJson<{ assistant: AttendanceAssistantState }>("/attendance/connect/status");
  return data.assistant;
}

export async function cancelAttendanceAssistant(): Promise<AttendanceAssistantState> {
  const response = await request("/attendance/connect/cancel", { method: "POST" });
  const data = (await response.json()) as { assistant: AttendanceAssistantState };
  return data.assistant;
}

export async function fillAttendanceCode(code: AttendanceCode): Promise<{ status: "filled" | "inactive" | "not_found"; message: string }> {
  const response = await request("/attendance/fill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ course: code.course, week: code.week, session: code.session, code: code.code }),
  });
  const body = (await response.json().catch(() => null)) as { status?: "filled" | "inactive" | "not_found"; message?: string; error?: { message?: string } } | null;
  if (!response.ok || !body?.status) throw new Error(body?.error?.message ?? body?.message ?? `Attendance fill returned ${response.status}`);
  return { status: body.status, message: body.message ?? "" };
}

export interface AttendanceBulkResult {
  filled: number;
  inactive: number;
  notFound: number;
  results: Array<{ course?: string; week?: number; session?: string; code?: string; status: string; message?: string }>;
}

export async function fillAllAttendanceCodes(codes: AttendanceCode[]): Promise<AttendanceBulkResult> {
  const response = await request("/attendance/fill-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: codes.map((code) => ({ course: code.course, week: code.week, session: code.session, code: code.code })),
    }),
  });
  const body = (await response.json().catch(() => null)) as (AttendanceBulkResult & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message ?? `Attendance bulk fill returned ${response.status}`);
  return body;
}

export interface UnmatchedAttendanceImage {
  id: string;
  course: string;
  week: number | null;
  title: string;
  url: string;
  images: string[];
  status: "empty" | "error";
}

export async function fetchUnmatchedAttendance(): Promise<UnmatchedAttendanceImage[]> {
  const data = await getJson<{ items: UnmatchedAttendanceImage[] }>("/attendance/unmatched");
  return data.items;
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatus> {
  return getJson<RuntimeStatus>("/runtime/status");
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return getJson<SetupStatus>("/setup/status");
}

export async function startMoodleAssistant(): Promise<MoodleAssistantState> {
  const response = await request("/setup/moodle/start", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { assistant?: MoodleAssistantState; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Moodle assistant returned ${response.status}`);
  return body?.assistant ?? { status: "error", message: "Moodle assistant did not start" };
}

export async function startOnTrackAssistant(): Promise<MoodleAssistantState> {
  const response = await request("/setup/ontrack/start", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { assistant?: MoodleAssistantState; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `OnTrack assistant returned ${response.status}`);
  return body?.assistant ?? { status: "error", message: "OnTrack assistant did not start" };
}

export async function fetchOnTrackAssistant(): Promise<MoodleAssistantState> {
  const data = await getJson<{ assistant: MoodleAssistantState }>("/setup/ontrack/status");
  return data.assistant;
}

export async function cancelOnTrackAssistant(): Promise<MoodleAssistantState> {
  const response = await request("/setup/ontrack/cancel", { method: "POST" });
  const data = (await response.json()) as { assistant: MoodleAssistantState };
  return data.assistant;
}

export async function fetchMoodleAssistant(): Promise<MoodleAssistantState> {
  const data = await getJson<{ assistant: MoodleAssistantState }>("/setup/moodle/status");
  return data.assistant;
}

export async function cancelMoodleAssistant(): Promise<MoodleAssistantState> {
  const response = await request("/setup/moodle/cancel", { method: "POST" });
  const data = (await response.json()) as { assistant: MoodleAssistantState };
  return data.assistant;
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  return getJson<SyncStatus>("/sync/status");
}

export async function startFullSync(): Promise<SyncStatus["job"]> {
  const response = await request("/sync/full", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { job?: SyncStatus["job"]; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Full sync returned ${response.status}`);
  return body?.job ?? null;
}

export async function fetchMoodleCourses(): Promise<MoodleCourse[]> {
  const data = await getJson<{ courses: MoodleCourse[] }>("/moodle/courses");
  return data.courses;
}

export async function fetchMoodleContent(courseId: number): Promise<MoodleContentItem[]> {
  const data = await getJson<{ items: MoodleContentItem[] }>(`/moodle/content?courseId=${courseId}`);
  return data.items;
}

/** 作业资料包的数据：本机已同步的作业、变更和 Ed 帖子，不依赖当前 Moodle 会话。 */
export async function fetchPack(courseId?: string): Promise<PackResponse> {
  return getJson<PackResponse>(courseId ? `/pack?courseId=${encodeURIComponent(courseId)}` : "/pack");
}

/** 成绩册要逐门课程抓取，比普通接口慢，所以单独放宽超时。 */
export async function fetchMoodleGrades(): Promise<MoodleGradeCourse[]> {
  const data = await getJson<{ courses: MoodleGradeCourse[] }>("/moodle/grades", 90_000);
  return data.courses;
}

export async function syncMoodleContent(courseId: number): Promise<{ sections: number; items: number }> {
  const response = await request("/moodle/content-sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Moodle sync returned ${response.status}`);
  }
  return response.json() as Promise<{ sections: number; items: number }>;
}

/** 同步要启动真实 Chrome，后端最长等 60 秒；客户端留出启动余量。 */
const PORTAL_SYNC_TIMEOUT_MS = 90_000;

export class PortalExamsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "PortalExamsError";
    this.code = code;
    this.status = status;
  }
}

/** 已落库的考试时间表；未连接时返回空列表而不是报错。 */
export async function fetchPortalExams(): Promise<PortalExamsResponse> {
  const response = await request("/portal/exams", { signal: AbortSignal.timeout(30_000) });
  const body = (await response.json().catch(() => null)) as
    | (PortalExamsResponse & { error?: { code?: string; message?: string } })
    | null;
  if (!response.ok || !body?.exams) {
    throw new PortalExamsError(
      body?.error?.message ?? `读取考试时间表失败（HTTP ${response.status}）`,
      body?.error?.code ?? "portal_request_failed",
      response.status,
    );
  }
  return body;
}

/** 抓一次学生门户并落库；未登录时后端返回 409 portal_not_connected。 */
export async function syncPortalExams(): Promise<{ count: number; syncedAt: string }> {
  const response = await request("/portal/exams/sync", {
    method: "POST",
    signal: AbortSignal.timeout(PORTAL_SYNC_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as
    | { count?: number; syncedAt?: string; error?: { code?: string; message?: string } }
    | null;
  if (!response.ok || typeof body?.count !== "number" || !body.syncedAt) {
    throw new PortalExamsError(
      body?.error?.message ?? `同步考试时间表失败（HTTP ${response.status}）`,
      body?.error?.code ?? "portal_sync_failed",
      response.status,
    );
  }
  return { count: body.count, syncedAt: body.syncedAt };
}
