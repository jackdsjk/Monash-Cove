import { createHash } from "node:crypto";

export type AttendanceSource = "gmail" | "moodle" | "ed";

export interface AttendanceSourceRow {
  id: string;
  source: AttendanceSource;
  course: string;
  title: string;
  text: string;
  url: string;
  publishedAt: string;
}

export interface AttendanceCode {
  id: string;
  source: AttendanceSource;
  course: string;
  week: number;
  session: string;
  code: string;
  title: string;
  url: string;
  publishedAt: string;
}

const SESSION_CODE = /\b(workshop|applied|tutorial|pass)\s*(\d{1,2})\s*[:\-–]\s*([A-Z0-9]{3,12})\b/gi;
const COURSE_TITLE = /^(.+?)\s+-\s+Announcements\s+-/i;

function normalize(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function parseAttendanceRows(rows: AttendanceSourceRow[]): AttendanceCode[] {
  const found = new Map<string, AttendanceCode>();
  for (const row of rows) {
    const title = normalize(row.title);
    const text = normalize(row.text);
    const combined = `${title}\n${text}`;
    if (!/attendance\s*codes?/i.test(combined)) continue;
    const weekMatch = /\bweek\s*(\d{1,2})\b/i.exec(`${title}\n${text}`);
    const week = weekMatch ? Number(weekMatch[1]) : null;
    if (!week) continue;
    const course = normalize(row.course || COURSE_TITLE.exec(title)?.[1] || title.split(" - ")[0] || "Unknown course");
    for (const match of combined.matchAll(SESSION_CODE)) {
      const session = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`;
      const code = match[3].toUpperCase();
      const key = `${row.source}:${course}:${week}:${session}:${code}`;
      if (found.has(key)) continue;
      found.set(key, {
        id: createHash("sha1").update(key).digest("hex"),
        source: row.source,
        course,
        week,
        session,
        code,
        title,
        url: row.url,
        publishedAt: row.publishedAt,
      });
    }
  }
  return [...found.values()].sort((a, b) => b.week - a.week || a.course.localeCompare(b.course) || a.session.localeCompare(b.session));
}
