import { parse, type HTMLElement } from "node-html-parser";
import type { MoodleRawItem } from "./moodle.js";

interface CourseLink {
  id: string;
  title: string;
}

export class MoodleForumClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly session: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async html(path: string): Promise<HTMLElement> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      headers: { cookie: `MoodleSession=${this.session}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Moodle page returned HTTP ${response.status}.`);
    return parse(await response.text());
  }

  private links(root: HTMLElement, pattern: RegExp) {
    const result: Array<{ id: string; title: string }> = [];
    for (const link of root.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href") ?? "";
      const match = pattern.exec(href);
      if (!match?.[1]) continue;
      result.push({ id: match[1], title: link.text.trim() || match[1] });
    }
    return dedupeById(result);
  }

  async courses(): Promise<CourseLink[]> {
    return this.links(await this.html("/my/"), /course\/view\.php\?id=(\d+)/);
  }

  async forums(courseId: string): Promise<CourseLink[]> {
    return this.links(await this.html(`/course/view.php?id=${encodeURIComponent(courseId)}`), /mod\/forum\/view\.php\?id=(\d+)/);
  }

  async discussions(forumId: string): Promise<CourseLink[]> {
    return this.links(await this.html(`/mod/forum/view.php?id=${encodeURIComponent(forumId)}`), /mod\/forum\/discuss\.php\?d=(\d+)/);
  }

  async thread(discussionId: string, course: string, forumTitle: string): Promise<MoodleRawItem[]> {
    const root = await this.html(`/mod/forum/discuss.php?d=${encodeURIComponent(discussionId)}`);
    const title = root.querySelector("h1")?.text.trim() || forumTitle;
    const posts = root.querySelectorAll("[data-post-id], article.forum-post-container, .post");
    const seen = new Set<string>();
    const result: MoodleRawItem[] = [];
    for (const post of posts) {
      const id = post.getAttribute("data-post-id") ?? /p(\d+)/.exec(post.getAttribute("id") ?? "")?.[1];
      if (!id || seen.has(id)) continue;
      const body = post.querySelector(".post-content, .posting, .text_to_html, .post-text, .content");
      const text = (body?.text ?? post.text).replace(/\s+/g, " ").trim();
      if (!text) continue;
      seen.add(id);
      const time = post.querySelector("time[datetime]")?.getAttribute("datetime");
      const publishedAt = time ? new Date(time).toISOString() : new Date().toISOString();
      result.push({
        id: `moodle:forum-post:${id}`,
        sourceItemId: `forum-post:${id}`,
        course,
        title,
        text,
        authorRole: "unknown",
        publishedAt,
        updatedAt: publishedAt,
        url: `${this.baseUrl}/mod/forum/discuss.php?d=${discussionId}#p${id}`,
        kind: "forum",
      });
    }
    return result;
  }

  async pull(input: { maxCourses?: number; maxDiscussions?: number } = {}): Promise<MoodleRawItem[]> {
    const maxCourses = input.maxCourses ?? 10;
    const maxDiscussions = input.maxDiscussions ?? 10;
    const courses = (await this.courses()).slice(0, maxCourses);
    const items: MoodleRawItem[] = [];
    for (const course of courses) {
      const forums = await this.forums(course.id);
      for (const forum of forums) {
        const discussions = (await this.discussions(forum.id)).slice(0, maxDiscussions);
        for (const discussion of discussions) {
          items.push(...(await this.thread(discussion.id, course.title, forum.title)));
        }
      }
    }
    return items;
  }
}

function dedupeById(values: CourseLink[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}
