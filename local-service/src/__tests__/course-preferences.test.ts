import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureOnTrackCredentials } from "../sources/ontrack.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type CoveDatabase } from "../db.js";
import {
  coursePreferencesSchema,
  courseSemester,
  getMoodleCoursePreferences,
  saveMoodleCoursePreferences,
  selectMoodleCourses,
} from "../course-preferences.js";
import { MemorySecretStore } from "../secrets.js";
import type { GoogleOAuth } from "../oauth/google.js";
import { SyncOrchestrator } from "../sync/orchestrator.js";
import * as gmailSync from "../sync/gmail.js";
import * as sourceSync from "../sync/sources.js";
import * as contentSync from "../sync/moodle-content.js";

let db: CoveDatabase;
let onTrackConfig: string;

beforeEach(() => {
  onTrackConfig = mkdtempSync(join(tmpdir(), "cove-course-preferences-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", onTrackConfig);
  configureOnTrackCredentials(new MemorySecretStore());
  db = createDatabase({ dbPath: ":memory:", seed: false });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network call"); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(onTrackConfig, { recursive: true, force: true });
  db.close();
});

describe("Moodle course preferences", () => {
  it.each([
    ["FIT1047_S1_2026", "2026-S1"],
    ["FIT1047_2026_S2_MUM", "2026-S2"],
    ["T1_2026", "2026-T1"],
    ["2026-T2", "2026-T2"],
    ["fit1047_t3_2026", "2026-T3"],
    ["SUMMER_2026", "2026-SUMMER"],
    ["FIT1047.2026.SUMMER", "2026-SUMMER"],
    ["FIT1047_2026", null],
    ["FIT1047_FULL_YEAR_2026", null],
    ["FIT1047_S3_2026", null],
    ["FIT1047_2026S1", null],
    ["", null],
  ])("parses only an explicit semester from %s", (name, expected) => {
    expect(courseSemester(name)).toBe(expected);
  });

  it("keeps all courses by default and retains unknown semesters", () => {
    const courses = [
      { id: 1, shortname: "UNIT_S1_2026" },
      { id: 2, shortname: "UNIT_S2_2026" },
      { id: 3, shortname: "UNIT_FULL_YEAR" },
    ];
    expect(selectMoodleCourses(courses, coursePreferencesSchema.parse({}))).toEqual(courses);
    const preferences = coursePreferencesSchema.parse({ activeSemester: "2026-S2" });
    expect(selectMoodleCourses(courses, preferences).map((course) => course.id)).toEqual([2, 3]);
    expect(selectMoodleCourses([{ id: 4, shortname: "UNKNOWN" }], preferences)).toEqual([{ id: 4, shortname: "UNKNOWN" }]);
  });

  it("lets pins override semester filtering but gives hidden IDs precedence", () => {
    const courses = [
      { id: 1, shortname: "UNIT_S1_2026" },
      { id: 2, shortname: "UNIT_S1_2026" },
      { id: 3, shortname: "UNIT_S2_2026" },
      { id: 4, shortname: "UNKNOWN" },
    ];
    const preferences = coursePreferencesSchema.parse({ activeSemester: "2026-S2", pinnedCourseIds: ["1", "2"], hiddenCourseIds: ["2", "3"] });
    expect(selectMoodleCourses(courses, preferences).map((course) => course.id)).toEqual([1, 4]);
    expect(courses).toHaveLength(4);
  });

  it("isolates settings by credential identity and falls back safely for malformed settings", () => {
    const preferences = coursePreferencesSchema.parse({ activeSemester: "2026-S1", hiddenCourseIds: ["1"] });
    saveMoodleCoursePreferences(db, "account-a", preferences);
    expect(getMoodleCoursePreferences(db, "account-a")).toEqual(preferences);
    expect(getMoodleCoursePreferences(db, "account-b")).toEqual(coursePreferencesSchema.parse({}));
    saveMoodleCoursePreferences(db, "account-b", coursePreferencesSchema.parse({ pinnedCourseIds: ["2"] }));
    expect(getMoodleCoursePreferences(db, "account-a")).toEqual(preferences);
    db.setSetting("moodle_course_preferences:broken", "not-json");
    expect(getMoodleCoursePreferences(db, "broken")).toEqual(coursePreferencesSchema.parse({}));
    db.setSetting("moodle_course_preferences:broken", JSON.stringify({ activeSemester: "current" }));
    expect(getMoodleCoursePreferences(db, "broken")).toEqual(coursePreferencesSchema.parse({}));
  });

  it("bounds settings payloads, rejects invalid IDs and deduplicates valid preferences", () => {
    expect(coursePreferencesSchema.safeParse({ hiddenCourseIds: Array.from({ length: 501 }, (_, i) => String(i)) }).success).toBe(false);
    expect(coursePreferencesSchema.safeParse({ pinnedCourseIds: ["1".repeat(33)] }).success).toBe(false);
    expect(coursePreferencesSchema.safeParse({ hiddenCourseIds: ["not-an-id"] }).success).toBe(false);
    expect(coursePreferencesSchema.safeParse({ activeSemester: "2026-S3" }).success).toBe(false);
    expect(coursePreferencesSchema.safeParse({ extra: true }).success).toBe(false);
    expect(coursePreferencesSchema.parse({ hiddenCourseIds: ["1", " 1 "] }).hiddenCourseIds).toEqual(["1"]);
  });

  it("passes only the current credential's preferences into the orchestrated full content sync", async () => {
    const store = new MemorySecretStore();
    const raw = JSON.stringify({ baseUrl: "https://moodle.example.invalid", session: "fixture-only" });
    await store.set("ed-credentials", JSON.stringify({ token: "fixture-token", region: "us" }));
    await store.set("moodle-credentials", raw);
    const identity = createHash("sha256").update("moodle\0" + raw).digest("hex");
    const preferences = coursePreferencesSchema.parse({ activeSemester: "2026-S2", pinnedCourseIds: ["12"] });
    saveMoodleCoursePreferences(db, identity, preferences);
    saveMoodleCoursePreferences(db, "other-account", coursePreferencesSchema.parse({ hiddenCourseIds: ["12"] }));
    vi.spyOn(gmailSync, "syncGmail").mockResolvedValue({ synced: 0 });
    vi.spyOn(sourceSync, "syncEd").mockResolvedValue({ synced: 0 });
    vi.spyOn(sourceSync, "syncMoodle").mockResolvedValue({ synced: 0 });
    vi.spyOn(sourceSync, "syncMoodleForum").mockResolvedValue({ synced: 0 });
    const sync = vi.spyOn(contentSync, "syncAllMoodleContent").mockResolvedValue({ courses: 0, items: 0 });
    const google = { client: async () => ({}) } as unknown as GoogleOAuth;
    await new SyncOrchestrator(db, store, google, fetch).full();
    expect(sync.mock.calls[0]?.[5]).toEqual(preferences);
    expect(fetch).not.toHaveBeenCalled();
  });
});
