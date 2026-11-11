import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import type { CoveDatabase } from "../db.js";
import { moodleCredentialIdentity } from "../moodle-session.js";
import { MemorySecretStore } from "../secrets.js";

const baseUrl = "https://moodle.example.invalid";
const dashboard = '<html><script>M.cfg = {"sesskey":"fixture-only"};</script><a href="/login/logout.php">Log out</a></html>';
let directory: string;
let app: FastifyInstance | null;
let secrets: MemorySecretStore;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "cove-moodle-transport-routes-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", join(directory, "empty-ontrack"));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked in isolated route regression"); }));
  app = null;
  secrets = new MemorySecretStore();
});
afterEach(async () => {
  await app?.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

function createApp(fetcher: typeof fetch): FastifyInstance {
  return buildApp({ dbPath: join(directory, "fixture.sqlite"), secretStore: secrets, fetcher, autoSync: false, moodleSessionCheck: false });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Moodle session transport through public routes", () => {
  it("keeps refreshed cookies, cache identity and course preferences across requests and restart", async () => {
    const initial = JSON.stringify({ baseUrl, cookie: "MoodleSession=initial", userAgent: "Fixture captured Chrome" });
    await secrets.set("moodle-credentials", initial);
    const sent: Array<{ path: string; cookie: string; userAgent: string }> = [];
    const fetcher: typeof fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const headers = new Headers(init?.headers);
      sent.push({ path: url.pathname, cookie: headers.get("cookie") ?? "", userAgent: headers.get("user-agent") ?? "" });
      if (url.pathname === "/my/") return new Response(dashboard, { headers: { "set-cookie": "MoodleSession=rotated; Path=/; HttpOnly; Secure" } });
      if (url.pathname === "/lib/ajax/service.php") return Response.json([{ data: { courses: [{ id: 5, shortname: "TEST1001", fullname: "Fixture course" }] } }]);
      if (url.pathname.startsWith("/pluginfile.php")) return new Response("fixture image", { headers: { "content-type": "image/png" } });
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    });
    app = createApp(fetcher);
    const saved = await app.inject({ method: "PATCH", url: "/api/moodle/course-preferences", payload: { activeSemester: "2026-S2", hiddenCourseIds: ["8"], pinnedCourseIds: ["5"] } });
    expect(saved.statusCode).toBe(200);
    const courses = await app.inject("/api/moodle/courses");
    expect(courses.statusCode).toBe(200);
    expect(courses.json().cache.identity).toBe(moodleCredentialIdentity(initial));
    expect(sent).toEqual([
      { path: "/my/", cookie: "MoodleSession=initial", userAgent: "Fixture captured Chrome" },
      { path: "/lib/ajax/service.php", cookie: "MoodleSession=rotated", userAgent: "Fixture captured Chrome" },
    ]);
    expect(await secrets.get("moodle-credentials")).toContain("rotated");
    expect(moodleCredentialIdentity((await secrets.get("moodle-credentials"))!)).toBe(moodleCredentialIdentity(initial));
    expect((await app.inject("/api/moodle/course-preferences")).json()).toEqual(saved.json());
    await app.close();
    app = createApp(fetcher);
    const cached = await app.inject("/api/moodle/courses");
    expect(cached.statusCode).toBe(200);
    expect(sent).toHaveLength(2);
    expect((await app.inject("/api/moodle/course-preferences")).json()).toEqual(saved.json());
    expect((await app.inject(`/api/moodle/asset?url=${encodeURIComponent(`${baseUrl}/pluginfile.php/5/image.png`)}`)).statusCode).toBe(200);
    expect(sent.at(-1)?.cookie).toBe("MoodleSession=rotated");
    expect(sent.at(-1)?.userAgent).toBe("Fixture captured Chrome");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not overwrite replacement credentials with a late cookie response", async () => {
    await secrets.set("moodle-credentials", JSON.stringify({ baseUrl, cookie: "MoodleSession=old" }));
    const started = deferred<void>();
    const pending = deferred<Response>();
    const sent: string[] = [];
    const fetcher: typeof fetch = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const cookie = new Headers(init?.headers).get("cookie") ?? "";
      sent.push(cookie);
      if (cookie === "MoodleSession=old") { started.resolve(); return pending.promise; }
      return new Response("new fixture image");
    });
    app = createApp(fetcher);
    const request = app.inject(`/api/moodle/asset?url=${encodeURIComponent(`${baseUrl}/pluginfile.php/5/image.png`)}`).then((response) => response);
    await started.promise;
    expect((await app.inject({ method: "POST", url: "/api/sources/moodle/credentials", payload: { baseUrl, cookie: "MoodleSession=new" } })).statusCode).toBe(200);
    pending.resolve(new Response("old image", { headers: { "set-cookie": "MoodleSession=late-old; Path=/" } }));
    expect((await request).statusCode).toBeGreaterThanOrEqual(400);
    const stored = await secrets.get("moodle-credentials");
    expect(stored).toContain("MoodleSession=new");
    expect(stored).not.toContain("late-old");
    expect((await app.inject(`/api/moodle/asset?url=${encodeURIComponent(`${baseUrl}/pluginfile.php/5/image.png`)}`)).statusCode).toBe(200);
    expect(sent.at(-1)).toBe("MoodleSession=new");
  });

  it("does not resurrect disconnected credentials from a late response", async () => {
    await secrets.set("moodle-credentials", JSON.stringify({ baseUrl, cookie: "MoodleSession=old" }));
    const started = deferred<void>();
    const pending = deferred<Response>();
    app = createApp(vi.fn(async () => { started.resolve(); return pending.promise; }));
    const request = app.inject(`/api/moodle/asset?url=${encodeURIComponent(`${baseUrl}/pluginfile.php/5/image.png`)}`).then((response) => response);
    await started.promise;
    expect((await app.inject({ method: "POST", url: "/api/sources/moodle/disconnect" })).statusCode).toBe(200);
    pending.resolve(new Response("old image", { headers: { "set-cookie": "MoodleSession=late-old; Path=/" } }));
    expect((await request).statusCode).toBeGreaterThanOrEqual(400);
    expect(await secrets.get("moodle-credentials")).toBeNull();
  });

  it.each(["offline", "outage"])("keeps the last known connection on a setup check during %s", async (mode) => {
    await secrets.set("moodle-credentials", JSON.stringify({ baseUrl, cookie: "MoodleSession=fixture" }));
    const fetcher: typeof fetch = vi.fn(async () => {
      if (mode === "offline") throw new Error("Fixture offline");
      return new Response("Fixture service unavailable", { status: 503 });
    });
    app = createApp(fetcher);
    const db = (app as FastifyInstance & { coveDb: CoveDatabase }).coveDb;
    const previous = "2026-11-01T00:00:00.000Z";
    db.setSourceStatus("moodle", "connected", previous, null);
    const response = await app.inject("/api/setup/status");
    expect(response.statusCode).toBe(200);
    expect(response.json().moodleConnected).toBe(true);
    expect(db.listSources().find((source) => source.id === "moodle")).toMatchObject({ status: "connected", lastSyncAt: previous, lastError: null });
    expect(await secrets.get("moodle-credentials")).not.toBeNull();
  });
});
