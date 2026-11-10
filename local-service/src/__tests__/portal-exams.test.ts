import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createDatabase } from "../db.js";
import { MemorySecretStore } from "../secrets.js";
import { epochMillis, parsePortalEvents, PortalError, portalTimezone } from "../student-portal.js";

const START = Date.UTC(2026, 10, 20, 1, 30); // 09:30 in Kuala Lumpur
const TWO_HOURS = 120 * 60_000;

interface EventOptions {
  uuid?: string;
  eventType?: string;
  start?: unknown;
  end?: unknown;
  timezoneLocation?: unknown;
  campus?: unknown;
  unitCode?: unknown;
  activityType?: unknown;
  unitTitle?: unknown;
  location?: unknown;
}

/** Synthetic payload with the same shape as `/api/student/userEvents`. */
function examEvent(options: EventOptions = {}) {
  return {
    uuid: options.uuid ?? "exam-1",
    eventType: options.eventType ?? "exam",
    start: { time: options.start ?? START },
    end: {
      time:
        options.end ??
        (typeof options.start === "number" ? options.start + TWO_HOURS : START + TWO_HOURS),
    },
    data: {
      unitCode: options.unitCode ?? "FIT1047",
      unitTitle: options.unitTitle ?? "Data Structures and Algorithms",
      activityType: Object.hasOwn(options, "activityType") ? options.activityType : "Final Examination",
      timezoneLocation: options.timezoneLocation ?? "Kuala Lumpur",
      campus: options.campus ?? "MA",
      notes: "Closed book",
    },
    location: options.location ?? { data: { description: "Examination Hall A, Seat: 42" } },
  };
}

function payload(events: unknown[], errorFlags: { exams?: number } = { exams: 0 }) {
  return { errorFlags, events };
}

function expectCode(work: () => unknown, code: string) {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(PortalError);
    expect((error as PortalError).code).toBe(code);
    return;
  }
  throw new Error(`expected PortalError(${code})`);
}

describe("portal exam parser", () => {
  it("keeps only exam events and maps their fields", () => {
    const exams = parsePortalEvents(
      payload([
        examEvent(),
        examEvent({ uuid: "lecture-1", eventType: "lecture" }),
        examEvent({ uuid: "class-1", eventType: "class" }),
      ]),
    );

    expect(exams).toHaveLength(1);
    expect(exams[0]).toMatchObject({
      id: "exam-1",
      courseCode: "FIT1047",
      title: "Final Examination",
      startMs: START,
      endMs: START + TWO_HOURS,
      timezone: "Asia/Kuala_Lumpur",
      campus: "MA",
      location: "Examination Hall A, Seat: 42",
      seat: "42",
      durationMin: 120,
    });
    expect(JSON.parse(exams[0].rawJson)).toMatchObject({ uuid: "exam-1", eventType: "exam" });
  });

  it("separates the exam name from the unit name", () => {
    const [exam] = parsePortalEvents(
      payload([examEvent({ activityType: undefined, unitTitle: "Software Engineering" })]),
    );
    expect(exam.title).toBe("Software Engineering");
  });

  it("accepts integral float epochs and rejects fractional or string times", () => {
    expect(epochMillis(START + 0)).toBe(START);
    expect(epochMillis(START + 0.5)).toBeNull();
    expect(epochMillis(String(START))).toBeNull();
    expect(epochMillis(Number.NaN)).toBeNull();
    expect(epochMillis(Number.MAX_SAFE_INTEGER + 2)).toBeNull();

    expectCode(
      () => parsePortalEvents(payload([examEvent({ start: START + 0.5 })])),
      "portal_parse_error",
    );
    expectCode(
      () => parsePortalEvents(payload([examEvent({ end: "2026-11-20T03:30:00Z" })])),
      "portal_parse_error",
    );
  });

  it("rejects an exam whose end is not after its start", () => {
    expectCode(
      () => parsePortalEvents(payload([examEvent({ end: START })])),
      "portal_parse_error",
    );
  });

  it("maps portal timezone names to IANA zones", () => {
    expect(portalTimezone("Kuala Lumpur", "MA")).toBe("Asia/Kuala_Lumpur");
    expect(portalTimezone("Malaysia", "")).toBe("Asia/Kuala_Lumpur");
    expect(portalTimezone("Melbourne", "CL")).toBe("Australia/Melbourne");
    expect(portalTimezone("Sydney", "")).toBe("Australia/Sydney");
    expect(portalTimezone("Prato", "")).toBe("Europe/Rome");
    expect(portalTimezone("Suzhou", "")).toBe("Asia/Shanghai");
    expect(portalTimezone("Australia/Sydney", "")).toBe("Australia/Sydney");
    expect(portalTimezone("", "MA")).toBe("Asia/Kuala_Lumpur");
    expect(portalTimezone("", "CL")).toBeNull();
    expect(portalTimezone("Atlantis", "")).toBeNull();
  });

  it("fails loudly on an unknown timezone instead of guessing", () => {
    expectCode(
      () => parsePortalEvents(payload([examEvent({ timezoneLocation: "Atlantis", campus: "" })])),
      "portal_parse_error",
    );
  });

  it("reads a room list and leaves the seat empty when the portal has none", () => {
    const [exam] = parsePortalEvents(
      payload([
        examEvent({
          location: {
            data: [
              { buildingName: "Building 2", roomName: "2-101" },
              { buildingName: "", roomName: "2-102" },
            ],
          },
        }),
      ]),
    );
    expect(exam.location).toBe("Building 2 2-101, 2-102");
    expect(exam.seat).toBeNull();
  });

  it("deduplicates by uuid and sorts by start instant", () => {
    const later = examEvent({ uuid: "exam-later", start: START + 86_400_000, end: START + 86_400_000 + TWO_HOURS });
    const earlier = examEvent({ uuid: "exam-earlier" });
    const exams = parsePortalEvents(payload([later, earlier, earlier]));
    expect(exams.map((exam) => exam.id)).toEqual(["exam-earlier", "exam-later"]);
  });

  it("treats an exam-free events list as valid empty data", () => {
    expect(parsePortalEvents(payload([{ eventType: "lecture" }]))).toEqual([]);
    expect(parsePortalEvents(payload([]))).toEqual([]);
  });

  it("never turns a portal error into an empty timetable", () => {
    expectCode(() => parsePortalEvents(payload([], { exams: 1 })), "portal_response_error");
    expectCode(() => parsePortalEvents(payload([], {})), "portal_response_error");
    expectCode(() => parsePortalEvents({ errorFlags: { exams: 0 }, events: null }), "portal_parse_error");
    expectCode(() => parsePortalEvents(payload([examEvent()]), 500), "portal_response_error");
  });

  it("rejects an exam without a unit code", () => {
    expectCode(
      () => parsePortalEvents(payload([examEvent({ unitCode: "   " })])),
      "portal_parse_error",
    );
  });
});

describe("portal exam storage", () => {
  it("replaces the timetable atomically and keeps the last sync time", () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    try {
      const [exam] = parsePortalEvents(payload([examEvent()]));
      const later = parsePortalEvents(payload([examEvent({ uuid: "exam-2", start: START + 86_400_000 })]))[0];

      db.replacePortalExams([exam, later], "2026-11-10T00:00:00.000Z");
      expect(db.listPortalExams()).toHaveLength(2);
      expect(db.listPortalExams()[0]).toMatchObject({
        id: "exam-1",
        courseCode: "FIT1047",
        startMs: START,
        timezone: "Asia/Kuala_Lumpur",
        seat: "42",
        syncedAt: "2026-11-10T00:00:00.000Z",
      });
      expect(db.portalExamsSyncedAt()).toBe("2026-11-10T00:00:00.000Z");

      db.replacePortalExams([later], "2026-11-11T00:00:00.000Z");
      expect(db.listPortalExams().map((row) => row.id)).toEqual(["exam-2"]);
      expect(db.portalExamsSyncedAt()).toBe("2026-11-11T00:00:00.000Z");
    } finally {
      db.close();
    }
  });
});

describe("portal exam routes", () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "cove-portal-"));
    vi.stubEnv("COVE_DATA_DIR", dataDir);
    app = buildApp({ dbPath: ":memory:", seed: false, secretStore: new MemorySecretStore() });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns an empty timetable and no connection before the portal login", async () => {
    const response = await app.inject({ method: "GET", url: "/api/portal/exams" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ exams: [], syncedAt: null, connected: false });
  });

  it("reports portal_not_connected instead of inventing exams", async () => {
    const response = await app.inject({ method: "POST", url: "/api/portal/exams/sync" });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("portal_not_connected");
    expect(response.json().error.retryable).toBe(false);
  });
});
