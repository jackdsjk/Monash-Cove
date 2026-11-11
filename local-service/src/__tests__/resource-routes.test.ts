import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import type { CoveDatabase } from "../db.js";
import { MemorySecretStore } from "../secrets.js";
import type { FullSyncJob } from "../sync/jobs.js";

let app: FastifyInstance | null = null;
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "cove-resource-route-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", directory);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked"); }));
});

describe("single source sync HTTP results", () => {
  it("exports only Grades-confirmed Moodle work, sharing the grade cache and preserving course boundaries", async () => {
    const secrets = new MemorySecretStore();
    let assignmentUrl = "";
    let offline = false;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (offline) throw new Error("Fixture offline");
      const url = new URL(String(input));
      if (url.pathname === "/my/") return new Response('<script>{"sesskey":"fixture"}</script>');
      if (url.pathname === "/lib/ajax/service.php") return Response.json([{ error: false, data: { courses: [
        { id: 101, shortname: "TEST101_S2_2026", fullname: "Fixture 101" },
        { id: 102, shortname: "TEST101_S1_2026", fullname: "Fixture 102" },
      ] } }]);
      if (url.pathname === "/course/view.php") return new Response("<html></html>");
      if (url.pathname === "/grade/report/user/index.php") return new Response(`<table class="user-grade">
        <tr><th>Grade item</th><th>Grade</th><th>Range</th></tr>
        ${url.searchParams.get("id") === "101" ? `<tr><td><a class="gradeitemheader" href="${assignmentUrl}">Renamed assessment</a></td><td>-</td><td>0–100</td></tr>
          <tr><td><a class="gradeitemheader" href="/mod/quiz/view.php?id=4">Graded quiz</a></td><td>0</td><td>0–10</td></tr>` : ""}
        <tr><td>Other semester</td><td>100</td><td>0–100</td></tr></table>`);
      throw new Error(`Unexpected fixture URL: ${url.pathname}`);
    });
    app = buildApp({ dbPath: ":memory:", seed: true, secretStore: secrets, fetcher });
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    const storedMoodle = db.listItems({ source: "moodle" })[0];
    const baseUrl = "https://moodle.example.invalid";
    assignmentUrl = `${baseUrl}/mod/assign/view.php?id=1`;
    db.db.prepare("UPDATE items SET url = ? WHERE id = ?").run(assignmentUrl, storedMoodle.id);
    await secrets.set("moodle-credentials", JSON.stringify({ baseUrl, session: "fixture" }));
    const base = { sectionNumber: 1, sectionTitle: "Week 1", module: "assign", text: "Fixture Moodle instructions", updatedAt: new Date().toISOString() };
    db.replaceMoodleContent("101", [
      { ...base, id: "assignment-101", courseId: "101", courseName: "TEST101_S2_2026", title: "Moodle assignment", url: assignmentUrl },
      { ...base, id: "practice", courseId: "101", courseName: "TEST101_S2_2026", title: "Practice assignment", url: `${baseUrl}/mod/assign/view.php?id=90` },
      { ...base, id: "quiz-101", courseId: "101", courseName: "TEST101_S2_2026", module: "quiz", title: "Graded quiz", url: `${baseUrl}/mod/quiz/view.php?id=4` },
      { ...base, id: "resource-101", courseId: "101", courseName: "TEST101_S2_2026", module: "resource", title: "Weekly file", url: `${baseUrl}/mod/resource/view.php?id=2` },
    ]);
    db.replaceMoodleContent("102", [
      { ...base, id: "assignment-102", courseId: "102", courseName: "TEST101_S1_2026", title: "Other semester", url: assignmentUrl },
    ]);
    const [response, gradeResponse] = await Promise.all([app.inject("/api/pack"), app.inject("/api/moodle/grades")]);
    expect(response.statusCode).toBe(200);
    expect(gradeResponse.statusCode).toBe(200);
    const body = response.json();
    expect(body.assignments.map((item: { id: string }) => item.id).sort()).toEqual(["assignment-101", "quiz-101"]);
    expect(body.verificationWarning).toBeNull();
    expect(body).not.toHaveProperty("postsPerRole");
    for (const assignment of body.assignments) {
      expect(assignment).not.toHaveProperty("posts");
      expect(assignment.gradeItemId).toBeTruthy();
      expect(assignment.text).toBe("Fixture Moodle instructions");
    }
    expect(body.assignments.find((item: { id: string }) => item.id === "assignment-101").dueAt).toBe(storedMoodle.dueAt);
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/grade/report/user/")).length).toBe(2);
    const reads = fetcher.mock.calls.length;
    expect((await app.inject("/api/pack?courseId=101")).json().assignments).toHaveLength(2);
    expect((await app.inject("/api/pack?courseId=102")).json().assignments).toEqual([]);
    expect((await app.inject("/api/pack?courseId=unknown")).json().assignments).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(reads);
    offline = true;
    const stale = await app.inject("/api/moodle/grades?refresh=1");
    expect(stale.json().cache.error).toBeTruthy();
    const cached = (await app.inject("/api/pack")).json();
    expect(cached.assignments).toHaveLength(2);
    expect(cached.verificationWarning).toContain("上次成绩册");
    // A different account must not reuse the previous account's confirmation.
    await secrets.set("moodle-credentials", JSON.stringify({ baseUrl, session: "different-fixture-account" }));
    const changed = (await app.inject("/api/pack")).json();
    expect(changed.assignments).toEqual([]);
    expect(changed.verificationWarning).toContain("暂时无法读取 Grades");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not infer assessment eligibility from local content when Moodle is disconnected", async () => {
    app = buildApp({ dbPath: ":memory:", secretStore: new MemorySecretStore() });
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    db.replaceMoodleContent("101", [{ id: "practice", courseId: "101", courseName: "Fixture", sectionNumber: 1,
      sectionTitle: "Week 1", module: "assign", text: "Practice instructions", title: "Assignment 1", url: "https://moodle.example.invalid/mod/assign/view.php?id=1", updatedAt: new Date().toISOString() }]);
    const response = (await app.inject("/api/pack")).json();
    expect(response.assignments).toEqual([]);
    expect(response.verificationWarning).toContain("尚未连接 Moodle");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps the previous successful sync time after an upstream failure", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("ed-credentials", JSON.stringify({ token: "fixture-only", region: "us" }));
    const fetcher = vi.fn(async () => new Response("Fixture unavailable", { status: 503 }));
    app = buildApp({ dbPath: ":memory:", secretStore: secrets, fetcher });
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    const previous = "2026-11-01T00:00:00.000Z";
    db.setSourceStatus("ed", "connected", previous, null);

    const response = await app.inject({ method: "POST", url: "/api/sync", payload: { source: "ed" } });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.message).toContain("503");
    const brief = (await app.inject("/api/brief")).json();
    expect(brief.sources.find((source: { id: string }) => source.id === "ed")).toMatchObject({
      status: "error", lastSyncAt: previous, lastError: expect.stringContaining("503"),
    });
    expect(fetcher).toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("full sync HTTP results", () => {
  const moodleRaw = JSON.stringify({ baseUrl: "https://moodle.example.invalid", session: "fixture-only" });

  function moodleFetcher() {
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/my/") return new Response('<html><script>{"sesskey":"fixture"}</script></html>');
      if (url.pathname === "/lib/ajax/service.php") {
        const courses = { error: false, data: { courses: [] } };
        return Response.json(url.searchParams.get("info")?.includes("core_calendar_")
          ? [courses, { error: false, data: { events: [] } }] : [courses]);
      }
      throw new Error(`Unexpected fixture URL: ${url.pathname}`);
    });
  }

  async function finishSync(): Promise<{ fullSyncCompleted: boolean; job: FullSyncJob }> {
    const started = await app!.inject({ method: "POST", url: "/api/sync/full" });
    expect(started.statusCode).toBe(202);
    let result: { fullSyncCompleted: boolean; job: FullSyncJob };
    await vi.waitFor(async () => {
      result = (await app!.inject("/api/sync/status")).json();
      expect(result.job.status).not.toBe("running");
    });
    return result!;
  }

  it("syncs only configured sources and completes with Moodle alone", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("moodle-credentials", moodleRaw);
    const fetcher = moodleFetcher();
    app = buildApp({ dbPath: ":memory:", secretStore: secrets, fetcher });
    const result = await finishSync();
    expect(result.fullSyncCompleted).toBe(true);
    expect(result.job.status).toBe("done");
    expect(Object.fromEntries(Object.entries(result.job.sources).map(([source, progress]) => [source, progress.status])))
      .toEqual({ gmail: "skipped", ed: "skipped", moodle: "done", ontrack: "skipped" });
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect((await app.inject("/api/setup/status")).json().setupRequired).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports all sources skipped without marking an empty run as a completed sync", async () => {
    app = buildApp({ dbPath: ":memory:", secretStore: new MemorySecretStore() });
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    db.setSourceStatus("ed", "error", null, "Previous source error");
    const result = await finishSync();
    expect(result.fullSyncCompleted).toBe(false);
    expect(result.job.status).toBe("skipped");
    expect(Object.values(result.job.sources).every((source) => source.status === "skipped")).toBe(true);
    expect(db.getSetting("full_sync_completed_at")).toBeNull();
    expect(db.listSources().find((source) => source.id === "ed")?.lastError).toBe("Previous source error");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("backfills old OnTrack feedback through the actual full sync route with other sources disconnected", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("ontrack-credentials", JSON.stringify({ baseUrl: "https://ontrack.example.invalid/api", username: "fixture", refreshToken: "fixture-only" }));
    const requests: string[] = [];
    let taskStatus = "working_on_it";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input)); requests.push(url.pathname);
      if (url.pathname.endsWith("/auth/access-token")) return Response.json({ auth_token: "fixture-token", auth_token_expiry: new Date(Date.now() + 600_000).toISOString(), user: { id: 1, username: "fixture" } });
      if (url.pathname === "/api/projects") return Response.json([{ id: 1, unit: { id: 7, code: "UNIT", name: "Fixture" } }]);
      if (url.pathname === "/api/projects/1") return Response.json({ unit_id: 7, tasks: [{ id: 10, task_definition_id: 20, status: taskStatus }] });
      if (url.pathname === "/api/units/7") return Response.json({ task_definitions: [{ id: 20, abbreviation: "1.1P", name: "Fixture task" }] });
      if (url.pathname.endsWith("/comments")) return Response.json([{ id: 99, type: "text", comment: "Old fixture feedback", created_at: "2020-01-01T00:00:00.000Z", author: { id: 2, first_name: "Fixture" } }]);
      throw new Error(`Unexpected fixture URL: ${url.pathname}`);
    }));
    app = buildApp({ dbPath: ":memory:", secretStore: secrets });
    const cachedTasks = await app.inject("/api/ontrack/tasks");
    expect(cachedTasks.json().tasks[0].status).toBe("working_on_it");
    taskStatus = "complete";
    const result = await finishSync();
    expect((await app.inject("/api/ontrack/tasks")).json().tasks[0].status).toBe("complete");
    expect(result.fullSyncCompleted).toBe(true);
    expect(Object.fromEntries(Object.entries(result.job.sources).map(([source, progress]) => [source, progress.status])))
      .toEqual({ gmail: "skipped", ed: "skipped", moodle: "skipped", ontrack: "done" });
    expect(result.job.sources.ontrack).toMatchObject({ processed: 1, total: 1 });
    expect(result.job.sources.ontrack.message).toContain("1 条历史反馈");
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    expect(db.getItem("ontrack:feedback:99")?.text).toBe("Old fixture feedback");
    expect(requests.filter((path) => path.endsWith("/comments"))).toHaveLength(1);
    await finishSync();
    expect(requests.filter((path) => path.endsWith("/comments"))).toHaveLength(2);
    expect(db.listItems()).toHaveLength(2);
  });

  it("reports configured OnTrack failures and preserves the last successful sync time", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("ontrack-credentials", JSON.stringify({ baseUrl: "https://ontrack.example.invalid/api", username: "fixture", refreshToken: "fixture-only" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Fixture unavailable", { status: 503 })));
    app = buildApp({ dbPath: ":memory:", secretStore: secrets });
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    const previous = "2026-11-01T00:00:00.000Z";
    db.setSourceStatus("ontrack", "connected", previous, null);
    const result = await finishSync();
    expect(result.job.status).toBe("error");
    expect(result.job.sources.ontrack.status).toBe("error");
    expect(result.fullSyncCompleted).toBe(false);
    expect(db.getSetting("full_sync_completed_at")).toBeNull();
    expect(db.listSources().find((source) => source.id === "ontrack")).toMatchObject({ status: "error", lastSyncAt: previous });
  });

  it("retains failed source progress and last success while continuing other configured sources", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("gmail-oauth-tokens", JSON.stringify({ access_token: "expired-fixture", expires_at: 0 }));
    await secrets.set("ed-credentials", JSON.stringify({ token: "invalid-fixture", region: "us" }));
    await secrets.set("moodle-credentials", moodleRaw);
    const upstream = moodleFetcher();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (!String(input).startsWith("https://moodle.example.invalid/")) throw new Error("Fixture authentication rejected");
      return upstream(input);
    });
    app = buildApp({ dbPath: ":memory:", secretStore: secrets, fetcher });
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    const previous = "2026-11-01T00:00:00.000Z";
    db.setSourceStatus("ed", "connected", previous, null);
    const result = await finishSync();
    expect(result.fullSyncCompleted).toBe(false);
    expect(result.job.status).toBe("error");
    expect(result.job.sources.gmail).toMatchObject({ status: "error", message: expect.stringContaining("expired") });
    expect(result.job.sources.ed).toMatchObject({ status: "error", message: "Fixture authentication rejected" });
    expect(result.job.sources.moodle.status).toBe("done");
    expect(result.job.message).toContain("ed: Fixture authentication rejected");
    expect(db.listSources().find((source) => source.id === "ed")).toMatchObject({ status: "error", lastSyncAt: previous });
    expect(db.getSetting("moodle_full_synced_at")).toBeTruthy();
    expect(db.getSetting("full_sync_completed_at")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
afterEach(async () => {
  await app?.close(); app = null;
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("cached resource HTTP routes", () => {
  it("shares grade requests, preserves a failed course, and clears snapshots on disconnect", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("moodle-credentials", JSON.stringify({ baseUrl: "https://moodle.example.invalid", session: "fixture" }));
    let failCourse = false;
    let grade = "8";
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (url.pathname === "/my/") return new Response('<html><script>{"sesskey":"fixture"}</script></html>');
      if (url.pathname === "/lib/ajax/service.php") return Response.json([{ error: false, data: { courses: [
        { id: 1, shortname: "UNIT1", fullname: "Fixture course 1" }, { id: 2, shortname: "UNIT2", fullname: "Fixture course 2" },
      ] } }]);
      if (url.pathname === "/course/view.php") return new Response("<html></html>");
      if (failCourse && url.searchParams.get("id") === "2") return new Response("fixture error", { status: 500 });
      if (url.pathname === "/grade/report/user/index.php") return new Response(`<table class="user-grade"><tbody>
        <tr><th>Grade item</th><th>Grade</th><th>Range</th></tr><tr class="item"><td><span class="gradeitemheader">Fixture</span></td><td>${grade}</td><td>0–10</td></tr></tbody></table>`);
      throw new Error("Unexpected fixture URL");
    }) as unknown as typeof fetch;
    app = buildApp({ dbPath: ":memory:", seed: false, secretStore: secrets, fetcher });
    const [first, concurrent] = await Promise.all([app.inject("/api/moodle/grades"), app.inject("/api/moodle/grades")]);
    expect(first.statusCode).toBe(200); expect(concurrent.statusCode).toBe(200);
    expect(calls).toHaveLength(10);
    const again = await app.inject("/api/moodle/grades");
    expect(again.json().cache.stale).toBe(false); expect(calls).toHaveLength(10);
    grade = "9"; failCourse = true;
    const partial = await app.inject("/api/moodle/grades?refresh=1");
    const body = partial.json();
    expect(body.courses.map((course: { courseId: string; items: { grade: number }[] }) => [course.courseId, course.items[0].grade])).toEqual([["1", 9], ["2", 8]]);
    expect(body.cache.error).toContain("课程 2");
    expect(body.cache.error).toContain("HTTP 500");
    expect(body.cache.error).not.toContain("保留上次");
    expect(body.cache.failedIds).toEqual(["2"]);
    expect(body.cache.coverage["2"]).toBe(first.json().cache.coverage["2"]);
    expect(body.cache.stale).toBe(true);
    expect((await app.inject({ method: "PATCH", url: "/api/moodle/course-preferences", payload: { activeSemester: "guessed", hiddenCourseIds: [], pinnedCourseIds: [] } })).statusCode).toBe(400);
    const preferences = { activeSemester: null, hiddenCourseIds: ["2"], pinnedCourseIds: [] };
    expect((await app.inject({ method: "PATCH", url: "/api/moodle/course-preferences", payload: preferences })).json()).toEqual(preferences);
    expect((await app.inject("/api/moodle/course-preferences")).json()).toEqual(preferences);
    const beforeScopedRead = calls.length;
    // Range changes must not serve the still-fresh snapshot for the old range.
    const scoped = await app.inject("/api/moodle/grades");
    expect(scoped.json().courses.map((course: { courseId: string }) => course.courseId)).toEqual(["1"]);
    expect(calls.length - beforeScopedRead).toBe(7);
    await secrets.set("moodle-credentials", JSON.stringify({ baseUrl: "https://moodle.example.invalid", session: "fixture-new-account" }));
    expect((await app.inject("/api/moodle/course-preferences")).json()).toEqual({ activeSemester: null, hiddenCourseIds: [], pinnedCourseIds: [] });
    const disconnected = await app.inject({ method: "POST", url: "/api/sources/moodle/disconnect" });
    expect(disconnected.statusCode).toBe(200);
    expect((await app.inject("/api/moodle/grades")).statusCode).toBe(409);
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    expect(db.db.prepare("SELECT COUNT(*) AS n FROM resource_snapshots").get()).toMatchObject({ n: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("uses the same OnTrack snapshot for overview and task consumers", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("ontrack-credentials", JSON.stringify({ baseUrl: "https://ontrack.example.invalid/api", username: "fixture", refreshToken: "fixture-only" }));
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input)); requests.push(url.pathname);
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (url.pathname.endsWith("/auth/access-token")) return Response.json({ auth_token: "fixture-token", auth_token_expiry: new Date(Date.now() + 600_000).toISOString(), user: { id: 1, username: "fixture" } });
      if (url.pathname === "/api/projects") return Response.json([{ id: 1, unit: { id: 7, code: "UNIT", name: "Fixture" } }]);
      if (url.pathname === "/api/projects/1") return Response.json({ unit_id: 7, tasks: [{ id: 10, task_definition_id: 20, status: "working_on_it" }] });
      if (url.pathname === "/api/units/7") return Response.json({ task_definitions: [{ id: 20, abbreviation: "1.1P", name: "Fixture task" }] });
      throw new Error("Unexpected fixture URL");
    }));
    app = buildApp({ dbPath: ":memory:", seed: false, secretStore: secrets });
    const [overview, tasks] = await Promise.all([app.inject("/api/ontrack/overview"), app.inject("/api/ontrack/tasks")]);
    expect(overview.statusCode).toBe(200); expect(tasks.statusCode).toBe(200);
    expect(tasks.json().tasks[0].unitCode).toBe("UNIT");
    expect(requests.filter((path) => path === "/api/projects")).toHaveLength(1);
    expect(requests.filter((path) => path === "/api/projects/1")).toHaveLength(1);
    expect(requests.filter((path) => path.endsWith("/auth/access-token"))).toHaveLength(1);
    await app.inject("/api/ontrack/tasks"); expect(requests).toHaveLength(4);
  });
});
