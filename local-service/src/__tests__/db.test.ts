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
