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
