import { describe, expect, it, vi } from "vitest";
import { MoodleClient } from "../sources/moodle.js";

const DASHBOARD = `<html><script>{"sesskey":"abc123"}</script></html>`;

function assignmentPage(status: string) {
  return `<table class="submissionstatustable"><tr><td class="cell c0">Submission status</td><td class="cell c1 lastcol">${status}</td></tr></table>`;
}

function calendarPayload(events: unknown[]) {
  return JSON.stringify([{ data: { courses: [] } }, { data: { events } }]);
}

const event = {
  id: 7,
  name: "Assignment 3 Part B",
  timesort: Math.floor(Date.now() / 1000) + 86_400,
  course: { shortname: "ETW2001", id: 44 },
  modulename: "assign",
  purpose: "assessment",
  url: "https://learning.monash.edu/mod/assign/view.php?id=9",
};

function client(page: string) {
  const fetcher = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/lib/ajax/service.php")) return new Response(calendarPayload([event]), { status: 200 });
    if (url.includes("/mod/assign/view.php")) return new Response(assignmentPage(page), { status: 200 });
    return new Response(DASHBOARD, { status: 200 });
  }) as unknown as typeof fetch;
  return new MoodleClient("https://learning.monash.edu", "MoodleSession=a; MDL_SSP_SessID=b", fetcher);
}

describe("moodle submission detection", () => {
  it("marks a handed-in assignment as completed", async () => {
    const items = await client("Submitted for grading").pull();
    expect(items).toHaveLength(1);
    expect(items[0].completedAt).toBeTruthy();
  });

  it("marks a graded assignment as completed", async () => {
    const items = await client("Graded").pull();
    expect(items[0].completedAt).toBeTruthy();
  });

  it("leaves an unsubmitted assignment untouched", async () => {
    const items = await client("No submissions have been made yet").pull();
    expect(items[0].completedAt).toBeUndefined();
    expect(items[0].dueAt).toBeTruthy();
  });
});
