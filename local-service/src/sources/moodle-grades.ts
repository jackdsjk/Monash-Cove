import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import { MoodleClient, MoodleSessionExpiredError } from "./moodle.js";
import { selectMoodleCourses, type CoursePreferences } from "../course-preferences.js";
import { isPortalCourseName, matchGradebookItem } from "../vendor/muster/assessment-match.js";
import { discoverAssessmentsSection, parseAssessmentStructure, type AssessmentStructureRow } from "../vendor/muster/assessment-structure.js";
import { parseMoodleGradeDetail, parseMoodleGradeOverview } from "../vendor/muster/grade-details.js";
import { createMoodlePageReader, MoodlePageReadError, type MoodlePageReader } from "../moodle-page-reader.js";

/** One row of Moodle's own user grade report, as far as HTML exposes it. */
export interface MoodleGradeItem {
  id: string;
  name: string;
  /** Activity link from Grades; manual grade items can have no link. */
  url: string | null;
  /** Original released score, including letter grades that cannot be averaged. */
  gradeText: string | null;
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
  gradingState?: "graded" | "submitted" | "pending" | "unknown";
  gradeSource?: "gradebook" | "activity";
}

export interface MoodleGradeCourse {
  courseId: string;
  courseName: string;
  courseShortName?: string;
  items: MoodleGradeItem[];
  /** The course total row; both `null` when Moodle did not print one. */
  total: { earned: number | null; max: number | null };
  /** Assessments provides weights and grouping; Grades remains the score source. */
  assessmentStructure: AssessmentStructureRow[];
  assessmentWarning: string | null;
  assessmentFetchedAt?: string | null;
  assessmentStale?: boolean;
  overviewGrade?: string | null;
  overviewWarning?: string | null;
  detailWarning?: string | null;
  gradeChanges?: Array<{ id: string; kind: "released" | "changed"; itemName: string | null; detectedAt: string }>;
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
  private pages: MoodlePageReader;

  /** `cookie` is the full Cookie header for Moodle (see `moodleCookieHeader`). */
  constructor(baseUrl: string, private readonly cookie: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.courses = new MoodleClient(this.baseUrl, cookie, fetcher);
    this.pages = createMoodlePageReader(fetcher);
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

  async pullDetailed(preferences?: CoursePreferences): Promise<{ courses: MoodleGradeCourse[]; failedCourseIds: string[]; failureReasons: Record<string, string> }> {
    this.pages = createMoodlePageReader(this.fetcher);
    const probe = await this.courses.probeSession().catch((error: unknown) => {
      if (error instanceof MoodleSessionExpiredError) return { ok: false, expired: true };
      throw new MoodleGradesError("grades_failed", "Moodle is unreachable; the saved session has been retained.");
    });
    if (!probe.ok && probe.expired) {
      throw new MoodleGradesError("session_expired", "Moodle session expired; reconnect Moodle to read the gradebook.");
    }
    if (!probe.ok) throw new MoodleGradesError("grades_failed", "Moodle could not verify the gradebook session; retry later.");
    const enrolled = await this.courses.listCourses();
    const targets = (preferences ? selectMoodleCourses(enrolled, preferences) : enrolled)
      .filter((course) => !isPortalCourseName(course.fullname || course.shortname));
    let overview: Array<{ courseId: string; gradeText: string }> = [];
    let overviewFailed = false;
    if (targets.length) {
      try { overview = parseMoodleGradeOverview(await this.readPage("/grade/report/overview/index.php"), this.baseUrl); }
      catch (error) {
        if (error instanceof MoodleGradesError && error.code === "session_expired") throw error;
        overviewFailed = true;
      }
    }
    const results = await mapLimited(targets, COURSE_CONCURRENCY, async (course): Promise<MoodleGradeCourse | { error: unknown; courseId: string } | null> => {
      try {
        const overviewGrade = overview.find((row) => row.courseId === String(course.id))?.gradeText ?? null;
        const report = await this.scrapeCourse(course.id) ?? (overviewGrade ? { items: [], total: { earned: null, max: null } } : null);
        if (!report) return null;
        let assessmentStructure: AssessmentStructureRow[] = [];
        let assessmentWarning: string | null = null;
        let assessmentFetchedAt: string | null = null;
        if (report.items.length > 0) {
          try {
            assessmentStructure = await this.readAssessmentStructure(course.id);
            const activities = assessmentStructure.filter((row) => !row.isCategory);
            for (const row of activities) row.gradeItemId = matchGradebookItem(row, report.items, activities, this.baseUrl)?.id ?? null;
            if (assessmentStructure.length) assessmentFetchedAt = new Date().toISOString();
            else assessmentWarning = "尚未读到可用的 Assessments 权重结构；仍显示 Grades 原始成绩。";
          } catch (error) {
            // A missing weight source must not hide successfully read scores.
            if (error instanceof MoodleGradesError && error.code === "session_expired") throw error;
            assessmentWarning = "暂时无法读取 Assessments 评估结构；仍显示 Grades 原始成绩，可重试刷新权重。";
          }
        }
        const detailFailed = await this.enrichItems(report.items);
        return {
          courseId: String(course.id),
          courseName: course.fullname || course.shortname || String(course.id),
          courseShortName: course.shortname,
          items: report.items,
          total: report.total,
          assessmentStructure,
          assessmentWarning,
          assessmentFetchedAt, assessmentStale: false,
          overviewGrade,
          overviewWarning: overviewFailed ? "Overview 总评暂时无法读取。" : null,
          detailWarning: [overviewFailed ? "Overview 总评暂时无法读取。" : "", detailFailed ? "部分活动详情暂时无法读取；仍显示 Grades 成绩。" : ""].filter(Boolean).join(" ") || null,
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
    return { courses, failedCourseIds: failures.map((result) => result.courseId),
      failureReasons: Object.fromEntries(failures.map((result) => [result.courseId, gradeFailureReason(result.error)])) };
  }

  /** `null` means Moodle served the page but it holds no grade table. */
  async scrapeCourse(courseId: number): Promise<ParsedGradeReport | null> {
    return parseGradeReport(await this.readPage(`/grade/report/user/index.php?id=${courseId}`), String(courseId));
  }

  private async readAssessmentStructure(courseId: number): Promise<AssessmentStructureRow[]> {
    const main = await this.readPage(`/course/view.php?id=${courseId}`);
    const mainRows = parseAssessmentStructure(main, this.baseUrl);
    const section = discoverAssessmentsSection(main, courseId, this.baseUrl) ?? 56;
    try {
      const page = await this.readPage(`/course/view.php?id=${courseId}&section=${section}`);
      const rows = parseAssessmentStructure(page, this.baseUrl);
      return rows.length ? rows : mainRows;
    } catch (error) {
      if (error instanceof MoodleGradesError && error.code === "session_expired") throw error;
      if (mainRows.length) return mainRows;
      throw error;
    }
  }

  private async readPage(path: string): Promise<string> {
    try {
      return await this.pages.text(new URL(path, this.baseUrl), { headers: this.headers(), redirect: "follow" });
    } catch (error) {
      if (error instanceof MoodleSessionExpiredError) throw new MoodleGradesError("session_expired", "Moodle sent the grade report to a login page; reconnect Moodle.");
      if (error instanceof MoodlePageReadError) throw new MoodleGradesError("grades_failed", `Moodle grade report returned HTTP ${error.status}.`);
      throw error;
    }
  }

  private async enrichItems(items: MoodleGradeItem[]): Promise<boolean> {
    let failed = false;
    await mapLimited(items, 2, async (item) => {
      item.gradeSource = "gradebook";
      item.gradingState = item.gradeText ? "graded" : "unknown";
      if (!item.url) return;
      const url = new URL(item.url, this.baseUrl);
      const type = /^\/mod\/(assign|quiz)\/view\.php$/.exec(url.pathname)?.[1] as "assign" | "quiz" | undefined;
      if (url.origin !== new URL(this.baseUrl).origin || !type || !/^\d+$/.test(url.searchParams.get("id") ?? "")) return;
      // A complete gradebook row needs no second read. Pending/hidden grades
      // are checked regardless of due date, including older quizzes.
      if (item.gradeText && item.feedback) return;
      try {
        const detail = parseMoodleGradeDetail(await this.readPage(url.href), type);
        if (!item.gradeText && detail.gradeText) {
          item.gradeText = detail.gradeText;
          Object.assign(item, mark(detail.gradeText, null, { max: item.gradeMax }));
          item.gradeSource = "activity";
        }
        if (!item.feedback && detail.feedback) item.feedback = detail.feedback;
        item.gradedAt ??= detail.gradedAt;
        if (!item.gradeText) item.gradingState = detail.gradingState;
        else item.gradingState = "graded";
      } catch (error) {
        if (error instanceof MoodleGradesError && error.code === "session_expired") throw error;
        failed = true;
      }
    });
    return failed;
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

// Moodle's class-based cells survive category rowspan/colspan indentation.
// This follows Muster scraper.rs::parse_gradebook_from_html, retaining the
// label-based fallback for older themes and translated report columns.
const FIELD_CLASSES: Partial<Record<Field, string>> = {
  name: "column-itemname", weight: "column-weight", grade: "column-grade",
  range: "column-range", percentage: "column-percentage", feedback: "column-feedback",
  contribution: "column-contributiontocoursetotal",
};

function fieldText(row: HTMLElement, cells: HTMLElement[], columns: Partial<Record<Field, number>>, field: Field): string {
  const cell = FIELD_CLASSES[field] ? row.querySelector(`.${FIELD_CLASSES[field]}`) : null;
  const fallback = columns[field] === undefined ? undefined : cells[columns[field]!];
  const target = cell ?? fallback;
  if (!target) return "";
  // Muster reads the first score div, leaving Moodle's action-menu text out.
  if (field === "grade") return cellText(target.querySelector("div > div") ?? target);
  return cellText(target);
}

function mark(gradeText: string, percentage: number | null, range: { max: number | null } | null): { grade: number | null; gradeMax: number | null } {
  const text = withoutPlaceholder(gradeText).trim();
  const ratio = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)/i);
  if (ratio) return { grade: Number(ratio[1]), gradeMax: Number(ratio[2]) > 0 ? Number(ratio[2]) : null };
  const percent = text.match(/^(-?\d+(?:\.\d+)?)\s*%/);
  if (percent) return { grade: Number(percent[1]), gradeMax: 100 };
  const grade = /^-?\d+(?:[,.]\d+)*$/.test(text) ? parseNumber(text) : null;
  if (grade !== null) return { grade, gradeMax: range?.max ?? null };
  // Some Moodle reports expose only the percentage column.
  if (percentage !== null) return { grade: percentage, gradeMax: 100 };
  return { grade: null, gradeMax: range?.max ?? null };
}

/** Moodle item weights are relative to their parent, not necessarily the course. */
function courseWeights(table: HTMLElement, columns: Partial<Record<Field, number>>, items: Map<MoodleGradeItem, HTMLElement>): void {
  const categories = new Map<string, { row: HTMLElement; weight: number | null }>();
  let nested = false;
  for (const row of table.querySelectorAll("tr")) {
    if (!/categoryitem/.test(row.getAttribute("class") ?? "") && !row.querySelector(".categoryitem")) continue;
    const cells = row.querySelectorAll("th, td").filter((cell) => !/(?:^|\s)leader(?:\s|$)/.test(cell.getAttribute("class") ?? ""));
    const weight = parseNumber(fieldText(row, cells, columns, "weight"));
    if (weight !== null && weight > 0 && weight < 99.5) nested = true;
    for (const element of [row, ...row.querySelectorAll("[id]")]) {
      const id = element.getAttribute("id");
      if (id) categories.set(id, { row, weight });
    }
  }
  const references = (row: HTMLElement): string[] => [row, ...row.querySelectorAll("[headers]")]
    .flatMap((cell) => (cell.getAttribute("headers") ?? "").split(/\s+/)).filter((id) => categories.has(id));
  for (const [item, row] of items) {
    if (item.weight === null) continue;
    const ancestors = new Set<HTMLElement>();
    let factor = 1;
    let readable = true;
    const visit = (source: HTMLElement): void => {
      for (const id of references(source)) {
        const category = categories.get(id)!;
        if (category.row === source || ancestors.has(category.row)) continue;
        ancestors.add(category.row);
        if (category.weight === null || category.weight < 0 || category.weight > 100) readable = false;
        else factor *= category.weight / 100;
        visit(category.row);
      }
    };
    visit(row);
    // Without a relationship we cannot claim that a nested 50% is a final 50%.
    const nameCell = row.querySelector(".column-itemname");
    const level = /(?:^|\s)level(\d+)(?:\s|$)/.exec(`${row.getAttribute("class") ?? ""} ${nameCell?.getAttribute("class") ?? ""}`);
    if (!readable || ancestors.size === 0 && (nested || Number(level?.[1] ?? 0) > 2)) item.weight = null;
    else item.weight *= factor;
  }
}

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
    const itemRows = new Map<MoodleGradeItem, HTMLElement>();
    const seen = new Set<string>();

    for (const row of table.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("th, td").filter((cell) => !/(?:^|\s)leader(?:\s|$)/.test(cell.getAttribute("class") ?? ""));
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
      const nameIndex = columns.name;
      if (nameIndex === undefined) continue;
      const header = row.querySelector(".gradeitemheader");
      const name = cleanName(header ? cellText(header) : fieldText(row, cells, columns, "name"));
      if (!name) continue;

      const gradeText = fieldText(row, cells, columns, "grade");
      const range = parseRange(fieldText(row, cells, columns, "range"));
      const percentage = parseNumber(fieldText(row, cells, columns, "percentage"));

      if (/courseitem/.test(classes) || COURSE_TOTAL.test(name)) {
        total ??= courseTotal(gradeText, percentage, range);
        continue;
      }
      // Category subtotals repeat the child marks; the course total above is
      // still retained even in themes that give it both class names.
      if (/categoryitem/.test(classes) || row.querySelector(".categoryitem")) continue;

      // Muster's parse_gradebook_from_html only accepts actual grade-item
      // headers. A row with numbers, or an activity elsewhere on the page, is
      // not evidence of an assessment. Keep ungraded and manual grade items.
      if (!header) continue;
      const url = header.getAttribute("href") ?? header.querySelector("a[href]")?.getAttribute("href") ?? null;
      const key = url || name;
      if (seen.has(key)) continue;
      seen.add(key);

      const feedback = withoutPlaceholder(fieldText(row, cells, columns, "feedback"));
      const gradedAt = withoutPlaceholder(fieldText(row, cells, columns, "lastModified")) || withoutPlaceholder(fieldText(row, cells, columns, "gradedOn"));
      const score = mark(gradeText, percentage, range);
      const weight = parseNumber(fieldText(row, cells, columns, "weight"));
      const id = itemId(courseId, key);
      items.push({
        id,
        name,
        url,
        gradeText: withoutPlaceholder(gradeText) || null,
        ...score,
        weight,
        feedback,
        gradedAt: gradedAt === "" ? null : gradedAt,
      });
      itemRows.set(items[items.length - 1], row);
    }

    if (items.length > 0 || total !== null || columns && /(?:^|\s)user-grade(?:\s|$)/.test(table.getAttribute("class") ?? "")) {
      courseWeights(table, columns!, itemRows);
      return { items, total: total ?? { earned: null, max: null } };
    }
  }
  return null;
}

/**
 * A course total is the authoritative number when present. Moodle prints it in
 * the "Grade" column with the item's range; some themes only print a percent.
 */
function courseTotal(gradeText: string, percentage: number | null, range: { min: number | null; max: number | null } | null): { earned: number | null; max: number | null } {
  const score = mark(gradeText, percentage, range);
  return { earned: score.grade, max: score.gradeMax };
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
  return numbers.length > 0 ? (/^\s*-\d/.test(value) ? -numbers[0] : numbers[0]) : null;
}

function numbersIn(value: string) {
  const withoutThousands = value.replace(/\u00a0/g, " ").replace(/(\d),(?=\d{3}\b)/g, "$1");
  return withoutThousands.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
}

function itemId(courseId: string, name: string) {
  return createHash("sha1").update(`moodle:grade:${courseId}:${name}`).digest("hex");
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "Moodle grade report failed.";
}

/** Diagnostic categories only: never publish arbitrary fetch errors or URLs. */
function gradeFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return "读取失败";
  const status = /grade report returned HTTP (\d{3})\./.exec(error.message)?.[1];
  if (status) return `Moodle 返回 HTTP ${status}`;
  if (error.name === "TimeoutError" || /timed?\s*out|timeout/i.test(error.message)) return "读取超时";
  if (error.name === "AbortError") return "读取已中断";
  if (error instanceof TypeError) return "网络请求失败";
  return "读取失败";
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
