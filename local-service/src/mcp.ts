import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type SourceName = "gmail" | "ed" | "moodle";

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

function failure(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "Cove MCP request failed.",
      },
    ],
  };
}

export function createCoveMcpServer(options: McpOptions = {}) {
  const base = (options.apiBase ?? process.env.COVE_API_URL ?? "http://127.0.0.1:4317").replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;

  async function api<T>(path: string): Promise<T> {
    const response = await fetcher(`${base}/api${path}`, { headers: { accept: "application/json" } });
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) throw new Error(body?.error?.message ?? `Cove API returned HTTP ${response.status}.`);
    return body as T;
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
    { name: "cove", version: "0.1.1" },
    {
      instructions:
        "Cove is a local, read-only campus triage service. Use cove_brief for the current brief, cove_deadlines for due dates, and cove_get_item for source text and evidence. Data is user-local; never assume a shared account.",
    },
  );

  server.registerTool(
    "cove_brief",
    {
      title: "Get Cove brief",
      description: "Return the local campus brief. Read-only; items are normalized from Gmail, Ed, and Moodle.",
      inputSchema: z.object({
        source: z.enum(["gmail", "ed", "moodle"]).optional(),
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
      title: "Get Cove item",
      description: "Return one Cove item including source text, evidence quote, course, URL, and triage fields.",
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
      title: "List Cove deadlines",
      description: "Return Moodle assessments with due dates, nearest first.",
      inputSchema: z.object({ days: z.number().int().min(1).max(365).default(30) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ days }) => {
      try {
        const data = await brief();
        const maxAge = Date.now() + days * 24 * 60 * 60 * 1000;
        const items = data.items
          .filter((item) => item.source === "moodle" && typeof item.dueAt === "string")
          .filter((item) => {
            const due = Date.parse(item.dueAt as string);
            return Number.isFinite(due) && due <= maxAge;
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
      title: "List Cove sources",
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
      title: "Get Cove sync status",
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
      title: "List Cove Moodle courses",
      description: "List Moodle courses visible in the local account.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return text(await api("/moodle/courses"));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cove_materials",
    {
      title: "List Cove course materials",
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

  return server;
}

export type CoveMcpServer = ReturnType<typeof createCoveMcpServer>;
export type { SourceName };
