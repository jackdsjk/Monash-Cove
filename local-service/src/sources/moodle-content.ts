import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import type { MoodleContentRow } from "../domain.js";

export class MoodleContentClient {
  private readonly baseUrl: string;
  private sesskey: string | null = null;
  private readonly discussionCache = new Map<string, { title: string; text: string }>();

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

  private async getSesskey() {
    if (this.sesskey) return this.sesskey;
    const dashboard = await this.fetcher(`${this.baseUrl}/my/`, { headers: this.headers(), redirect: "manual" });
    if (!dashboard.ok) throw new Error(`Moodle dashboard returned HTTP ${dashboard.status}.`);
    const html = await dashboard.text();
    const match = /"sesskey"\s*:\s*"([^"]+)"/.exec(html);
    if (!match?.[1]) throw new Error("Moodle dashboard did not contain a sesskey.");
    this.sesskey = match[1];
    return this.sesskey;
  }

  private async discussion(discussionId: string) {
    const cached = this.discussionCache.get(discussionId);
    if (cached) return cached;
    const sesskey = await this.getSesskey();
    const url = new URL("/lib/ajax/service.php", this.baseUrl);
    url.searchParams.set("sesskey", sesskey);
    url.searchParams.set("info", "mod_forum_get_discussion_posts");
    const response = await this.fetcher(url, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify([{ index: 0, methodname: "mod_forum_get_discussion_posts", args: { discussionid: Number(discussionId) } }]),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Moodle discussion returned HTTP ${response.status}.`);
    const envelope = (await response.json()) as Array<{ error?: boolean; data?: { posts?: Array<{ subject?: string; message?: string; userfullname?: string }> } }>;
    const posts = envelope[0]?.data?.posts ?? [];
    const first = posts[0];
    const text = posts.map((post) => {
      const body = post.message ? parse(post.message).text.replace(/\s+/g, " ").trim() : "";
      return `${post.userfullname ?? "Moodle"}: ${body}`;
    }).filter(Boolean).join("\n\n").slice(0, 4000);
    const result = { title: first?.subject ?? "Moodle discussion", text };
    this.discussionCache.set(discussionId, result);
    return result;
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
        const discussionId = /discuss\.php\?d=(\d+)/.exec(href)?.[1];
        let resolvedTitle = title;
        let text = "";
        if (discussionId) {
          try {
            const details = await this.discussion(discussionId);
            resolvedTitle = details.title || title;
            text = details.text;
          } catch {
            // Keep the link even when post extraction is unavailable.
          }
        }
        rows.push({
          id: createHash("sha1").update(`${courseId}:${sectionNumber}:forum:${href}:${resolvedTitle}`).digest("hex"),
          courseId: String(courseId),
          courseName,
          sectionNumber,
          sectionTitle,
          module: "forum",
          title: resolvedTitle,
          url: new URL(href, this.baseUrl).toString(),
          text,
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
