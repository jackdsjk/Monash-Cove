import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createDatabase, type CoveDatabase } from "../db.js";
import { MemorySecretStore } from "../secrets.js";
import { attendanceScanKey } from "../attendance/scan-key.js";

let dir: string;
let db: CoveDatabase;
let app: FastifyInstance;

const row = {
  id: "row-1",
  courseId: "42",
  courseName: "ETW2001",
  sectionNumber: 3,
  sectionTitle: "Week 3",
  module: "label",
  title: "Week 3 Attendance Codes",
  url: "https://learning.monash.edu/course/view.php?id=42&section=3",
  text: "Week 3 Attendance Codes",
  updatedAt: "2026-11-01T00:00:00.000Z",
  campus: "malaysia" as const,
  images: ["https://learning.monash.edu/pluginfile.php/1/mod_label/intro/week3.png"],
};

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cove-att-"));
  const dbPath = path.join(dir, "cove.sqlite");
  db = createDatabase({ dbPath, seed: false });
  db.replaceMoodleContent("42", [row]);
  app = buildApp({ dbPath, seed: false, secretStore: new MemorySecretStore(), autoSync: false });
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("unmatched attendance images", () => {
  it("lists attendance images whose OCR matched no code", async () => {
    db.setAttendanceScan(attendanceScanKey(row), "empty", "no code shape");

    const response = await app.inject({ method: "GET", url: "/api/attendance/unmatched" });
    expect(response.statusCode).toBe(200);
    const items = response.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].week).toBe(3);
    expect(items[0].status).toBe("empty");
    expect(items[0].images[0]).toContain("pluginfile.php");
  });

  it("hides images that already produced a code", async () => {
    db.setAttendanceScan(attendanceScanKey(row), "ok");
    const response = await app.inject({ method: "GET", url: "/api/attendance/unmatched" });
    expect(response.json().items).toHaveLength(0);
  });

  it("only proxies Moodle pluginfile assets", async () => {
    const blocked = await app.inject({ method: "GET", url: "/api/moodle/asset?url=https%3A%2F%2Fevil.example%2Fx.png" });
    expect(blocked.statusCode).toBe(409); // no Moodle credentials stored in this app

    await app.inject({
      method: "POST",
      url: "/api/sources/moodle/credentials",
      payload: { baseUrl: "https://learning.monash.edu", cookie: "MoodleSession=a" },
    });
    const foreign = await app.inject({ method: "GET", url: "/api/moodle/asset?url=https%3A%2F%2Fevil.example%2Fx.png" });
    expect(foreign.statusCode).toBe(403);

    const notPluginfile = await app.inject({ method: "GET", url: "/api/moodle/asset?url=https%3A%2F%2Flearning.monash.edu%2Fcourse%2Fview.php%3Fid%3D1" });
    expect(notPluginfile.statusCode).toBe(403);
  });
});
