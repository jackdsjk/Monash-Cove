import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type CoveDatabase } from "../db.js";
import type { MoodleContentRow } from "../domain.js";

let db: CoveDatabase;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cove-db-"));
  db = createDatabase({ dbPath: path.join(dir, "cove.sqlite"), seed: false });
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function contentRow(id: string): MoodleContentRow {
  return {
    id,
    courseId: "42",
    courseName: "FIT1047",
    sectionNumber: 1,
    sectionTitle: "Week 1",
    module: "resource",
    title: `Material ${id}`,
    url: `https://learning.monash.edu/mod/resource/view.php?id=${id}`,
    text: "",
    updatedAt: "2026-10-30T00:00:00.000Z",
    campus: "malaysia",
  };
}

describe("database configuration", () => {
  it("enables WAL, a busy timeout, and relaxed fsync for file databases", () => {
    expect((db.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
    expect((db.db.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout).toBe(5000);
    expect((db.db.prepare("PRAGMA synchronous").get() as { synchronous: number }).synchronous).toBe(1);
  });
});

describe("moodle content replacement", () => {
  it("keeps the previous materials when the replacement fails", () => {
    db.replaceMoodleContent("42", [contentRow("a")]);
    expect(db.listMoodleContent("42")).toHaveLength(1);

    // A duplicate primary key aborts the insert loop after the DELETE ran.
    expect(() => db.replaceMoodleContent("42", [contentRow("b"), contentRow("b")])).toThrow();

    expect(db.listMoodleContent("42").map((row) => row.id)).toEqual(["a"]);
  });

  it("applies a successful replacement in one shot", () => {
    db.replaceMoodleContent("42", [contentRow("a"), contentRow("b")]);
    expect(db.listMoodleContent("42").map((row) => row.id)).toEqual(["a", "b"]);

    db.replaceMoodleContent("42", [contentRow("c")]);
    expect(db.listMoodleContent("42").map((row) => row.id)).toEqual(["c"]);
  });
});

describe("attendance code storage", () => {
  const code = {
    id: "hash-1",
    source: "moodle",
    course: "ETW2001",
    week: 3,
    session: "Workshop 1",
    code: "AB12CD",
    title: "Week 3 Attendance Codes",
    url: "https://learning.monash.edu/mod/label/view.php?id=1",
    origin: "ocr" as const,
    publishedAt: "2026-10-30T00:00:00.000Z",
  };

  it("keeps codes after the source content is replaced", () => {
    db.upsertAttendanceCode(code);
    db.replaceMoodleContent("42", [contentRow("a")]);
    expect(db.listAttendanceCodes().map((row) => row.code)).toEqual(["AB12CD"]);
  });

  it("records that a code was filled", () => {
    db.upsertAttendanceCode(code);
    db.markAttendanceFilled("ETW2001", 3, "Workshop 1", "AB12CD");
    expect(db.listAttendanceCodes()[0].filledAt).toBeTruthy();
  });

  it("remembers which pages already went through OCR", () => {
    expect(db.attendanceScanStatus(["k1"]).get("k1")).toBeUndefined();
    db.setAttendanceScan("k1", "error", "OCR failed");
    expect(db.attendanceScanStatus(["k1"]).get("k1")).toBe("error");
    db.setAttendanceScan("k1", "ok");
    expect(db.attendanceScanStatus(["k1"]).get("k1")).toBe("ok");
  });

  it("drops codes when all local data is cleared", () => {
    db.upsertAttendanceCode(code);
    db.clearAll();
    expect(db.listAttendanceCodes()).toHaveLength(0);
  });
});

describe("manual submission marks", () => {
  const base = {
    id: "moodle:assessment:9",
    source: "moodle" as const,
    sourceItemId: "assessment:9",
    course: "ETW2001",
    title: "Assignment 3",
    authorRole: "system",
    publishedAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    url: "https://learning.monash.edu/mod/assign/view.php?id=9",
    dueAt: "2026-11-20T00:00:00.000Z",
    deadlineKind: "assign",
    contentHash: "h",
    contentType: "assessment_fact" as const,
    importance: "critical" as const,
    actionRequired: "yes" as const,
    openOriginal: "required" as const,
    evidenceQuote: "q",
    text: "deadline",
    triageVersion: "v",
    model: "m",
  };

  it("keeps a manual mark when the next sync reports no submission", () => {
    db.upsertItem({ ...base, completedAt: null });
    db.setItemUserCompleted(base.id, true);
    expect(db.getItem(base.id)?.completedAt).toBeTruthy();

    db.upsertItem({ ...base, completedAt: null });
    expect(db.getItem(base.id)?.completedSource).toBe("user");
    expect(db.getItem(base.id)?.completedAt).toBeTruthy();
  });

  it("does not let Moodle detection overwrite a manual mark", () => {
    db.upsertItem({ ...base, completedAt: null });
    db.setItemUserCompleted(base.id, true);
    db.setItemCompleted(base.id, null);
    expect(db.getItem(base.id)?.completedAt).toBeTruthy();
  });

  it("clears the manual mark when the user undoes it", () => {
    db.upsertItem({ ...base, completedAt: null });
    db.setItemUserCompleted(base.id, true);
    db.setItemUserCompleted(base.id, null);
    expect(db.getItem(base.id)?.completedAt).toBeNull();
    expect(db.getItem(base.id)?.completedSource).toBeNull();
  });
});
