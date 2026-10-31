import type { AttendanceAssistantState, AttendanceCode, AttendancePreferences, AttendanceStatus, BriefItem, ItemSourceDetail, MoodleAssistantState, MoodleContentItem, MoodleCourse, RuntimeStatus, SetupStatus, SourceStatus, SyncStatus } from "../types";

export interface BriefData {
  items: BriefItem[];
  sources: SourceStatus[];
  syncedAt: string | null;
  lastCheckedAt: string | null;
}

const API = "/api";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
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

export async function fetchItemDetail(id: string): Promise<ItemSourceDetail> {
  return getJson<ItemSourceDetail>(`/items/${encodeURIComponent(id)}/detail`);
}

export async function fetchSources(): Promise<SourceStatus[]> {
  const data = await getJson<{ sources: SourceStatus[] }>("/sources");
  return data.sources;
}

export async function fetchAttendanceStatus(): Promise<AttendanceStatus> {
  return getJson<AttendanceStatus>("/attendance/status");
}

export async function fetchAttendanceCodes(refresh = false): Promise<AttendanceCode[]> {
  const data = await getJson<{ codes: AttendanceCode[] }>(`/attendance/codes${refresh ? "?refresh=1" : ""}`);
  return data.codes;
}

export async function startAttendanceAssistant(): Promise<AttendanceAssistantState> {
  const response = await fetch("/api/attendance/connect/start", { method: "POST" });
  const data = (await response.json()) as { assistant: AttendanceAssistantState };
  return data.assistant;
}

export async function fetchAttendancePreferences(): Promise<AttendancePreferences> {
  return getJson<AttendancePreferences>("/attendance/preferences");
}

export async function saveAttendancePreferences(preferences: AttendancePreferences): Promise<AttendancePreferences> {
  const response = await fetch("/api/attendance/preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) throw new Error("保存签到班次失败");
  return response.json() as Promise<AttendancePreferences>;
}

export async function detectAttendancePreferences(): Promise<AttendancePreferences> {
  const response = await fetch("/api/attendance/detect", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { preferences?: AttendancePreferences; error?: { message?: string } } | null;
  if (!response.ok || !body?.preferences) throw new Error(body?.error?.message ?? "识别签到班次失败");
  return body.preferences;
}

export async function fetchAttendanceAssistant(): Promise<AttendanceAssistantState> {
  const data = await getJson<{ assistant: AttendanceAssistantState }>("/attendance/connect/status");
  return data.assistant;
}

export async function cancelAttendanceAssistant(): Promise<AttendanceAssistantState> {
  const response = await fetch("/api/attendance/connect/cancel", { method: "POST" });
  const data = (await response.json()) as { assistant: AttendanceAssistantState };
  return data.assistant;
}

export async function fillAttendanceCode(code: AttendanceCode): Promise<{ status: "filled" | "inactive" | "not_found"; message: string }> {
  const response = await fetch("/api/attendance/fill", {
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
  const response = await fetch("/api/attendance/fill-all", {
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

export async function fetchRuntimeStatus(): Promise<RuntimeStatus> {
  return getJson<RuntimeStatus>("/runtime/status");
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return getJson<SetupStatus>("/setup/status");
}

export async function startMoodleAssistant(): Promise<MoodleAssistantState> {
  const response = await fetch("/api/setup/moodle/start", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { assistant?: MoodleAssistantState; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Moodle assistant returned ${response.status}`);
  return body?.assistant ?? { status: "error", message: "Moodle assistant did not start" };
}

export async function fetchMoodleAssistant(): Promise<MoodleAssistantState> {
  const data = await getJson<{ assistant: MoodleAssistantState }>("/setup/moodle/status");
  return data.assistant;
}

export async function cancelMoodleAssistant(): Promise<MoodleAssistantState> {
  const response = await fetch("/api/setup/moodle/cancel", { method: "POST" });
  const data = (await response.json()) as { assistant: MoodleAssistantState };
  return data.assistant;
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  return getJson<SyncStatus>("/sync/status");
}

export async function startFullSync(): Promise<SyncStatus["job"]> {
  const response = await fetch("/api/sync/full", { method: "POST" });
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

export async function syncMoodleContent(courseId: number): Promise<{ sections: number; items: number }> {
  const response = await fetch("/api/moodle/content-sync", {
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
