import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCoveMcpServer } from "../mcp.js";

const item = {
  id: "moodle:assessment:1",
  source: "moodle",
  course: "FIT1047_S2_2026",
  title: "Portfolio is due",
  authorRole: "system",
  publishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ageHours: 2,
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  deadlineKind: "assign",
  contentType: "assessment_fact",
  importance: "critical",
  actionRequired: "yes",
  openOriginal: "required",
  evidenceQuote: "Portfolio is due",
  text: "Portfolio is due tomorrow.",
  url: "https://learning.monash.edu/mod/assign/view.php?id=1",
  read: false,
};

async function withClient(fetcher: typeof fetch, run: (client: Client) => Promise<void>) {
  const server = createCoveMcpServer({ fetcher, apiBase: "http://127.0.0.1:4317" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cove-test", version: "0.1.0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function payload(result: Awaited<ReturnType<Client["callTool"]>>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0].text);
}

describe("Cove MCP", () => {
  it("registers read-only tools and returns brief JSON", async () => {
    const fetcher = (async (url: string) => {
      if (url.endsWith("/api/brief")) {
        return new Response(JSON.stringify({ items: [item], sources: [], syncedAt: null, lastCheckedAt: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    }) as typeof fetch;

    const server = createCoveMcpServer({ fetcher, apiBase: "http://127.0.0.1:4317" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "cove-test", version: "0.1.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("cove_brief");
    expect(tools.tools.map((tool) => tool.name)).not.toContain("sync_now");

    const result = await client.callTool({ name: "cove_brief", arguments: { limit: 1 } });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.returned).toBe(1);
    expect(parsed.items[0].id).toBe(item.id);
    expect(parsed.items[0].title).toBe("Portfolio is due");

    await client.close();
    await server.close();
  });

  it("includes OnTrack deadlines, filters completed and invalid dates, and bounds overdue work", async () => {
    const dated = (id: string, days: number, extra = {}) => ({
      ...item, id, dueAt: new Date(Date.now() + days * 86_400_000).toISOString(), ...extra,
    });
    const items = [
      dated("later", 3), dated("ontrack", 1, { source: "ontrack" }),
      dated("complete", 2, { completedAt: new Date().toISOString() }),
      dated("overdue", -1), dated("old", -91), dated("future", 31),
      dated("mail", 1, { source: "gmail" }), { ...item, id: "invalid", dueAt: "unknown" },
    ];
    await withClient((async () => Response.json({ items })) as typeof fetch, async (client) => {
      const upcoming = payload(await client.callTool({ name: "cove_deadlines", arguments: {} }));
      expect(upcoming.items.map((entry: { id: string }) => entry.id)).toEqual(["ontrack", "later"]);
      const overdue = payload(await client.callTool({ name: "cove_deadlines", arguments: { includeOverdue: true } }));
      expect(overdue.items.map((entry: { id: string }) => entry.id)).toEqual(["overdue", "ontrack", "later"]);
      const filtered = payload(await client.callTool({ name: "cove_deadlines", arguments: { source: "ontrack", course: "fit1047_s2_2026" } }));
      expect(filtered.items.map((entry: { id: string }) => entry.id)).toEqual(["ontrack"]);
    });
  });

  it("keeps Moodle courses as the default and discovers Ed courses explicitly", async () => {
    const calls: string[] = [];
    await withClient((async (input) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      return Response.json({ courses: [{ id: path.includes("/ed/") ? 2 : 1 }] });
    }) as typeof fetch, async (client) => {
      expect(payload(await client.callTool({ name: "cove_courses", arguments: {} })).courses[0].id).toBe(1);
      expect(payload(await client.callTool({ name: "cove_courses", arguments: { source: "ed" } })).courses[0].id).toBe(2);
    });
    expect(calls).toEqual(["/api/moodle/courses", "/api/ed/courses"]);
  });

  it("reads existing change history with a normalized exclusive timestamp and limit", async () => {
    const fetcher = vi.fn(async () => Response.json({ changes: [{ id: 1, field: "dueAt" }], since: "2026-01-01T00:00:00.000Z" }));
    await withClient(fetcher as typeof fetch, async (client) => {
      const result = payload(await client.callTool({ name: "cove_changes", arguments: { since: "2026-01-01T10:00:00+10:00", limit: 25 } }));
      expect(result.changes).toEqual([{ id: 1, field: "dueAt" }]);
    });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/changes");
    expect(url.searchParams.get("since")).toBe("2026-01-01T00:00:00.000Z");
    expect(url.searchParams.get("limit")).toBe("25");
  });

  it("reads Ed lessons and preserves outline and slide attachments without fetching files", async () => {
    const calls: string[] = [];
    const lesson = { id: 22, files: [{ name: "Outline.pdf", url: "https://example.invalid/outline.pdf", kind: "pdf" }], slides: [{ id: 23, files: [{ name: "Slides.pdf", url: "https://example.invalid/slides.pdf", kind: "pdf" }] }] };
    await withClient((async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      return Response.json(url.pathname.endsWith("/lessons") ? { lessons: [{ id: 22, title: "Week 1" }] } : lesson);
    }) as typeof fetch, async (client) => {
      expect(payload(await client.callTool({ name: "cove_ed_lessons", arguments: { courseId: 11 } })).lessons[0].id).toBe(22);
      expect(payload(await client.callTool({ name: "cove_ed_lesson", arguments: { lessonId: 22 } }))).toEqual(lesson);
    });
    expect(calls).toEqual(["/api/ed/lessons?courseId=11", "/api/ed/lesson?lessonId=22"]);
  });

  it("preserves definition-first OnTrack IDs and reads feedback using the task definition", async () => {
    const calls: string[] = [];
    const data = { projects: [{ id: 7 }, { id: 8 }], tasks: [
      { id: null, projectId: 7, taskDefinitionId: 70, status: "not_started", dueDate: null },
      { id: 800, projectId: 8, taskDefinitionId: 80, status: "complete" },
    ], cache: { stale: true } };
    const comments = { comments: [{ id: 1, comment: "Check the example." }], viewerId: 2 };
    await withClient((async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      return Response.json(url.pathname.endsWith("/tasks") ? data : comments);
    }) as typeof fetch, async (client) => {
      const result = payload(await client.callTool({ name: "cove_ontrack_tasks", arguments: { projectId: 7 } }));
      expect(result).toEqual({ projects: [{ id: 7 }], tasks: [data.tasks[0]], cache: data.cache });
      expect(payload(await client.callTool({ name: "cove_ontrack_comments", arguments: { projectId: 7, taskDefinitionId: 70 } }))).toEqual(comments);
    });
    expect(calls).toEqual(["/api/ontrack/tasks", "/api/ontrack/comments?project=7&task=70"]);
  });

  it.each([401, 404, 409, 502])("returns safe structured errors for HTTP %s", async (status) => {
    await withClient((async () => Response.json({ error: { message: "private-token https://private.invalid?token=secret" } }, { status })) as typeof fetch, async (client) => {
      const result = await client.callTool({ name: "cove_ed_lessons", arguments: { courseId: 11 } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error: { code: expect.any(String), message: expect.stringContaining(`HTTP ${status}`), hint: expect.any(String) } });
      expect(JSON.stringify(result)).not.toMatch(/private|secret/);
    });
  });

  it("does not leak thrown transport messages or accept malformed successful responses", async () => {
    for (const fetcher of [async () => { throw new Error("private-token https://private.invalid"); }, async () => new Response("<html>login</html>")]) {
      await withClient(fetcher as typeof fetch, async (client) => {
        const result = await client.callTool({ name: "cove_sources", arguments: {} });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ error: { code: "api_unavailable" } });
        expect(JSON.stringify(result)).not.toMatch(/private-token|private.invalid|<html>/);
      });
    }
  });

  it("rejects invalid resource IDs before HTTP and keeps every tool read-only", async () => {
    const fetcher = vi.fn(async () => Response.json({}));
    await withClient(fetcher as typeof fetch, async (client) => {
      const tools = await client.listTools();
      expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["cove_changes", "cove_ed_lessons", "cove_ed_lesson", "cove_ontrack_tasks", "cove_ontrack_comments"]));
      for (const [name, args] of [["cove_ed_lesson", { lessonId: -1 }], ["cove_ontrack_comments", { projectId: 1, taskDefinitionId: 0 }], ["cove_changes", { since: "yesterday" }]] as const) {
        expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
      }
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
