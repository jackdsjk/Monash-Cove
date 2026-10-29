import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../db.js";
import { EdClient } from "../sources/ed.js";
import { MoodleClient } from "../sources/moodle.js";
import { syncEd, syncMoodle } from "../sync/sources.js";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Ed", () => {
  it("maps active course threads into normalized items", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/user")) {
        return jsonResponse({ courses: [{ course: { id: 11, code: "FIT1045", name: "Algorithms", status: "active" } }] });
      }
      return jsonResponse({
        threads: [
          {
            id: 7,
            number: 2,
            title: "Deadline clarification",
            document: "The deadline is Friday. Staff confirmed it.",
            created_at: "2026-10-29T10:00:00.000Z",
            user: { course_role: "staff" },
          },
        ],
      });
    }) as unknown as typeof fetch;

    const client = new EdClient("token", "au", fetcher);
    const items = await client.pull();
    expect(items).toHaveLength(1);
    expect(items[0].course).toBe("FIT1045");
    expect(items[0].authorRole).toBe("staff");
    expect(items[0].url).toContain("/au/");
  });

  it("persists Ed items through the sync function", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const fetcher = vi.fn(async (input: string | URL) => {
      if (String(input).endsWith("/user")) return jsonResponse({ courses: [{ course: { id: 11, code: "FIT1045", status: "active" } }] });
      return jsonResponse({ threads: [{ id: 7, number: 2, title: "Deadline", document: "The deadline is Friday.", created_at: "2026-10-29T10:00:00.000Z", user: { course_role: "staff" } }] });
    }) as unknown as typeof fetch;
    const result = await syncEd(db, "token", "us", fetcher);
    expect(result.synced).toBe(1);
    expect(db.listItems()).toHaveLength(1);
    db.close();
  });
});

describe("Moodle", () => {
  it("reads assessments from the authenticated batch response", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      if (String(input).endsWith("/my/")) return new Response('<html><script>{"sesskey":"abc"}</script></html>', { status: 200 });
      return jsonResponse([
        { error: false, data: { courses: [] } },
        {
          error: false,
          data: {
            events: [
              { id: 5, name: "Assignment 1", modname: "assign", timesort: 1760000000, course: { id: 2, shortname: "FIT1045" } },
            ],
          },
        },
      ]);
    }) as unknown as typeof fetch;

    const client = new MoodleClient("https://moodle.example.edu", "session", fetcher);
    const items = await client.pull();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Assignment 1");
    expect(items[0].course).toBe("FIT1045");
    expect(items[0].dueAt).toBe(new Date(1760000000 * 1000).toISOString());
    expect(items[0].deadlineKind).toBe("assign");
  });

  it("persists Moodle assessments through the sync function", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const fetcher = vi.fn(async (input: string | URL) => {
      if (String(input).endsWith("/my/")) return new Response('<html><script>{"sesskey":"abc"}</script></html>', { status: 200 });
      return jsonResponse([
        { error: false, data: { courses: [] } },
        { error: false, data: { events: [{ id: 5, name: "Assignment 1", modname: "assign", timesort: 1760000000, course: { id: 2, shortname: "FIT1045" } }] } },
      ]);
    }) as unknown as typeof fetch;
    const result = await syncMoodle(db, "https://moodle.example.edu", "session", fetcher);
    expect(result.synced).toBe(1);
    expect(db.listItems()[0].source).toBe("moodle");
    expect(db.listItems()[0].dueAt).toBe(new Date(1760000000 * 1000).toISOString());
    db.close();
  });
});

describe("Moodle forum", () => {
  const pages: Record<string, string> = {
    "/my/": '<a href="/course/view.php?id=2">FIT1045</a>',
    "/course/view.php?id=2": '<a href="/mod/forum/view.php?id=9">Week 1 questions</a>',
    "/mod/forum/view.php?id=9": '<a href="/mod/forum/discuss.php?d=4">Deadline clarification</a>',
    "/mod/forum/discuss.php?d=4": '<h1>Deadline clarification</h1><article class="forum-post-container" data-post-id="123"><div class="post-content">A staff member says the deadline is Friday.</div><time datetime="2026-10-29T10:00:00.000Z"></time></article>',
  };

  it("parses forum, discussion, and post pages", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const path = new URL(String(input)).pathname + (new URL(String(input)).search || "");
      return new Response(pages[path] ?? "<html></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const { MoodleForumClient } = await import("../sources/moodle-forum.js");
    const client = new MoodleForumClient("https://moodle.example.edu", "session", fetcher);
    const items = await client.pull();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Deadline clarification");
    expect(items[0].text).toContain("deadline is Friday");
    expect(items[0].kind).toBe("forum");
  });

  it("persists forum posts without treating them as assessment facts", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      return new Response(pages[url.pathname + (url.search || "")] ?? "<html></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const { syncMoodleForum } = await import("../sync/sources.js");
    const result = await syncMoodleForum(db, "https://moodle.example.edu", "session", fetcher);
    expect(result.synced).toBe(1);
    const item = db.listItems()[0];
    expect(item.source).toBe("moodle");
    expect(item.contentType).not.toBe("assessment_fact");
    db.close();
  });
});
