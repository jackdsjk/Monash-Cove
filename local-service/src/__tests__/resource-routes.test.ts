import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import type { CoveDatabase } from "../db.js";
import { MemorySecretStore } from "../secrets.js";

let app: FastifyInstance | null = null;
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "cove-resource-route-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", directory);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked"); }));
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
      if (failCourse && url.searchParams.get("id") === "2") return new Response("fixture error", { status: 500 });
      if (url.pathname === "/grade/report/user/index.php") return new Response(`<table class="user-grade"><tbody>
        <tr><th>Grade item</th><th>Grade</th><th>Range</th></tr><tr class="item"><td>Fixture</td><td>${grade}</td><td>0–10</td></tr></tbody></table>`);
      throw new Error("Unexpected fixture URL");
    }) as unknown as typeof fetch;
    app = buildApp({ dbPath: ":memory:", seed: false, secretStore: secrets, fetcher });
    const [first, concurrent] = await Promise.all([app.inject("/api/moodle/grades"), app.inject("/api/moodle/grades")]);
    expect(first.statusCode).toBe(200); expect(concurrent.statusCode).toBe(200);
    expect(calls).toHaveLength(5);
    const again = await app.inject("/api/moodle/grades");
    expect(again.json().cache.stale).toBe(false); expect(calls).toHaveLength(5);
    grade = "9"; failCourse = true;
    const partial = await app.inject("/api/moodle/grades?refresh=1");
    const body = partial.json();
    expect(body.courses.map((course: { courseId: string; items: { grade: number }[] }) => [course.courseId, course.items[0].grade])).toEqual([["1", 9], ["2", 8]]);
    expect(body.cache.error).toContain("课程 2");
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
    expect(calls.length - beforeScopedRead).toBe(4);
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
