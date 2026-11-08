import { describe, expect, it, vi } from "vitest";
import { MoodleClient } from "../sources/moodle.js";

const DASHBOARD = `<html><script>{"sesskey":"abc123"}</script></html>`;

function assignmentPage(status: string) {
  // Shape copied from a real Monash Moodle 4 page: the label is a th inside the
  // same row, and the heading above it repeats the words "Submission status".
  return `<div class="submissionstatustable"><h3>Submission status</h3>
    <table class="generaltable"><caption class="accesshide">Submission status</caption><tbody>
    <tr><th class="cell c0" scope="row">Attempt number</th><td class="cell c1 lastcol">This is attempt 1.</td></tr>
    <tr><th class="cell c0" scope="row">Submission status</th><td class="submissionstatussubmitted cell c1 lastcol">${status}</td></tr>
    </tbody></table></div>`;
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
