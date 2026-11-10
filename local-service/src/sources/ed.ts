import { parse } from "node-html-parser";

export type EdRegion = "us" | "au" | "eu";

export interface EdRawItem {
  id: string;
  sourceItemId: string;
  course: string;
  title: string;
  text: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
}

interface EdThread {
  id?: number;
  course_id?: number;
  number?: number;
  title?: string;
  document?: string;
  content?: string;
  created_at?: string;
  user_id?: number;
  user?: { id?: number; name?: string; role?: string; course_role?: string };
}

interface EdUser {
  id?: number;
  name?: string;
  role?: string;
  course_role?: string;
}

interface EdComment {
  id?: number;
  user_id?: number;
  document?: string;
  content?: string;
  created_at?: string;
  type?: string;
  comments?: EdComment[];
}

interface EdThreadDetail {
  thread: EdThread & { user_id?: number; content?: string; answers?: EdComment[]; comments?: EdComment[] };
  users?: EdUser[];
}

export interface EdReply {
  id: string;
  authorName: string;
  authorRole: "staff" | "student" | "unknown";
  text: string;
  createdAt: string;
  depth: number;
}

export interface EdThreadDetailResult {
  authorName: string;
  authorRole: "staff" | "student" | "unknown";
  text: string;
  replies: EdReply[];
}

export interface EdCourse {
  id: number;
  code: string;
  name: string;
}

export interface EdLessonSummary {
  id: number;
  title: string;
  slideCount: number;
}

export interface EdMaterialFile {
  name: string;
  url: string;
  kind: "slides" | "pdf" | "file";
}

export interface EdMaterialSlide {
  id: number;
  title: string;
  type: "video" | "text" | "slides" | "quiz" | "file";
  url: string;
  text: string;
  markdown: string;
  videoUrls: string[];
  files: EdMaterialFile[];
}

export interface EdLessonDetail {
  id: number;
  courseId: number;
  title: string;
  slides: EdMaterialSlide[];
}

export class EdClient {
  constructor(
    private readonly token: string,
    private readonly region: EdRegion = "us",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, "https://edstem.org/api/");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetcher(url, {
      headers: { accept: "application/json", authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Ed API returned HTTP ${response.status}.`);
    return (await response.json()) as T;
  }

  async pullAll(onProgress?: (processed: number, total: number | null) => void): Promise<EdRawItem[]> {
    const identity = await this.get<{ courses?: Array<{ course?: { id?: number; name?: string; code?: string; status?: string } }> }>("user");
    const courses = (identity.courses ?? [])
      .map((entry) => entry.course)
      .filter((course): course is { id: number; name?: string; code?: string; status?: string } => Boolean(course?.id));
    const result: EdRawItem[] = [];
    for (const course of courses) {
      let offset = 0;
      const limit = 100;
      while (true) {
        const data = await this.get<{ threads?: EdThread[] }>(`courses/${course.id}/threads`, {
          limit: String(limit),
          offset: String(offset),
          sort: "new",
        });
        const threads = data.threads ?? [];
        result.push(...threads.map((thread) => this.mapThread(thread, course)));
        onProgress?.(result.length, null);
        offset += threads.length;
        if (threads.length < limit) break;
      }
    }
    return result;
  }

  async pull(threadLimit = 30): Promise<EdRawItem[]> {
    const identity = await this.get<{ courses?: Array<{ course?: { id?: number; name?: string; code?: string; status?: string } }> }>("user");
    const courses = (identity.courses ?? [])
      .map((entry) => entry.course)
      .filter((course): course is { id: number; name?: string; code?: string; status?: string } => Boolean(course?.id) && course?.status !== "archived");
    const groups = await Promise.all(
      courses.map(async (course) => {
        const data = await this.get<{ threads?: EdThread[] }>(`courses/${course.id}/threads`, {
          limit: String(Math.min(Math.max(threadLimit, 1), 100)),
          offset: "0",
          sort: "new",
        });
        return (data.threads ?? []).map((thread) => this.mapThread(thread, course));
      }),
    );
    return groups.flat();
  }

  async listCourses(): Promise<EdCourse[]> {
    const identity = await this.get<{ courses?: Array<{ course?: { id?: number; name?: string; code?: string; status?: string } }> }>("user");
    return (identity.courses ?? [])
      .map((entry) => entry.course)
      .filter((course): course is { id: number; name?: string; code?: string } => Boolean(course?.id))
      .map((course) => ({ id: course.id, code: course.code ?? course.name ?? String(course.id), name: course.name ?? course.code ?? String(course.id) }));
  }

  async listLessons(courseId: number): Promise<EdLessonSummary[]> {
    const data = await this.get<{ lessons?: Array<{ id?: number; title?: string; slide_count?: number }> }>(`courses/${courseId}/lessons`);
    return (data.lessons ?? [])
      .filter((lesson): lesson is { id: number; title?: string; slide_count?: number } => Boolean(lesson.id))
      .map((lesson) => {
        const title = lesson.title ?? `Lesson ${lesson.id}`;
        // Ed 的接口不返回周次，只能从标题里取（「Week 5: …」/「W5 …」），取不到就是 0。
        const match = /(?:week|w)\s*(\d{1,2})/i.exec(title);
        return { id: lesson.id, title, slideCount: Number(lesson.slide_count ?? 0), week: match ? Number(match[1]) : 0 };
      });
  }

  async getLesson(lessonId: number): Promise<EdLessonDetail> {
    const data = await this.get<{ lesson?: { id?: number; course_id?: number; title?: string; slides?: Array<{ id?: number; title?: string; type?: string; content?: string; document?: string }> } }>(`lessons/${lessonId}`);
    const lesson = data.lesson;
    if (!lesson?.id) throw new Error("Ed lesson response did not include an id.");
    const courseId = Number(lesson.course_id ?? 0);
    const slides = (lesson.slides ?? [])
      .filter((slide): slide is { id: number; title?: string; type?: string; content?: string; document?: string } => Boolean(slide.id))
      .map((slide) => this.mapLessonSlide(slide, { id: Number(lesson.id) }, courseId));
    return { id: lesson.id, courseId, title: lesson.title ?? `Lesson ${lesson.id}`, slides };
  }

  private mapLessonSlide(
    slide: { id: number; title?: string; type?: string; content?: string; document?: string },
    lesson: { id: number },
    courseId: number,
  ): EdMaterialSlide {
    const raw = slide.content ?? slide.document ?? "";
    const root = raw.includes("<") ? parse(raw) : null;
    const videoUrls = root ? [...root.querySelectorAll("video")].map((node) => node.getAttribute("src") ?? "").filter(Boolean) : [];
    const files = root
      ? [...root.querySelectorAll("file")].map((node) => {
          const url = node.getAttribute("url") ?? "";
          const name = node.getAttribute("filename") ?? url.split("/").pop() ?? "file";
          const kind = /\.pptx?$/i.test(name) ? "slides" : /\.pdf$/i.test(name) ? "pdf" : "file";
          return { name, url, kind } as EdMaterialFile;
        }).filter((file) => Boolean(file.url))
      : [];
    const paragraphs = root
      ? root.querySelectorAll("paragraph").map((node) => node.text.replace(/\s+/g, " ").trim()).filter(Boolean)
      : [];
    const text = (paragraphs.join("\n\n") || (root ? root.text.replace(/\s+/g, " ").trim() : raw)).replace(/\n{3,}/g, "\n\n");
    const type: EdMaterialSlide["type"] = videoUrls.length > 0
      ? "video"
      : files.some((file) => file.kind === "slides")
        ? "slides"
        : files.length > 0
          ? "file"
          : slide.type === "quiz" || !text
            ? "quiz"
            : "text";
    const url = `https://edstem.org/${this.region}/courses/${courseId}/lessons/${lesson.id}/slides/${slide.id}`;
    const fileLines = files.map((file) => `- [${file.name}](${file.url})`).join("\n");
    const markdown = `# ${slide.title ?? "Ed material"}\n\n${text}${fileLines ? `\n\n## Files\n${fileLines}` : ""}`.trim();
    return { id: slide.id, title: slide.title ?? `Slide ${slide.id}`, type, url, text, markdown, videoUrls, files };
  }

  async getThreadDetail(threadId: number): Promise<EdThreadDetailResult> {
    const data = await this.get<EdThreadDetail>(`threads/${threadId}`);
    const users = new Map<number, EdUser>((data.users ?? []).map((user) => [Number(user.id), user]));
    const roleOf = (user?: EdUser): "staff" | "student" | "unknown" => {
      const role = `${user?.course_role ?? ""} ${user?.role ?? ""}`.toLowerCase();
      if (/staff|admin|tutor|teacher|instructor|lecturer/.test(role)) return "staff";
      if (/student|learner/.test(role)) return "student";
      return "unknown";
    };
    const anonymous = !data.thread.user_id;
    const author = data.thread.user ?? users.get(Number(data.thread.user_id));
    const nameOf = (id?: number) => users.get(Number(id))?.name ?? (Number(id) === 0 ? "匿名学生" : "未知作者");
    const textOf = (comment: EdComment) => {
      const raw = comment.document ?? comment.content ?? "";
      return raw.includes("<") ? parse(raw).text.replace(/\s+/g, " ").trim() : raw.trim();
    };
    const replies: EdReply[] = [];
    const add = (comment: EdComment, depth: number) => {
      const text = textOf(comment);
      if (text) {
        const user = users.get(Number(comment.user_id));
        replies.push({
          id: String(comment.id),
          authorName: user?.name ?? nameOf(comment.user_id),
          authorRole: roleOf(user),
          text,
          createdAt: comment.created_at ?? "",
          depth,
        });
      }
      for (const nested of comment.comments ?? []) add(nested, depth + 1);
    };
    for (const answer of data.thread.answers ?? []) add(answer, 0);
    for (const comment of data.thread.comments ?? []) add(comment, 0);
    return {
      authorName: anonymous ? "匿名学生" : author?.name ?? nameOf(data.thread.user_id),
      authorRole: anonymous ? "student" : roleOf(author),
      text: data.thread.document ?? (data.thread.content ? parse(data.thread.content).text : ""),
      replies,
    };
  }

  private mapThread(thread: EdThread, course: { id: number; name?: string; code?: string }): EdRawItem {
    const id = String(thread.id);
    const createdAt = thread.created_at ? new Date(thread.created_at).toISOString() : new Date().toISOString();
    const rawText = thread.document ?? "";
    const text = rawText.includes("<") ? parse(rawText).text : rawText;
    const role = thread.user?.course_role ?? thread.user?.role ?? "unknown";
    const authorRole = ["staff", "admin", "tutor", "teacher"].includes(role) ? "staff" : role === "student" ? "student" : "unknown";
    return {
      id: `ed:${id}`,
      sourceItemId: `thread:${id}`,
      course: course.code ?? course.name ?? "",
      title: thread.title ?? `Ed thread ${thread.number ?? id}`,
      text: text || thread.title || "(empty Ed thread)",
      authorRole,
      publishedAt: createdAt,
      updatedAt: createdAt,
      url: `https://edstem.org/${this.region}/courses/${course.id}/discussion/${thread.number ?? id}`,
    };
  }
}
