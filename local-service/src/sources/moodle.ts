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

export class MoodleClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly session: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private headers() {
    return { cookie: `MoodleSession=${this.session}` };
  }

  async validateSession(): Promise<boolean> {
    const response = await this.fetcher(`${this.baseUrl}/my/`, {
      headers: this.headers(),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  }

  async listCourses(): Promise<MoodleCourseSummary[]> {
    const dashboard = await this.fetcher(`${this.baseUrl}/my/`, { headers: this.headers(), redirect: "manual" });
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
    const dashboard = await this.fetcher(`${this.baseUrl}/my/`, { headers: this.headers(), redirect: "manual" });
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
    return events
      .filter((event) => event.purpose === "assessment" || ASSESSMENT_MODULES.has(event.modulename ?? event.modname ?? ""))
      .map((event) => this.mapAssessment(event))
      .filter((item): item is MoodleRawItem => item !== null);
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
