import { describe, expect, it } from "vitest";
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
});
