import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import { MoodleClient } from "./moodle.js";
import { selectMoodleCourses, type CoursePreferences } from "../course-preferences.js";

/** One row of Moodle's own user grade report, as far as HTML exposes it. */
export interface MoodleGradeItem {
  id: string;
  name: string;
  /** The mark Moodle prints; `null` when nothing has been released yet. */
  grade: number | null;
  /** Upper bound of the item's range; `null` when the report omits the range. */
  gradeMax: number | null;
  /** Weight as a share of the course total, e.g. 20 for `20.00 %`. */
  weight: number | null;
  feedback: string;
  /**
   * Moodle's own date string ("Monday, 3 March 2025, 10:21 AM"). It is kept
   * verbatim instead of being parsed into an ISO instant, because Moodle
   * renders dates in the account's locale and a wrong guess would invent time.
   */
  gradedAt: string | null;
}

export interface MoodleGradeCourse {
  courseId: string;
  courseName: string;
  items: MoodleGradeItem[];
  /** The course total row; both `null` when Moodle did not print one. */
  total: { earned: number | null; max: number | null };
}

export type MoodleGradesErrorCode = "session_expired" | "grades_failed";

/** A gradebook failure the route can map to 409 (reconnect) or 502. */
export class MoodleGradesError extends Error {
  readonly code: MoodleGradesErrorCode;

  constructor(code: MoodleGradesErrorCode, message: string) {
    super(message);
    this.name = "MoodleGradesError";
    this.code = code;
  }
}

/** Moodle rate-limits nothing here, but four parallel page loads behave well. */
const COURSE_CONCURRENCY = 4;

export class MoodleGradesClient {
  private readonly baseUrl: string;
  private readonly courses: MoodleClient;

  /** `cookie` is the full Cookie header for Moodle (see `moodleCookieHeader`). */
  constructor(baseUrl: string, private readonly cookie: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.courses = new MoodleClient(this.baseUrl, cookie, fetcher);
  }

  private headers() {
    return {
      cookie: this.cookie,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
  }

  /**
   * The gradebook is per-course HTML, so the enrolled course list is the only
   * way to know which user reports exist. Courses whose report cannot be read
   * are skipped; if nothing at all is readable the caller gets an error rather
   * than an empty "you have no grades" answer.
   */
  async pull(): Promise<MoodleGradeCourse[]> {
    return (await this.pullDetailed()).courses;
  }

  async pullDetailed(preferences?: CoursePreferences): Promise<{ courses: MoodleGradeCourse[]; failedCourseIds: string[] }> {
    const alive = await this.courses.validateSession().catch(() => false);
    if (!alive) {
      throw new MoodleGradesError("session_expired", "Moodle session expired; reconnect Moodle to read the gradebook.");
    }
    const enrolled = await this.courses.listCourses();
    const targets = preferences ? selectMoodleCourses(enrolled, preferences) : enrolled;
    const results = await mapLimited(targets, COURSE_CONCURRENCY, async (course) => {
      try {
        const report = await this.scrapeCourse(course.id);
        if (!report) return null;
        return {
          courseId: String(course.id),
          courseName: course.fullname || course.shortname || String(course.id),
          items: report.items,
          total: report.total,
        } satisfies MoodleGradeCourse;
      } catch (error) {
        if (error instanceof MoodleGradesError && error.code === "session_expired") throw error;
        return { error, courseId: String(course.id) };
      }
    });
    const failures = results.filter((result): result is { error: unknown; courseId: string } => result !== null && "error" in result && result.error !== undefined);
    const courses = results.filter((result): result is MoodleGradeCourse => result !== null && !("error" in result));
    if (courses.length === 0 && failures.length > 0) {
      // Surface the first real cause instead of pretending the gradebook is empty.
      throw new MoodleGradesError("grades_failed", failureMessage(failures[0]?.error));
    }
    return { courses, failedCourseIds: failures.map((result) => result.courseId) };
  }

  /** `null` means Moodle served the page but it holds no grade table. */
  async scrapeCourse(courseId: number): Promise<ParsedGradeReport | null> {
    const response = await this.fetcher(`${this.baseUrl}/grade/report/user/index.php?id=${courseId}`, {
      headers: this.headers(),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const landed = response.url ?? "";
    if (landed !== "" && (!landed.startsWith(this.baseUrl) || /\/login\//.test(landed) || /microsoftonline\.com|okta\.com/i.test(landed))) {
      throw new MoodleGradesError("session_expired", "Moodle sent the grade report to a login page; reconnect Moodle.");
    }
    if (!response.ok) {
      throw new MoodleGradesError("grades_failed", `Moodle grade report returned HTTP ${response.status}.`);
    }
    return parseGradeReport(await response.text(), String(courseId));
  }
}

export interface ParsedGradeReport {
  items: MoodleGradeItem[];
  total: { earned: number | null; max: number | null };
}

type Field = "name" | "weight" | "grade" | "range" | "percentage" | "feedback" | "contribution" | "lastModified" | "gradedOn";

/**
 * Header labels, most specific first. Moodle's user report is a plain table, so
 * the column order is whatever the site config produced; only the labels are
 * stable, and they change with the account language.
 */
const HEADER_FIELDS: Array<[Field, RegExp]> = [
  ["name", /grade\s*item|gradeitem|^items?$|^item\b|成绩项|评分项|项目名称|^项目$/],
  ["weight", /weight|权重|比重/],
  ["range", /^range\b|range$|范围/],
  ["percentage", /percentage|百分比|百分制/],
  ["feedback", /feedback|反馈|评语/],
  ["contribution", /contribution|贡献|总分占比/],
  ["lastModified", /last\s*modified|lastmodified|最后修改|修改时间|更新时间/],
  ["gradedOn", /graded\s*on|grading\s*date|评分时间|批改时间/],
  // `^grade` would also match "Grade item", so the name column is matched first.
  ["grade", /^grade\b|^成绩$|^分数$|^得分$/],
];

const COURSE_TOTAL = /^(course\s*total|course\s*grade|^total$|课程总成绩|课程总分|课程总计|总成绩|总评|合计)$/i;

/**
 * Reads Moodle's HTML user report into rows. Columns are located by their
 * header text; anything the table does not show is left as `null`/"".
 * Returns `null` when the page contains no grade table (e.g. grades hidden).
 */
export function parseGradeReport(html: string, courseId: string): ParsedGradeReport | null {
  const root = parse(html);
  for (const table of root.querySelectorAll("table")) {
    let columns: Partial<Record<Field, number>> | null = null;
    let headerCells: string[] = [];
    let total: ParsedGradeReport["total"] | null = null;
    const items: MoodleGradeItem[] = [];
    const seen = new Set<string>();

    for (const row of table.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("th, td");
      if (cells.length < 2) continue;
      const texts = cells.map(cellText);

      if (!columns) {
        const candidate = mapColumns(texts);
        if (candidate.name !== undefined && hasMarkColumn(candidate)) {
          columns = candidate;
          headerCells = texts;
        }
        continue;
      }

      // A repeated header (tfoot, sticky thead) is not an assessment.
      if (sameCells(texts, headerCells)) continue;

      const classes = (row.getAttribute("class") ?? "").toLowerCase();
      // A category heading repeats the sum of its children's weights.
      if (/categoryitem/.test(classes)) continue;

      const nameIndex = columns.name;
      if (nameIndex === undefined) continue;
      const name = cleanName(texts[nameIndex] ?? "");
      if (!name) continue;

      const gradeText = pick(texts, columns.grade);
      const range = parseRange(pick(texts, columns.range));
      const percentage = parseNumber(pick(texts, columns.percentage));

      if (/courseitem/.test(classes) || COURSE_TOTAL.test(name)) {
        total ??= courseTotal(gradeText, percentage, range);
        continue;
      }

      const feedback = withoutPlaceholder(pick(texts, columns.feedback));
      const gradedAt = withoutPlaceholder(pick(texts, columns.lastModified)) || withoutPlaceholder(pick(texts, columns.gradedOn));
      const grade = parseNumber(gradeText);
      const weight = parseNumber(pick(texts, columns.weight));
      let id = itemId(courseId, name);
      // Two activities can share a display name; keep both rows addressable.
      if (seen.has(id)) id = itemId(courseId, `${name}:${items.length}`);
      seen.add(id);
      items.push({
        id,
        name,
        grade,
        gradeMax: range?.max ?? null,
        weight,
        feedback,
        gradedAt: gradedAt === "" ? null : gradedAt,
      });
    }

    if (items.length > 0) {
      return { items, total: total ?? derivedTotal(items) };
    }
  }
  return null;
}

/**
 * A course total is the authoritative number when present. Moodle prints it in
 * the "Grade" column with the item's range; some themes only print a percent.
 */
function courseTotal(gradeText: string, percentage: number | null, range: { min: number | null; max: number | null } | null): { earned: number | null; max: number | null } {
  const grade = parseNumber(gradeText);
  if (grade !== null && range !== null && range.max !== null) {
    return { earned: grade, max: range.max };
  }
  if (percentage !== null) {
    // The report only printed a percentage for the course total.
    return { earned: percentage, max: 100 };
  }
  return { earned: null, max: null };
}

/** Only trustworthy when every item carries a released mark and a weight. */
function derivedTotal(items: MoodleGradeItem[]): { earned: number | null; max: number | null } {
  let earned = 0;
  let max = 0;
  for (const item of items) {
    if (item.grade === null || item.gradeMax === null || item.weight === null || item.gradeMax === 0) {
      return { earned: null, max: null };
    }
    earned += (item.grade / item.gradeMax) * item.weight;
    max += item.weight;
  }
  if (max === 0) return { earned: null, max: null };
  return { earned: round(earned), max: round(max) };
}

function mapColumns(headers: string[]): Partial<Record<Field, number>> {
  const columns: Partial<Record<Field, number>> = {};
  const assigned = new Set<Field>();
  headers.forEach((header, index) => {
    const normalized = normalize(header);
    if (!normalized) return;
    for (const [field, pattern] of HEADER_FIELDS) {
      if (assigned.has(field) || !pattern.test(normalized)) continue;
      columns[field] = index;
      assigned.add(field);
      return;
    }
  });
  return columns;
}

function hasMarkColumn(columns: Partial<Record<Field, number>>) {
  return columns.grade !== undefined || columns.weight !== undefined || columns.range !== undefined || columns.percentage !== undefined;
}

function pick(texts: string[], index: number | undefined) {
  return index === undefined ? "" : texts[index] ?? "";
}

function sameCells(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => normalize(value) === normalize(b[index] ?? ""));
}

function normalize(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Data cells keep their case (feedback and names are shown to the user). */
function cellText(cell: HTMLElement) {
  return cell.text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** Moodle prints "-" (and similar) where a value does not exist. */
function withoutPlaceholder(value: string) {
  return /^[-–—]+$|^n\/?a$/i.test(value.trim()) ? "" : value;
}

/** Moodle prefixes nested items with bidi marks; keep the visible name only. */
function cleanName(value: string) {
  return value.replace(/[\u200e\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim();
}

/** `0–20`, `0 - 20`, `0–100 %`; the first number is the floor, the last the cap. */
function parseRange(value: string): { min: number | null; max: number | null } | null {
  const numbers = numbersIn(value);
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return { min: null, max: numbers[0] };
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}

/** `17`, `17.00`, `85 %`, `1,234.50`; `-` and empty cells stay `null`. */
function parseNumber(value: string): number | null {
  const numbers = numbersIn(value);
  return numbers.length > 0 ? numbers[0] : null;
}

function numbersIn(value: string) {
  const withoutThousands = value.replace(/\u00a0/g, " ").replace(/(\d),(?=\d{3}\b)/g, "$1");
  return withoutThousands.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
}

function itemId(courseId: string, name: string) {
  return createHash("sha1").update(`moodle:grade:${courseId}:${name}`).digest("hex");
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "Moodle grade report failed.";
}

/** Runs `worker` over `items`, never more than `limit` requests at once. */
async function mapLimited<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
