import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { MemorySecretStore } from "../secrets.js";

let app: FastifyInstance;

beforeEach(() => {
  app = buildApp({ dbPath: ":memory:", seed: true, secretStore: new MemorySecretStore() });
});

afterEach(async () => {
  await app.close();
});

describe("local API", () => {
  it("reports health", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("serves the 55 fixture items and three sources", async () => {
    const response = await app.inject({ method: "GET", url: "/api/brief" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(55);
    expect(body.sources.map((source: { id: string }) => source.id)).toEqual(["ed", "gmail", "moodle", "ontrack"]);
    expect(body.items[0].text.length).toBeGreaterThan(20);
    expect(body.items[0].evidenceQuote.length).toBeGreaterThan(5);
    expect(body.items[0].firstSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns item detail and 404 for unknown items", async () => {
    const found = await app.inject({ method: "GET", url: "/api/items/gmail-001" });
    expect(found.statusCode).toBe(200);
    expect(found.json().id).toBe("gmail-001");

    const missing = await app.inject({ method: "GET", url: "/api/items/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("not_found");
  });

  it("persists corrections and marks items read", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/items/gmail-001/correction",
      payload: { pinned: true, feedback: { reason: "importance", note: "check", at: "10:00" } },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().correction.pinned).toBe(true);

    const check = await app.inject({ method: "POST", url: "/api/check", payload: { ids: ["gmail-001"] } });
    expect(check.statusCode).toBe(200);
    const item = await app.inject({ method: "GET", url: "/api/items/gmail-001" });
    expect(item.json().read).toBe(true);
    expect(item.json().correction.feedback.note).toBe("check");
  });

  it("clears local data", async () => {
    const cleared = await app.inject({ method: "DELETE", url: "/api/data" });
    expect(cleared.statusCode).toBe(200);
    const brief = await app.inject({ method: "GET", url: "/api/brief" });
    expect(brief.json().items).toHaveLength(0);
    // 清除数据只删内容，连接状态保留：断开来源是另一个动作。
    expect(brief.json().sources.some((source: { status: string }) => source.status !== "disconnected")).toBe(true);
  });

  it("keeps corrections and reads after reopening the database", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cove-db-"));
    const dbPath = path.join(dir, "test.sqlite");
    const first = buildApp({ dbPath, seed: true });
    await first.inject({
      method: "PATCH",
      url: "/api/items/ed-001/correction",
      payload: { pinned: true, feedback: { reason: "other", note: "persisted", at: "10:01" } },
    });
    await first.inject({ method: "POST", url: "/api/check", payload: { ids: ["ed-001"] } });
    await first.close();

    const second = buildApp({ dbPath, seed: true });
    const item = await second.inject({ method: "GET", url: "/api/items/ed-001" });
    expect(item.json().read).toBe(true);
    expect(item.json().correction.pinned).toBe(true);
    expect(item.json().correction.feedback.note).toBe("persisted");
    await second.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores Ed credentials and syncs through the route", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ courses: [{ course: { id: 11, code: "FIT1045", status: "active" } }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ threads: [{ id: 7, title: "Hello", document: "A thread body.", created_at: "2026-10-29T10:00:00.000Z", user: { course_role: "student" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const edApp = buildApp({ dbPath: ":memory:", seed: false, secretStore: new MemorySecretStore(), fetcher });
    const creds = await edApp.inject({ method: "POST", url: "/api/sources/ed/credentials", payload: { token: "token", region: "au" } });
    expect(creds.statusCode).toBe(200);
    const sync = await edApp.inject({ method: "POST", url: "/api/sync", payload: { source: "ed" } });
    expect(sync.statusCode).toBe(200);
    const brief = await edApp.inject({ method: "GET", url: "/api/brief" });
    expect(brief.json().items).toHaveLength(1);
    expect(brief.json().items[0].source).toBe("ed");
    await edApp.close();
  });

  it("rejects state-changing requests from a foreign origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sources/ed/credentials",
      headers: { origin: "https://evil.example" },
      payload: { token: "token", region: "us" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("forbidden_origin");
  });

  it("rejects unknown source filters", async () => {
    const response = await app.inject({ method: "GET", url: "/api/brief?source=canvas" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_source");
  });

  it("lets the user mark an assignment as submitted and undo it", async () => {
    const marked = await app.inject({ method: "PATCH", url: "/api/items/gmail-001/completed", payload: { completed: true } });
    expect(marked.statusCode).toBe(200);
    expect(marked.json().completedAt).toBeTruthy();
    expect(marked.json().completedSource).toBe("user");

    const cleared = await app.inject({ method: "PATCH", url: "/api/items/gmail-001/completed", payload: { completed: null } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().completedAt).toBeNull();

    const invalid = await app.inject({ method: "PATCH", url: "/api/items/gmail-001/completed", payload: { completed: "yes" } });
    expect(invalid.statusCode).toBe(400);

    const missing = await app.inject({ method: "PATCH", url: "/api/items/nope/completed", payload: { completed: true } });
    expect(missing.statusCode).toBe(404);
  });

  it("accepts a captured Moodle cookie jar or a pasted session", async () => {
    const baseUrl = "https://learning.monash.edu";
    const cookieOnly = await app.inject({
      method: "POST",
      url: "/api/sources/moodle/credentials",
      payload: { baseUrl, cookie: "MoodleSession=a; MDL_SSP_SessID=b" },
    });
    expect(cookieOnly.statusCode).toBe(200);

    const sessionOnly = await app.inject({ method: "POST", url: "/api/sources/moodle/credentials", payload: { baseUrl, session: "abc" } });
    expect(sessionOnly.statusCode).toBe(200);

    const empty = await app.inject({ method: "POST", url: "/api/sources/moodle/credentials", payload: { baseUrl } });
    expect(empty.statusCode).toBe(400);
  });

  it("requires Ed credentials before proxying a download", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/ed/download?url=https%3A%2F%2Fstatic.edusercontent.com%2Ffile%2Fa.pdf",
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("ed_not_connected");
  });

  it("refuses Ed downloads that leave the allowed hosts", async () => {
    await app.inject({ method: "POST", url: "/api/sources/ed/credentials", payload: { token: "token", region: "us" } });

    const internal = await app.inject({ method: "GET", url: "/api/ed/download?url=http%3A%2F%2F127.0.0.1%3A4317%2Fapi%2Fhealth" });
    expect(internal.statusCode).toBe(400);
    expect(internal.json().error.code).toBe("invalid_url");

    const foreign = await app.inject({ method: "GET", url: "/api/ed/download?url=https%3A%2F%2Fexample.com%2Fa.pdf" });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json().error.code).toBe("blocked_host");

    const sneaky = await app.inject({ method: "GET", url: "/api/ed/download?url=https%3A%2F%2Fedstem.org.evil.example%2Fa.pdf" });
    expect(sneaky.statusCode).toBe(403);
  });

  it("accepts writes from the service's own origin on a custom port", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/check",
      headers: { origin: "http://127.0.0.1:4318", host: "127.0.0.1:4318" },
      payload: { ids: [] },
    });
    expect(response.statusCode).toBe(200);
  });

  it("blocks cross-site requests to side-effecting GET routes", async () => {
    const url = "/api/ed/download?url=https%3A%2F%2Fstatic.edusercontent.com%2Fa.pdf";
    const blocked = await app.inject({ method: "GET", url, headers: { "sec-fetch-site": "cross-site" } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("forbidden_origin");

    // Same-origin traffic reaches the route and fails on missing credentials instead.
    const reached = await app.inject({ method: "GET", url, headers: { "sec-fetch-site": "same-origin" } });
    expect(reached.statusCode).toBe(409);

    // Read-only endpoints stay callable from anywhere on the machine.
    const brief = await app.inject({ method: "GET", url: "/api/brief", headers: { "sec-fetch-site": "cross-site" } });
    expect(brief.statusCode).toBe(200);
  });

  it("gzips large JSON responses when the client accepts it", async () => {
    const plain = await app.inject({ method: "GET", url: "/api/brief" });
    const response = await app.inject({ method: "GET", url: "/api/brief", headers: { "accept-encoding": "gzip" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(JSON.parse(gunzipSync(response.rawPayload).toString()).items).toHaveLength(55);
    expect(response.rawPayload.length).toBeLessThan(Buffer.byteLength(plain.body) / 2);
  });

  it("caps the brief payload and rejects a non-positive limit", async () => {
    const limited = await app.inject({ method: "GET", url: "/api/brief?limit=10" });
    expect(limited.statusCode).toBe(200);
    expect(limited.json().items).toHaveLength(10);

    const invalid = await app.inject({ method: "GET", url: "/api/brief?limit=0" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("invalid_limit");
  });
});
