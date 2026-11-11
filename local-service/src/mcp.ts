import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type SourceName = "gmail" | "ed" | "moodle" | "ontrack";

export interface McpOptions {
  apiBase?: string;
  fetcher?: typeof fetch;
}

function text(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

class ApiFailure extends Error {
  constructor(readonly status: number) {
    super("Local API request failed.");
  }
}

function failure(error: unknown) {
  const status = error instanceof ApiFailure ? error.status : null;
  const code = status === 401 || status === 403 ? "connection_required"
    : status === 404 ? "not_found" : status === 409 ? "request_conflict"
      : status === null ? "api_unavailable" : "request_failed";
  const message = status === null ? "The local service is unavailable or returned invalid JSON."
    : `The local service could not complete this request (HTTP ${status}).`;
  const hint = status === 401 || status === 403 || status === 409
    ? "Check cove_sources and reconnect the affected source in Settings if needed."
    : status === 404 ? "Check the item, course, lesson or task ID using the corresponding list tool."
      : "Check that the local service is running, then retry. Existing cached data may still be available.";
  return {
    isError: true,
    structuredContent: { error: { code, message, hint } },
    content: [
      {
        type: "text" as const,
        text: `${message}\nNext: ${hint}`,
      },
    ],
  };
}

export function createCoveMcpServer(options: McpOptions = {}) {
  const base = (options.apiBase ?? process.env.COVE_API_URL ?? "http://127.0.0.1:4317").replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;

  async function api<T>(path: string): Promise<T> {
    const response = await fetcher(`${base}/api${path}`, { headers: { accept: "application/json" } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiFailure(response.status);
    }
    return await response.json() as T;
  }

  async function brief() {
    const data = await api<{ items: Array<Record<string, unknown>>; sources: unknown[]; syncedAt: string | null; lastCheckedAt: string | null }>("/brief");
    return data;
  }

  function compact(item: Record<string, unknown>) {
    return {
      id: item.id,
      source: item.source,
      course: item.course,
      title: item.title,
      importance: item.importance,
      actionRequired: item.actionRequired,
      contentType: item.contentType,
      ageHours: item.ageHours,
      dueAt: item.dueAt ?? null,
      deadlineKind: item.deadlineKind ?? null,
      url: item.url,
      evidenceQuote: item.evidenceQuote,
      read: item.read,
      completedAt: item.completedAt ?? null,
    };
  }

  function sectionRegion(value: string) {
    const textValue = value.toLowerCase();
    if (/\bindonesia\b|indonesia campus/.test(textValue)) return "indonesia";
    if (/\bmalaysia\b|\bmum\b/.test(textValue)) return "malaysia";
    if (/australia|clayton|caulfield|peninsula/.test(textValue)) return "australia";
    return "shared";
  }

  const server = new McpServer(
    { name: "cove", version: "0.1.2" },
    {
      instructions:
        "Monash Cove is a local, read-only campus triage service. Use cove_brief for the current brief, cove_deadlines for incomplete Moodle/OnTrack due dates, cove_changes for recorded changes, and cove_get_item for source evidence. Discover Ed courses through cove_courses({source:'ed'}), then read cove_ed_lessons/cove_ed_lesson. Use cove_ontrack_tasks and cove_ontrack_comments for task state and feedback. Data is user-local; never assume a shared account.",
    },
  );

  server.registerTool(
    "cove_brief",
    {
      title: "Get Monash Cove brief",
      description: "Return the local campus brief. Read-only; items are normalized from Gmail, Ed, Moodle, and OnTrack.",
      inputSchema: z.object({
        source: z.enum(["gmail", "ed", "moodle", "ontrack"]).optional(),
        sinceHours: z.number().int().min(0).max(24 * 365).optional(),
        q: z.string().max(200).optional(),
        onlyAction: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ source, sinceHours, q, onlyAction, limit }) => {
      try {
        const data = await brief();
        const query = (q ?? "").trim().toLowerCase();
        const items = data.items
          .filter((item) => (source ? item.source === source : true))
          .filter((item) => (sinceHours === undefined ? true : Number(item.ageHours) <= sinceHours))
          .filter((item) => (onlyAction ? item.actionRequired === "yes" || item.importance === "critical" : true))
          .filter((item) =>
            query
              ? [item.title, item.course, item.text, item.evidenceQuote].join(" ").toLowerCase().includes(query)
              : true,
          )
          .slice(0, limit)
          .map(compact);
        return text({ items, sources: data.sources, syncedAt: data.syncedAt, lastCheckedAt: data.lastCheckedAt, returned: items.length });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_get_item",
    {
      title: "Get Monash Cove item",
      description: "Return one Monash Cove item including source text, evidence quote, course, URL, and triage fields.",
      inputSchema: z.object({ id: z.string().min(1) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return text(await api(`/items/${encodeURIComponent(id)}`));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_deadlines",
    {
      title: "List Monash Cove deadlines",
      description: "Return incomplete Moodle and OnTrack assessments with due dates, nearest first. Optionally include overdue work from the past 90 days.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).default(30),
        source: z.enum(["moodle", "ontrack"]).optional(),
        course: z.string().trim().min(1).max(200).optional(),
        includeOverdue: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ days, source, course, includeOverdue }) => {
      try {
        const data = await brief();
        const now = Date.now();
        const maxAge = now + days * 24 * 60 * 60 * 1000;
        const minDue = includeOverdue ? now - 90 * 24 * 60 * 60 * 1000 : now;
        const items = data.items
          .filter((item) => ["moodle", "ontrack"].includes(String(item.source)) && typeof item.dueAt === "string" && !item.completedAt)
          .filter((item) => !source || item.source === source)
          .filter((item) => !course || String(item.course).toLowerCase() === course.toLowerCase())
          .filter((item) => {
            const due = Date.parse(item.dueAt as string);
            return Number.isFinite(due) && due >= minDue && due <= maxAge;
          })
          .sort((a, b) => Date.parse(a.dueAt as string) - Date.parse(b.dueAt as string))
          .map(compact);
        return text({ items, returned: items.length });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_sources",
    {
      title: "List Monash Cove sources",
      description: "Return local source connection status and item counts.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return text(await api("/sources"));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_sync_status",
    {
      title: "Get Monash Cove sync status",
      description: "Return full-sync completion and current background sync progress.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return text(await api("/sync/status"));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_courses",
    {
      title: "List Monash Cove courses",
      description: "List courses visible in the local account. Defaults to Moodle; choose Ed to discover course IDs for cove_ed_lessons.",
      inputSchema: z.object({ source: z.enum(["moodle", "ed"]).default("moodle") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ source }) => {
      try {
        return text(await api(`/${source}/courses`));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_materials",
    {
      title: "List Monash Cove course materials",
      description: "Return cached Moodle sections and materials for one course. Optionally filter explicitly labelled campus content.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        region: z.enum(["malaysia", "australia", "indonesia"]).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ courseId, region }) => {
      try {
        const data = await api<{ courseId: string; items: Array<Record<string, unknown>> }>(`/moodle/content?courseId=${courseId}`);
        const items = data.items
          .filter((item) =>
            region
              ? ["shared", region].includes(sectionRegion(`${item.sectionTitle ?? ""} ${item.title ?? ""}`))
              : true,
          )
          .map((item) => ({
            id: item.id,
            courseId: item.courseId,
            courseName: item.courseName,
            sectionNumber: item.sectionNumber,
            sectionTitle: item.sectionTitle,
            module: item.module,
            title: item.title,
            url: item.url,
            text: item.text,
          }));
        return text({ courseId, items, returned: items.length });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_changes",
    {
      title: "Read Monash Cove changes",
      description: "Read stored item changes across sources, newest first. since is an exclusive ISO timestamp filter. Results are a bounded window, not a complete paginated history; a full limit may omit older changes.",
      inputSchema: z.object({ since: z.iso.datetime({ offset: true }).optional(), limit: z.number().int().min(1).max(500).default(100) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ since, limit }) => {
      try {
        const query = new URLSearchParams({ limit: String(limit) });
        if (since) query.set("since", new Date(since).toISOString());
        return text(await api(`/changes?${query}`));
      } catch (error) { return failure(error); }
    },
  );

  server.registerTool(
    "cove_ed_lessons",
    {
      title: "List Ed lessons",
      description: "List lessons for an Ed course. Use cove_courses with source ed to discover course IDs; use cove_ed_lesson for slide content and attached file links.",
      inputSchema: z.object({ courseId: z.number().int().positive() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ courseId }) => {
      try { return text(await api(`/ed/lessons?courseId=${courseId}`)); }
      catch (error) { return failure(error); }
    },
  );

  server.registerTool(
    "cove_ed_lesson",
    {
      title: "Read Ed lesson",
      description: "Read one Ed lesson, including slide text and file links. Does not download file bytes or submit work.",
      inputSchema: z.object({ lessonId: z.number().int().positive() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lessonId }) => {
      try { return text(await api(`/ed/lesson?lessonId=${lessonId}`)); }
      catch (error) { return failure(error); }
    },
  );

  server.registerTool(
    "cove_ontrack_tasks",
    {
      title: "List OnTrack tasks",
      description: "Read OnTrack projects and task definitions with status, applicability and actual due dates. taskDefinitionId, not nullable instance id, identifies a task for cove_ontrack_comments.",
      inputSchema: z.object({ projectId: z.number().int().positive().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId }) => {
      try {
        const data = await api<{ projects: Array<Record<string, unknown>>; tasks: Array<Record<string, unknown>>; cache?: unknown }>("/ontrack/tasks");
        return text({ ...data,
          projects: data.projects.filter((project) => projectId === undefined || project.id === projectId),
          tasks: data.tasks.filter((task) => projectId === undefined || task.projectId === projectId),
        });
      } catch (error) { return failure(error); }
    },
  );

  server.registerTool(
    "cove_ontrack_comments",
    {
      title: "Read OnTrack task feedback",
      description: "Read the comment thread for an OnTrack task, oldest first. Use projectId and taskDefinitionId from cove_ontrack_tasks. Does not post comments or change task status.",
      inputSchema: z.object({ projectId: z.number().int().positive(), taskDefinitionId: z.number().int().positive() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, taskDefinitionId }) => {
      try { return text(await api(`/ontrack/comments?project=${projectId}&task=${taskDefinitionId}`)); }
      catch (error) { return failure(error); }
    },
  );

  return server;
}

export type CoveMcpServer = ReturnType<typeof createCoveMcpServer>;
export type { SourceName };
