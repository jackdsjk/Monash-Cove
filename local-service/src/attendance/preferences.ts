export interface AttendancePreferenceCourse {
  course: string;
  sessions: string[];
}

export interface AttendancePreferences {
  courses: AttendancePreferenceCourse[];
}

export interface DetectedAttendanceSession {
  course: string;
  session: string;
}

export function normalizeSession(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\b0+(\d+)\b/g, "$1")
    .trim()
    .toLowerCase();
}

export function courseKey(value: string) {
  return (/^[A-Z]{2,5}\d{3,4}/i.exec(value)?.[0] ?? value).toUpperCase();
}

export function parseAttendanceSessionPreference(value: unknown): AttendancePreferences {
  if (!value || typeof value !== "object") return { courses: [] };
  const raw = (value as { courses?: unknown }).courses;
  if (!Array.isArray(raw)) return { courses: [] };
  return {
    courses: raw
      .filter((item): item is { course?: unknown; sessions?: unknown } => Boolean(item && typeof item === "object"))
      .map((item) => ({
        course: typeof item.course === "string" ? courseKey(item.course) : "",
        sessions: Array.isArray(item.sessions)
          ? [...new Set(item.sessions.filter((session): session is string => typeof session === "string" && session.trim().length > 0).map((session) => session.trim()))]
          : [],
      }))
      .filter((item) => item.course && item.sessions.length > 0),
  };
}

export function matchesPreferredSession(preferences: AttendancePreferences, course: string, session: string) {
  if (preferences.courses.length === 0) return true;
  const key = courseKey(course);
  const preferred = preferences.courses.find((item) => item.course === key);
  if (!preferred) return true;
  if (preferred.sessions.length === 0) return true;
  return preferred.sessions.some((value) => normalizeSession(value) === normalizeSession(session));
}

export function detectedToPreferences(items: DetectedAttendanceSession[]): AttendancePreferences {
  const map = new Map<string, Set<string>>();
  for (const item of items) {
    const key = courseKey(item.course);
    const sessions = map.get(key) ?? new Set<string>();
    sessions.add(item.session);
    map.set(key, sessions);
  }
  return { courses: [...map.entries()].map(([course, sessions]) => ({ course, sessions: [...sessions] })) };
}
