import { describe, expect, it } from "vitest";
import { mergeGradeCourse } from "../moodle-grade-refresh.js";
import type { MoodleGradeCourse } from "../sources/moodle-grades.js";

const base = "https://moodle.example.invalid";
const at = "2026-11-11T12:00:00.000Z";
function course(): MoodleGradeCourse {
  return { courseId: "1", courseName: "Fixture", total: { earned: null, max: null }, assessmentWarning: null,
    assessmentFetchedAt: at, assessmentStructure: [{ name: "Essay", url: `${base}/mod/assign/view.php?id=7`, isCategory: false,
      category: "Written", categoryId: 4, weight: 40, categoryWeight: 40, gradeItemId: "old" }],
    items: [{ id: "old", name: "Essay", url: `${base}/mod/assign/view.php?id=7`, gradeText: null,
      grade: null, gradeMax: 10, weight: null, feedback: "", gradedAt: null, gradingState: "unknown" }], overviewGrade: null };
}

describe("account-scoped grade refresh merge", () => {
  it("retains stale weights and their timestamp, rematching current grade rows", () => {
    const previous = course();
    const current = course(); current.assessmentStructure = []; current.assessmentWarning = "unavailable";
    current.items[0].id = "new"; current.assessmentFetchedAt = null;
    const result = mergeGradeCourse(current, previous, base, "2026-11-12T12:00:00Z");
    expect(result.assessmentStructure[0]).toMatchObject({ weight: 40, gradeItemId: "new" });
    expect(result.assessmentStale).toBe(true);
    expect(result.assessmentFetchedAt).toBe(at);
    expect(previous.assessmentStructure[0].gradeItemId).toBe("old");
    current.items = [];
    expect(mergeGradeCourse(current, previous, base, at).assessmentStructure[0].gradeItemId).toBeNull();
  });

  it("does not borrow missing baseline/course data and replaces structure after recovery", () => {
    const previous = course(); const current = course(); current.items[0].gradeText = "8";
    expect(mergeGradeCourse(current, undefined, base, at).gradeChanges).toEqual([]);
    previous.courseId = "2";
    expect(mergeGradeCourse(current, previous, base, at).gradeChanges).toEqual([]);
    current.assessmentStructure = [];
    expect(mergeGradeCourse(current, course(), base, at).assessmentStructure).toEqual([]);
  });

  it("preserves successful activity results on unknown reads and hidden graded status", () => {
    const previous = course(); previous.items[0] = { ...previous.items[0], gradeText: "0 / 10", grade: 0, gradeSource: "activity", gradingState: "graded", feedback: "Reviewed" };
    const current = course(); current.detailWarning = "unavailable";
    const result = mergeGradeCourse(current, previous, base, at);
    expect(result.items[0]).toMatchObject({ grade: 0, gradeText: "0 / 10", feedback: "Reviewed", gradingState: "graded" });
    expect(result.gradeChanges).toEqual([]);
    previous.items[0].gradeText = null; previous.items[0].grade = null;
    expect(mergeGradeCourse(course(), previous, base, at).items[0].gradingState).toBe("graded");
  });

  it("notifies only changes with a baseline, keeps stable opaque IDs and bounds retention", () => {
    const previous = course(); const current = course(); current.items[0].gradeText = "HD";
    const released = mergeGradeCourse(current, previous, base, at);
    expect(released.gradeChanges).toHaveLength(1);
    expect(released.gradeChanges![0]).toMatchObject({ kind: "released", itemName: "Essay", detectedAt: at });
    expect(released.gradeChanges![0].id).not.toContain("HD");
    const unchanged = mergeGradeCourse(current, released, base, at);
    expect(unchanged.gradeChanges).toEqual(released.gradeChanges);
    const changed = structuredClone(current); changed.items[0].gradeText = "D";
    expect(mergeGradeCourse(changed, released, base, at).gradeChanges?.at(-1)?.kind).toBe("changed");
    const newItem = course(); newItem.items[0].id = "discovered"; newItem.items[0].gradeText = "8";
    expect(mergeGradeCourse(newItem, previous, base, at).gradeChanges).toEqual([]);
    expect(mergeGradeCourse(changed, released, base, "2027-01-11T12:00:00Z").gradeChanges).toHaveLength(1);
  });

  it("keeps overview text on an outage and does not manufacture numeric totals", () => {
    const previous = course(); previous.overviewGrade = "HD";
    const current = course(); current.overviewWarning = "unavailable";
    const result = mergeGradeCourse(current, previous, base, at);
    expect(result.overviewGrade).toBe("HD"); expect(result.total).toEqual({ earned: null, max: null });
    expect(result.gradeChanges).toEqual([]);
    current.overviewWarning = null; current.overviewGrade = "D";
    expect(mergeGradeCourse(current, previous, base, at).gradeChanges?.[0]).toMatchObject({ kind: "changed", itemName: null });
  });
});
