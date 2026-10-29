import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import type { MoodleContentRow } from "../domain.js";

export class MoodleContentClient {
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

  private async html(path: string) {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: this.headers(),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Moodle page returned HTTP ${response.status}.`);
    return parse(await response.text());
  }

  private sectionLinks(html: string, courseId: number) {
    const root = parse(html);
    const sections = new Map<number, string>();
    for (const anchor of root.querySelectorAll("a[href*='course/view.php']")) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const url = new URL(href, this.baseUrl);
      if (url.searchParams.get("id") !== String(courseId)) continue;
      const section = Number(url.searchParams.get("section"));
      const title = decode((anchor.getAttribute("title") ?? anchor.text).replace(/\s+/g, " ").trim());
      if (Number.isFinite(section) && title && !sections.has(section)) sections.set(section, title);
    }
    return [...sections.entries()].sort(([a], [b]) => a - b);
  }

  async scrapeCourse(courseId: number, courseName: string): Promise<MoodleContentRow[]> {
    const course = await this.html(`/course/view.php?id=${courseId}`);
    const sections = this.sectionLinks(course.toString(), courseId);
    const rows: MoodleContentRow[] = [];
    const updatedAt = new Date().toISOString();

    for (const [sectionNumber, sectionTitle] of sections) {
      const page = await this.html(`/course/view.php?id=${courseId}&section=${sectionNumber}`);
      for (const forumLink of page.querySelectorAll("a[href*='/mod/forum/']")) {
        const href = forumLink.getAttribute("href");
        const title = forumLink.text.replace(/\s+/g, " ").trim();
        if (!href || !title || /^\d+$/.test(title.trim()) || href.includes("#unread")) continue;
        rows.push({
          id: createHash("sha1").update(`${courseId}:${sectionNumber}:forum:${href}:${title}`).digest("hex"),
          courseId: String(courseId),
          courseName,
          sectionNumber,
          sectionTitle,
          module: "forum",
          title,
          url: new URL(href, this.baseUrl).toString(),
          text: "",
          updatedAt,
        });
      }
      for (const activity of page.querySelectorAll("li.activity")) {
        const moduleClass = activity.getAttribute("class") ?? "";
        const module = /modtype_(\w+)/.exec(moduleClass)?.[1] ?? "";
        if (!module || module === "cms") continue;
        const link = activity.querySelector("a[href*='/mod/']");
        const rawTitle = (link?.text ?? activity.querySelector(".activityname")?.text ?? activity.text)
          .replace(/\s+/g, " ")
          .trim();
        if (!rawTitle) continue;
        const cleanText = activity.text.replace(/\s+/g, " ").trim().replace(/^Select activity\s+/i, "");
        const title = (module === "label" ? cleanText.slice(0, 100) : rawTitle
          .replace(/\s+(File|URL|Folder|Page|External tool|Assignment|Quiz|Forum|Label|Book)$/i, "")
          .trim());
        const href = link?.getAttribute("href");
        const url = href ? new URL(href, this.baseUrl).toString() : `${this.baseUrl}/course/view.php?id=${courseId}&section=${sectionNumber}`;
        const text = module === "label" ? cleanText.slice(0, 2000) : "";
        rows.push({
          id: createHash("sha1").update(`${courseId}:${sectionNumber}:${module}:${url}:${title}`).digest("hex"),
          courseId: String(courseId),
          courseName,
          sectionNumber,
          sectionTitle,
          module,
          title: title || rawTitle,
          url,
          text,
          updatedAt,
        });
      }
    }
    return dedupe(rows);
  }
}

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function dedupe(rows: MoodleContentRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.courseId}:${row.sectionNumber}:${row.module}:${row.title}:${row.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
