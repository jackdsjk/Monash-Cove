import { parse } from "node-html-parser";

export interface MoodleCourseSummary {
  id: number;
  shortname: string;
  fullname: string;
}

export interface MoodleRawItem {
  id: string;
  sourceItemId: string;
  course: string;
  title: string;
  text: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
  dueAt?: string | null;
  deadlineKind?: string | null;
  completedAt?: string | null;
  kind?: "assessment" | "forum";
}

const COURSES_METHOD = "core_course_get_enrolled_courses_by_timeline_classification";
const TIMELINE_METHOD = "core_calendar_get_action_events_by_timesort";
const ASSESSMENT_MODULES = new Set(["assign", "choice", "lesson", "quiz", "workshop"]);

interface MoodleEvent {
  id?: number;
  name?: string;
  modname?: string;
  modulename?: string;
  purpose?: string;
  activityname?: string;
  timesort?: number;
  timestart?: number;
  url?: string;
  course?: { id?: number; shortname?: string; fullname?: string };
  action?: { name?: string; url?: string };
}

/** A confirmed login/SSO bounce, distinct from an upstream outage. */
export class MoodleSessionExpiredError extends Error {
  constructor() {
    super("Moodle 会话已过期，需要重新登录");
    this.name = "MoodleSessionExpiredError";
  }
}

export interface MoodleSessionProbe {
  ok: boolean;
  status: number;
  url: string;
  expired: boolean;
}

const MAX_PROBE_BODY_BYTES = 2 * 1024 * 1024;

async function probeHtml(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_PROBE_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error("Moodle session probe response is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_PROBE_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Moodle session probe response is too large.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length).toString("utf8");
}

export class MoodleClient {
  private readonly baseUrl: string;

  /** `cookie` is the full Cookie header for Moodle (see `moodleCookieHeader`). */
  constructor(
    baseUrl: string,
    private readonly cookie: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private headers() {
    // Moodle is happier when requests look like a browser session; some sites
    // bind sessions to a user agent.
    return {
      cookie: this.cookie,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
  }

  /**
   * Follows redirects and rejects anything that lands off-site or on a login
   * page, so an SSO bounce can never be mistaken for a valid session.
   *
   * `timeoutMs` lets the background verifier run a lighter ping than the
   * 15s budget a user-facing login check gets.
   */
  async probeSession(timeoutMs = 15_000): Promise<MoodleSessionProbe> {
    const target = `${this.baseUrl}/my/`;
    const response = await this.fetcher(target, {
      headers: this.headers(),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const url = response.url || target;
    const result = (ok: boolean, expired = false): MoodleSessionProbe => ({ ok, status: response.status, url, expired });
    // Authentication cannot be inferred from an outage, even if its URL looks
    // like SSO. A forbidden page without a login form is also not a logout.
    if (!response.ok) {
      await response.body?.cancel();
      return result(false, response.status === 401);
    }
    const finalUrl = new URL(url);
    const offSite = finalUrl.origin !== new URL(this.baseUrl).origin;
    const loginPage = /\/(?:login|signin)(?:\/|\.php(?:\/|$)|$)/i.test(finalUrl.pathname);
    if (offSite || loginPage) {
      await response.body?.cancel();
      return result(false, true);
    }
    const root = parse(await probeHtml(response));
    const loginForm = root.querySelector('form input[type="password"], form#login, form#loginform, form[action*="/login/index.php"]');
    const loggedOut = root.querySelector('body.notloggedin, body#page-login-index') ||
      /you are not logged in|您尚未登录|你尚未登录|您还未登录/i.test(root.querySelector('.logininfo')?.text ?? "");
    if (loginForm || loggedOut) return result(false, true);
    const logoutLink = root.querySelector('a[href*="/login/logout.php"]');
    let hasSesskey = false;
    try { hasSesskey = Boolean(parseSesskey(root.toString())); } catch { /* A generic 200 is not proof of a session. */ }
    return result(Boolean(logoutLink || hasSesskey));
  }

  async validateSession(): Promise<boolean> {
    const probe = await this.probeSession().catch(() => ({ ok: false, status: 0, url: "" }));
    return probe.ok;
  }

  async listCourses(): Promise<MoodleCourseSummary[]> {
    const dashboard = await this.fetcher(`${this.baseUrl}/my/`, { headers: this.headers(), redirect: "follow" });
    if (!dashboard.ok) throw new Error(`Moodle dashboard returned HTTP ${dashboard.status}.`);
    const sesskey = parseSesskey(await dashboard.text());
    const url = new URL("/lib/ajax/service.php", this.baseUrl);
    url.searchParams.set("sesskey", sesskey);
    url.searchParams.set("info", COURSES_METHOD);
    const response = await this.fetcher(url, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify([
        { index: 0, methodname: COURSES_METHOD, args: { classification: "all", limit: 100, offset: 0, sort: "fullname" } },
      ]),
    });
    if (!response.ok) throw new Error(`Moodle AJAX returned HTTP ${response.status}.`);
    const envelope = (await response.json()) as Array<{ error?: boolean; data?: { courses?: Array<Record<string, unknown>> } }>;
    if (!Array.isArray(envelope) || envelope[0]?.error) throw new Error("Moodle course list failed.");
    return (envelope[0]?.data?.courses ?? []).map((course) => ({
      id: Number(course.id),
      shortname: String(course.shortname ?? ""),
      fullname: String(course.fullname ?? ""),
    }));
  }

  async pull(): Promise<MoodleRawItem[]> {
    const dashboard = await this.fetcher(`${this.baseUrl}/my/`, { headers: this.headers(), redirect: "follow" });
    if (!dashboard.ok) throw new Error(`Moodle dashboard returned HTTP ${dashboard.status}.`);
    const html = await dashboard.text();
    const sesskey = parseSesskey(html);
    const url = new URL("/lib/ajax/service.php", this.baseUrl);
    url.searchParams.set("sesskey", sesskey);
    url.searchParams.set("info", `${COURSES_METHOD},${TIMELINE_METHOD}`);
    const response = await this.fetcher(url, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify([
        { index: 0, methodname: COURSES_METHOD, args: { classification: "all", limit: 100, offset: 0, sort: "fullname" } },
        {
          index: 1,
          methodname: TIMELINE_METHOD,
          args: { limitnum: 50, timesortfrom: Math.floor(Date.now() / 1000), timesortto: 0, aftereventid: 0, limittononsuspendedevents: true },
        },
      ]),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Moodle AJAX returned HTTP ${response.status}.`);
    const envelope = (await response.json()) as Array<{ error?: boolean; data?: { events?: MoodleEvent[] } }>;
    if (!Array.isArray(envelope) || envelope.length !== 2) throw new Error("Moodle AJAX returned an invalid batch response.");
    if (envelope.some((entry) => entry.error)) throw new Error("Moodle AJAX returned an error.");
    const events = envelope[1]?.data?.events ?? [];
    const items = events
      .filter((event) => event.purpose === "assessment" || ASSESSMENT_MODULES.has(event.modulename ?? event.modname ?? ""))
      .map((event) => this.mapAssessment(event))
      .filter((item): item is MoodleRawItem => item !== null);
    return this.markSubmitted(items);
  }

  /**
   * The calendar feed keeps reporting an assignment until its due date even
   * after it was handed in, so ask the activity page for the submission state.
   * A failed lookup leaves the item untouched rather than guessing.
   */
  private async markSubmitted(items: MoodleRawItem[]): Promise<MoodleRawItem[]> {
    return Promise.all(items.map(async (item) => {
      if (!item.url || !/\/mod\/assign\/view\.php/.test(item.url)) return item;
      const status = await this.submissionStatus(item.url).catch(() => "unknown" as const);
      if (status !== "submitted" && status !== "graded") return item;
      return { ...item, completedAt: item.updatedAt };
    }));
  }

  async submissionStatus(url: string): Promise<"submitted" | "graded" | "none" | "unknown"> {
    const response = await this.fetcher(url, {
      headers: this.headers(),
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response?.ok) return "unknown";
    const root = parse(await response.text());
    // Moodle renders the table as <tr><th>Submission status</th><td>…</td></tr>;
    // the label is a th, so the value is every remaining cell in that row.
    const rows = new Map(root.querySelectorAll("tr").map((row) => {
      const cells = row.querySelectorAll("th, td");
      const normalize = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();
      return [normalize(cells[0]?.text ?? ""), normalize(cells.slice(1).map((cell) => cell.text).join(" "))];
    }));
    const value = rows.get("submission status") ?? rows.get("提交状态") ?? "";
    const grading = rows.get("grading status") ?? rows.get("评分状态") ?? "";
    // Grading is usually a separate row. "Not graded" and "ungraded" are not
    // positive evidence, and an unfamiliar status must not clear known work.
    const isGraded = (text: string): boolean =>
      (/\bgraded\b/.test(text) && !/\b(?:not|never|pending|awaiting)\b/.test(text)) || /已评分|已批改/.test(text);
    if (isGraded(grading) || isGraded(value)) return "graded";
    if (/no submissions?|nothing submitted|not submitted|未提交|尚未提交/.test(value)) return "none";
    if (/\bsubmitted\b|已提交/.test(value)) return "submitted";
    return "unknown";
  }

  private mapAssessment(event: MoodleEvent): MoodleRawItem | null {
    const id = Number(event.id);
    const due = Number(event.timesort || event.timestart);
    if (!id || !due) return null;
    const dueAt = new Date(due * 1000).toISOString();
    const course = event.course?.shortname ?? event.course?.fullname ?? "";
    const title = event.name ?? event.activityname ?? `Moodle assessment ${id}`;
    const text = `${title} submission deadline is ${dueAt}.`;
    return {
      id: `moodle:assessment:${id}`,
      sourceItemId: `assessment:${id}`,
      course,
      title,
      text,
      authorRole: "system",
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url: event.url ?? event.action?.url ?? (event.course?.id ? `${this.baseUrl}/course/view.php?id=${event.course.id}` : this.baseUrl),
      dueAt,
      deadlineKind: event.modulename ?? event.modname ?? "assessment",
      kind: "assessment",
    };
  }
}

function parseSesskey(html: string) {
  const match = /"sesskey"\s*:\s*"([^"]+)"/.exec(html) ?? /name=["']sesskey["'][^>]*value=["']([^"']+)["']/i.exec(html);
  if (!match?.[1]) throw new Error("Moodle dashboard did not contain a sesskey.");
  return match[1];
}
