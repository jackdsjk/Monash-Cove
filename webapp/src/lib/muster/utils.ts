/**
 * Functions copied verbatim from Muster `src/lib/utils.ts` that the ported helpers
 * depend on for dates, deadlines, submission status, and Monash term boundaries.
 * Framework/Tauri-only helpers from that file (cn, download paths, platform detection)
 * are deliberately not included.
 */

export function formatDate(date: string | Date, lang: string = "en"): string {
  return new Date(date).toLocaleDateString(lang, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Determine whether a course's teaching period has ended (Monash: S1 ~ late Feb-June, S2 ~ late July-November).
 * For cross-semester courses ("S1 2026 - S2 2026") the last semester is used; returns false when nothing can be parsed.
 * Accepts the separators Monash actually uses between term and year — space, ASCII hyphen, en/em dash,
 * underscore — and the reversed "2026 S1" / "2026S1" spelling.
 */
/**
 * Monash teaching periods: S1 = late Feb to end of May (weeks) + exams in June,
 * S2 = late Jul to end of Oct + exams in Nov. We treat a semester as ended on
 * the 1st of the month AFTER its exam month (S1 -> Jul 1, S2 -> Dec 1), which
 * safely includes the exam period and grade release.
 * Courses spanning two semesters (thesis units) end with their LAST semester.
 * Unknown formats are conservatively treated as active (not ended).
 */
export function isTermEnded(courseName?: string): boolean {
  if (!courseName) return false;
  // Standard: "S2 2025" / "2026 S1"; Cross: "S1 2026 - S2 2027"; Summer/Winter sessions.
  const re = /\bS([12])\s*[-\u2013\u2014_]?\s*(\d{4})\b|\b(\d{4})\s*[-\u2013\u2014_]?\s*S([12])\b/gi;
  const matches = [...courseName.matchAll(re)];
  if (matches.length === 0) return false;
  // The course's LAST semester token decides when it fully ends (thesis spans).
  const last = matches[matches.length - 1];
  const sem = parseInt(last[1] ?? last[4], 10);
  const year = parseInt(last[2] ?? last[3], 10);
  if (!Number.isFinite(sem) || !Number.isFinite(year)) return false;
  // Term-end anchor: the 1st day of the month after exams (S1 -> Jul 1, S2 -> Dec 1).
  const endAnchorMonth = sem === 1 ? 6 : 11; // 0-indexed: Jun=5? No: Jun=5 is month index 5. Use sem===1 ? 6 : 11 meaning Jul(6)/Dec(11).
  const now = new Date();
  const endMs = new Date(year, endAnchorMonth, 1).getTime();
  return now.getTime() >= endMs;
}

/**
 * Parse a due date with one fallback: strict `new Date` first, then retry with just
 * the extracted "12 March 2026, 9:55 PM" core — Moodle due cells can carry a trailing
 * relative label ("... 9:55 PM Due tomorrow") that breaks strict parsing.
 * Returns the timestamp (NaN when both attempts fail).
 */
export function parseDueTimestamp(date: string | Date): number {
  let due = new Date(date);
  if (Number.isNaN(due.getTime()) && typeof date === "string") {
    const m = date.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:,?\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i);
    if (m) due = new Date(m[1]);
  }
  return due.getTime();
}

/**
 * Compute the difference in calendar days between a target date and a base date (defaults to now).
 *
 * Both dates are converted to midnight (00:00:00.000) in the user's local timezone,
 * ensuring calendar day boundaries are respected:
 * - 0 = same calendar day ("today")
 * - 1 = tomorrow
 * - -1 = yesterday
 * - positive = future days
 * - negative = past days
 * Returns null if target or base date is missing or cannot be parsed.
 */
export function getCalendarDayDiff(
  target?: number | Date | string | null,
  base: number | Date = Date.now()
): number | null {
  if (target == null) return null;
  const targetMs = typeof target === "number" ? target : parseDueTimestamp(target);
  if (Number.isNaN(targetMs) || targetMs <= 0) return null;

  const baseMs = typeof base === "number" ? base : (base instanceof Date ? base.getTime() : parseDueTimestamp(base));
  if (Number.isNaN(baseMs)) return null;

  const targetDate = new Date(targetMs);
  const baseDate = new Date(baseMs);

  const targetMidnight = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  ).getTime();
  const baseMidnight = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate()
  ).getTime();

  return Math.round((targetMidnight - baseMidnight) / 86_400_000);
}

export function getDaysUntilDue(date?: string | Date | null): number | null {
  return getCalendarDayDiff(date);
}

/**
 * Compute the "effective status" of an assignment.
 *
 * The backend `determine_assignment_status` only matches keywords in the table row text and never compares
 * the due date with the current time — so an assignment that was due back in 2025 falls through to
 * `upcoming` as long as its row has no submitted/graded keyword, and the UI shows "starting soon", which is clearly wrong.
 *
 * Here we re-evaluate against real time:
 * - submitted / graded → keep as-is (once handed in it should never be called overdue)
 * - upcoming / pending with a past due date → `overdue`
 * - no valid due date → keep as-is (no guessing without a date)
 */
export function getEffectiveAssignmentStatus(
  status: string,
  dueDate?: string
): string {
  if (status === "submitted" || status === "graded") return status;
  if (!dueDate) return status;

  const due = parseDueTimestamp(dueDate);
  if (Number.isNaN(due) || due <= 0) return status;

  return due < Date.now() ? "overdue" : status;
}
