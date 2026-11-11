import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { MemorySecretStore } from "../secrets.js";
import { MoodleGradesClient, parseGradeReport } from "../sources/moodle-grades.js";
import { matchGradebookItem } from "../vendor/muster/assessment-match.js";

/** A Moodle user-report table, written to the shape Moodle 4 renders. */
const moodleGradeTable = `
<html><body>
<h1>FIT1047 Introduction to computer systems</h1>
<table class="user-grade table table-sm" id="user-grade">
  <caption>FIT1047</caption>
  <thead>
    <tr>
      <th class="header c0" scope="col">Grade item</th>
      <th class="header c1" scope="col">Weight</th>
      <th class="header c2" scope="col">Grade</th>
      <th class="header c3" scope="col">Range</th>
      <th class="header c4" scope="col">Percentage</th>
      <th class="header c5" scope="col">Feedback</th>
      <th class="header c6" scope="col">Contribution to course total</th>
      <th class="header c7" scope="col">Last modified</th>
    </tr>
  </thead>
  <tbody>
    <tr class="categoryitem">
      <td class="cell c0">Assessments</td>
      <td class="cell c1">100.00 %</td>
      <td class="cell c2">72.13 %</td>
      <td class="cell c3">0–100</td>
      <td class="cell c4">72.13 %</td>
      <td class="cell c5"></td>
      <td class="cell c6">72.13 %</td>
      <td class="cell c7">-</td>
    </tr>
    <tr class="item">
      <td class="cell c0"><a class="gradeitemheader" href="/mod/assign/view.php?id=1">Assignment 1</a></td>
      <td class="cell c1">20.00 %</td>
      <td class="cell c2">17.00</td>
      <td class="cell c3">0–20</td>
      <td class="cell c4">85.00 %</td>
      <td class="cell c5">Good work on the case study.</td>
      <td class="cell c6">17.00 %</td>
      <td class="cell c7">Monday, 3 March 2025, 10:21 AM</td>
    </tr>
    <tr class="item">
      <td class="cell c0"><span class="gradeitemheader">Quiz 1</span></td>
      <td class="cell c1">10.00 %</td>
      <td class="cell c2">-</td>
      <td class="cell c3">0–10</td>
      <td class="cell c4">-</td>
      <td class="cell c5"></td>
      <td class="cell c6">-</td>
      <td class="cell c7">-</td>
    </tr>
    <tr class="item">
      <td class="cell c0"><span class="gradeitemheader">Case study</span></td>
      <td class="cell c1">30.00 %</td>
      <td class="cell c2">43.50</td>
      <td class="cell c3">0–50</td>
      <td class="cell c4">87.00 %</td>
      <td class="cell c5"></td>
      <td class="cell c6">26.10 %</td>
      <td class="cell c7">-</td>
    </tr>
    <tr class="courseitem">
      <td class="cell c0">Course total</td>
      <td class="cell c1">-</td>
      <td class="cell c2">62.13</td>
      <td class="cell c3">0–100</td>
      <td class="cell c4">62.13 %</td>
      <td class="cell c5"></td>
      <td class="cell c6">-</td>
      <td class="cell c7">-</td>
    </tr>
  </tbody>
</table>
</body></html>`;

/** Same report with a different column order and missing columns. */
const chineseGradeTable = `
<html><body>
<table class="user-grade">
  <tbody>
    <tr>
      <th>反馈</th><th>项目</th><th>成绩</th><th>权重</th>
    </tr>
    <tr>
      <td>值得肯定</td><td><span class="gradeitemheader">课堂参与</span></td><td>8.5</td><td>10 %</td>
    </tr>
    <tr>
      <td></td><td><span class="gradeitemheader">期末考试</span></td><td>-</td><td></td>
    </tr>
  </tbody>
</table>
</body></html>`;

const noGradesPage = `<html><body><p class="alert">No grades available yet.</p></body></html>`;

describe("Moodle grade report parsing", () => {
  it("accepts only Muster grade-item headers, retaining pending quizzes and manual grades", () => {
    const report = parseGradeReport(`<a class="gradeitemheader" href="/mod/assign/view.php?id=99">Outside table</a>
      <table class="user-grade"><tr><th>Grade item</th><th>Grade</th><th>Range</th></tr>
      <tr><td><a href="/mod/assign/view.php?id=90">Practice assignment</a></td><td>100</td><td>0–100</td></tr>
      <tr><td>Weekly worksheet</td><td>10</td><td>0–10</td></tr>
      <tr><td><a class="gradeitemheader" href="/mod/quiz/view.php?id=1">Quiz</a></td><td>-</td><td>0–10</td></tr>
      <tr><td><span class="gradeitemheader">Participation</span></td><td>0</td><td>0–5</td></tr>
      <tr class="categoryitem"><td><span class="gradeitemheader">Category</span></td><td>50</td><td>0–100</td></tr>
      <tr class="courseitem"><td>Course total</td><td>50</td><td>0–100</td></tr></table>`, "101");
    expect(report?.items.map(({ name, url, grade }) => ({ name, url, grade }))).toEqual([
      { name: "Quiz", url: "/mod/quiz/view.php?id=1", grade: null },
      { name: "Participation", url: null, grade: 0 },
    ]);
    expect(report?.total).toEqual({ earned: 50, max: 100 });
  });

  it("deduplicates the same grade link while retaining distinct activities with identical names", () => {
    const report = parseGradeReport(`<table class="user-grade"><tr><th>Grade item</th><th>Grade</th></tr>
      <tr><td><a class="gradeitemheader" href="/mod/assign/view.php?id=1">Essay</a></td><td>8</td></tr>
      <tr><td><a class="gradeitemheader" href="/mod/assign/view.php?id=1">Essay</a></td><td>8</td></tr>
      <tr><td><a class="gradeitemheader" href="/mod/assign/view.php?id=2">Essay</a></td><td>-</td></tr></table>`, "101");
    expect(report?.items).toHaveLength(2);
    expect(new Set(report?.items.map((item) => item.id)).size).toBe(2);
  });

  it("keeps an empty readable Grades table distinct from an unavailable report", () => {
    const table = '<table class="user-grade"><tr><th>Grade item</th><th>Grade</th></tr><tr><td>Practice</td><td>100</td></tr></table>';
    expect(parseGradeReport(table, "101")).toEqual({ items: [], total: { earned: null, max: null } });
    expect(parseGradeReport(table.replace(' class="user-grade"', ''), "101")).toBeNull();
  });
  it("reads every column by header text and skips category rows", () => {
    const report = parseGradeReport(moodleGradeTable, "101");
    expect(report).not.toBeNull();
    if (!report) return;
    expect(report.items.map((item) => item.name)).toEqual(["Assignment 1", "Quiz 1", "Case study"]);

    const [assignment, quiz, caseStudy] = report.items;
    expect(assignment.grade).toBe(17);
    expect(assignment.gradeMax).toBe(20);
    expect(assignment.weight).toBe(20);
    expect(assignment.feedback).toBe("Good work on the case study.");
    expect(assignment.gradedAt).toBe("Monday, 3 March 2025, 10:21 AM");

    // An unreleased mark must stay null rather than becoming 0.
    expect(quiz.grade).toBeNull();
    expect(quiz.gradeMax).toBe(10);
    expect(quiz.feedback).toBe("");
    expect(quiz.gradedAt).toBeNull();

    expect(caseStudy.grade).toBe(43.5);
    expect(caseStudy.gradeMax).toBe(50);
    expect(report.total).toEqual({ earned: 62.13, max: 100 });

    const ids = new Set(report.items.map((item) => item.id));
    expect(ids.size).toBe(report.items.length);
  });

  it("locates columns by label, tolerating other orders and absent columns", () => {
    const report = parseGradeReport(chineseGradeTable, "202");
    expect(report).not.toBeNull();
    if (!report) return;
    expect(report.items).toHaveLength(2);
    expect(report.items[0]).toMatchObject({ name: "课堂参与", grade: 8.5, weight: 10, feedback: "值得肯定" });
    // No range column: the cap is unknown, not guessed.
    expect(report.items[0].gradeMax).toBeNull();
    expect(report.items[1]).toMatchObject({ name: "期末考试", grade: null, weight: null });
    expect(report.items[1].gradedAt).toBeNull();
    // Nothing is graded at all, so no total may be invented.
    expect(report.total).toEqual({ earned: null, max: null });
  });

  it("returns null when the page has no grade table", () => {
    expect(parseGradeReport(noGradesPage, "303")).toBeNull();
  });

  it("reads Moodle column classes despite category leader cells and excludes action-menu text", () => {
    const report = parseGradeReport(`<table><tr><th>Grade item</th><th>Weight</th><th>Grade</th><th>Range</th></tr>
      <tr><td class="leader" rowspan="2"></td><th class="column-itemname"><span class="gradeitemheader">Quiz</span></th><td class="column-weight">20%</td>
        <td class="column-grade"><div><div>8</div><div>Actions 99 Grade analysis</div></div></td><td class="column-range">0–10</td></tr>
      <tr><th class="column-itemname"><span class="gradeitemheader">Essay</span></th><td class="column-weight">80%</td><td class="column-grade">-</td><td class="column-range">0–100</td></tr></table>`, "1");
    expect(report?.items.map(({ name, grade, gradeMax, weight }) => ({ name, grade, gradeMax, weight }))).toEqual([
      { name: "Quiz", grade: 8, gradeMax: 10, weight: 20 }, { name: "Essay", grade: null, gradeMax: 100, weight: 80 },
    ]);
  });

  it.each([
    ["85%", "0–20", "-", 85, 100],
    ["17 / 20", "-", "-", 17, 20],
    ["11 out of 13", "-", "-", 11, 13],
    ["-", "-", "75%", 75, 100],
    ["0", "0 - 20", "0%", 0, 20],
  ])("keeps the score scale for %s", (grade, range, percent, expectedGrade, expectedMax) => {
    const report = parseGradeReport(`<table><tr><th>Grade item</th><th>Grade</th><th>Range</th><th>Percentage</th></tr>
      <tr><td><span class="gradeitemheader">Quiz</span></td><td>${grade}</td><td>${range}</td><td>${percent}</td></tr></table>`, "1");
    expect(report?.items[0]).toMatchObject({ grade: expectedGrade, gradeMax: expectedMax });
  });

  it("scales relative child weights by explicit category ancestry without counting subtotal rows", () => {
    const report = parseGradeReport(`<table><tr><th>Grade item</th><th>Weight</th><th>Grade</th><th>Range</th></tr>
      <tr class="categoryitem"><th id="cat_quiz" class="column-itemname">Quiz total</th><td>40%</td><td>8</td><td>0–10</td></tr>
      <tr><th class="column-itemname" headers="cat_quiz"><span class="gradeitemheader">Quiz A</span></th><td>50%</td><td>8</td><td>0–10</td></tr>
      <tr><th class="column-itemname" headers="cat_quiz"><span class="gradeitemheader">Quiz B</span></th><td>50%</td><td>-</td><td>0–10</td></tr>
      <tr class="categoryitem"><th id="cat_exam">Exam total</th><td>60%</td><td>-</td><td>0–100</td></tr>
      <tr><th headers="cat_exam"><span class="gradeitemheader">Exam</span></th><td>100%</td><td>-</td><td>0–100</td></tr></table>`, "1");
    expect(report?.items.map((item) => item.weight)).toEqual([20, 20, 60]);
    expect(report?.items).toHaveLength(3);
    expect(report?.total).toEqual({ earned: null, max: null });
  });

  it("leaves relative weights unknown when category ownership is absent", () => {
    const report = parseGradeReport(`<table><tr><th>Grade item</th><th>Weight</th><th>Grade</th><th>Range</th></tr>
      <tr class="categoryitem"><td>Category</td><td>40%</td><td>8</td><td>0–10</td></tr>
      <tr><td><span class="gradeitemheader">Quiz</span></td><td>100%</td><td>8</td><td>0–10</td></tr></table>`, "1");
    expect(report?.items[0].weight).toBeNull();
  });

  it("keeps total percentage on a 100-point scale even when range is a raw maximum", () => {
    const report = parseGradeReport(`<table><tr><th>Grade item</th><th>Weight</th><th>Grade</th><th>Range</th></tr>
      <tr><td><span class="gradeitemheader">Quiz</span></td><td>100%</td><td>17</td><td>0–20</td></tr>
      <tr class="courseitem"><td>Course total</td><td>-</td><td>85%</td><td>0–20</td></tr></table>`, "1");
    expect(report?.total).toEqual({ earned: 85, max: 100 });
  });

  it("retains a published total even when item details are hidden", () => {
    const report = parseGradeReport(`<table><tr><th>Grade item</th><th>Grade</th><th>Range</th></tr>
      <tr class="courseitem categoryitem"><td>Course total</td><td>75</td><td>0–100</td></tr></table>`, "1");
    expect(report).toEqual({ items: [], total: { earned: 75, max: 100 } });
  });
});

describe("Muster assessment-to-Grade matching", () => {
  const baseUrl = "https://moodle.example.invalid";
  const activity = { name: "  Essay (35%)  ", url: `${baseUrl}/mod/assign/view.php?id=1` };

  it("prefers the activity ID over a changed name and matches a unique manual grade name", () => {
    const linked = { name: "Renamed assessment", url: "/mod/assign/view.php?id=1" };
    expect(matchGradebookItem(activity, [linked], [activity], baseUrl)).toBe(linked);
    const manual = { name: "essay", url: null };
    expect(matchGradebookItem(activity, [manual], [activity], baseUrl)).toBe(manual);
  });

  it("rejects conflicting IDs, duplicate names and foreign origins", () => {
    const other = { name: "essay", url: "/mod/assign/view.php?id=2" };
    expect(matchGradebookItem(activity, [other], [activity], baseUrl)).toBeNull();
    const manual = { name: "essay", url: null };
    expect(matchGradebookItem(activity, [manual], [activity, { ...activity, url: other.url }], baseUrl)).toBeNull();
    expect(matchGradebookItem(activity, [manual, manual], [activity], baseUrl)).toBeNull();
    expect(matchGradebookItem(activity, [{ name: "essay", url: "https://foreign.example.invalid/mod/assign/view.php?id=1" }], [activity], baseUrl)).toBeNull();
  });
});

describe("MoodleGradesClient", () => {
  it("joins Assessment category metadata to Grades by activity ID without inventing other scores", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/my/") return new Response('<script>{"sesskey":"fixture"}</script>');
      if (url.pathname === "/lib/ajax/service.php") return Response.json([{ error: false, data: { courses: [{ id: 101, shortname: "UNIT101", fullname: "Fixture unit" }] } }]);
      if (url.pathname === "/grade/report/user/index.php") return new Response(moodleGradeTable);
      if (url.pathname === "/course/view.php" && !url.searchParams.has("section")) return new Response('<a title="ASSESSMENTS" href="/course/view.php?id=101&amp;section=9">Assessments</a>');
      if (url.searchParams.get("section") === "9") return new Response(`<div class="assessment-item summary-view-dropdown-header"><span class="dropdown-name-text" data-section="57">1. Written</span><span class="weight-content">100%</span></div>
        <div id="assessment-section-activity-list-57"><div class="assessment-item"><a class="name-content-text" href="/mod/assign/view.php?id=1">Renamed Assignment</a></div>
        <div class="assessment-item"><a class="name-content-text" href="/mod/assign/view.php?id=999">Not in Grades</a></div></div>`);
      throw new Error("Unexpected fixture URL");
    };
    const result = await new MoodleGradesClient("https://moodle.example.invalid", "MoodleSession=fixture", fetcher).pull();
    expect(result[0].items).toHaveLength(3);
    const children = result[0].assessmentStructure?.filter((row) => !row.isCategory);
    expect(children?.map((row) => row.gradeItemId)).toEqual([result[0].items[0].id, null]);
    expect(children?.map((row) => row.categoryWeight)).toEqual([100, 100]);
    expect(result[0].assessmentWarning).toBeNull();
  });

  it("keeps readable Grades when the separate assessment structure is unavailable", async () => {
    const original = gradebookFetcher();
    const fetcher: typeof fetch = async (input, init) => String(input).includes('/course/view.php')
      ? new Response("Fixture unavailable", { status: 503 }) : original(input, init);
    const result = await new MoodleGradesClient("https://learning.monash.edu", "MoodleSession=fixture", fetcher).pull();
    expect(result[0].items).toHaveLength(3);
    expect(result[0].assessmentStructure).toEqual([]);
    expect(result[0].assessmentWarning).toContain("仍显示 Grades 原始成绩");
  });

  it("skips Muster support hubs before fetching Grades, retaining academic and thesis courses", async () => {
    const names = ["IT Student Portal", "MUM Academic Success", "MUM Graduate Success", "MUM School of IT - General Student Hub",
      "FIT5201 Machine learning - S2 2026", "Master and Honours Thesis - S1 2026 - S2 2026"];
    const gradeReads: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/my/") return new Response('<script>{"sesskey":"fixture"}</script>');
      if (url.pathname === "/lib/ajax/service.php") return Response.json([{ error: false, data: {
        courses: names.map((name, index) => ({ id: index + 101, shortname: name, fullname: name })),
      } }]);
      if (url.pathname === "/grade/report/user/index.php") {
        gradeReads.push(url.searchParams.get("id")!);
        return new Response(moodleGradeTable);
      }
      throw new Error("Unexpected fixture URL");
    };
    const result = await new MoodleGradesClient("https://moodle.example.invalid", "MoodleSession=fixture", fetcher).pullDetailed();
    expect(gradeReads.sort()).toEqual(["105", "106"]);
    expect(result.courses.map((course) => course.courseId)).toEqual(["105", "106"]);
    expect(result.failedCourseIds).toEqual([]);
  });

  it.each([
    [new DOMException("Read timed out", "TimeoutError"), "读取超时"],
    [new TypeError("fetch failed: https://fixture.invalid/?token=must-not-leak"), "网络请求失败"],
    [new Error("unexpected private page body"), "读取失败"],
  ])("retains safe per-course failure reasons without discarding successful courses", async (error, reason) => {
    const client = new MoodleGradesClient("https://learning.monash.edu", "MoodleSession=fixture", gradebookFetcher());
    vi.spyOn(client, "scrapeCourse").mockImplementation(async (id) => {
      if (id === 101) throw error;
      return { items: [], total: { earned: null, max: null } };
    });
    const result = await client.pullDetailed();
    expect(result.courses.map((course) => course.courseId)).toEqual(["102"]);
    expect(result.failureReasons).toEqual({ "101": reason });
    expect(JSON.stringify(result.failureReasons)).not.toContain("must-not-leak");
  });

  it("fails instead of reporting an empty gradebook when the session died", async () => {
    // Moodle answers a dead session with a login page, sometimes with HTTP 200.
    const fetcher = vi.fn(async () => new Response("<html><form>Log in</form></html>", { status: 200 })) as unknown as typeof fetch;
    const client = new MoodleGradesClient("https://learning.monash.edu", "MoodleSession=stale", fetcher);
    const outcome = await client.pull().catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Error);
  });

  it("does not classify a Moodle outage as an expired session", async () => {
    const client = new MoodleGradesClient("https://moodle.example.invalid", "MoodleSession=fixture", async () => new Response("Unavailable", { status: 503 }));
    await expect(client.pull()).rejects.toMatchObject({ code: "grades_failed" });
  });
});

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

function gradebookFetcher(html = moodleGradeTable) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/lib/ajax/service.php")) {
      return new Response(JSON.stringify([{
        error: false,
        data: { courses: [
          { id: 101, shortname: "FIT1047_MUM_S1_2025", fullname: "FIT1047 Introduction to computer systems" },
          { id: 102, shortname: "FIT1045_MUM_S1_2025", fullname: "FIT1045 Algorithms" },
        ] },
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/grade/report/user/index.php?id=101")) return new Response(html, { status: 200 });
    if (url.includes("/grade/report/user/index.php?id=102")) return new Response(noGradesPage, { status: 200 });
    // /my/ dashboard: needs a sesskey for the AJAX course list.
    return new Response(`<html><script>{"sesskey":"abc123"}</script></html>`, { status: 200 });
  }) as unknown as typeof fetch;
}

describe("GET /api/moodle/grades", () => {
  it("409s when no Moodle session is stored", async () => {
    app = buildApp({ dbPath: ":memory:", seed: true, secretStore: new MemorySecretStore() });
    const response = await app.inject({ method: "GET", url: "/api/moodle/grades" });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("not_connected");
  });

  it("returns parsed courses and skips courses without a grade table", async () => {
    const secretStore = new MemorySecretStore();
    await secretStore.set("moodle-credentials", JSON.stringify({ baseUrl: "https://learning.monash.edu", cookie: "MoodleSession=abc" }));
    app = buildApp({ dbPath: ":memory:", seed: true, secretStore, fetcher: gradebookFetcher() });
    const response = await app.inject({ method: "GET", url: "/api/moodle/grades" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].courseId).toBe("101");
    expect(body.courses[0].courseName).toBe("FIT1047 Introduction to computer systems");
    expect(body.courses[0].items).toHaveLength(3);
    expect(body.courses[0].total).toEqual({ earned: 62.13, max: 100 });
  });

  it("409s when Moodle bounces the session to a login page", async () => {
    const secretStore = new MemorySecretStore();
    await secretStore.set("moodle-credentials", JSON.stringify({ baseUrl: "https://learning.monash.edu", session: "abc" }));
    const fetcher: typeof fetch = async (input) => String(input).includes("/login/")
      ? new Response('<form id="login"><input type="password"></form>')
      : new Response("", { status: 303, headers: { location: "/login/index.php" } });
    app = buildApp({ dbPath: ":memory:", seed: true, secretStore, fetcher });
    const response = await app.inject({ method: "GET", url: "/api/moodle/grades" });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("not_connected");
  });

  it("502s when every grade page fails", async () => {
    const secretStore = new MemorySecretStore();
    await secretStore.set("moodle-credentials", JSON.stringify({ baseUrl: "https://learning.monash.edu", cookie: "MoodleSession=abc" }));
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/lib/ajax/service.php")) {
        return new Response(JSON.stringify([{ error: false, data: { courses: [{ id: 101, shortname: "FIT1047", fullname: "FIT1047" }] } }]), { status: 200 });
      }
      if (url.includes("/grade/report/user/")) return new Response("broken", { status: 500 });
      return new Response(`<html><script>{"sesskey":"abc123"}</script></html>`, { status: 200 });
    }) as unknown as typeof fetch;
    app = buildApp({ dbPath: ":memory:", seed: true, secretStore, fetcher });
    const response = await app.inject({ method: "GET", url: "/api/moodle/grades" });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("moodle_grades_failed");
  });
});
