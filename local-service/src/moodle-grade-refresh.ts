import { randomUUID } from "node:crypto";
import type { MoodleGradeCourse } from "./sources/moodle-grades.js";
import { matchGradebookItem } from "./vendor/muster/assessment-match.js";
import type { CoveDatabase } from "./db.js";

/** Apply definite evidence after the cache/account guard, never remote writes. */
export function applyGradeSubmissionEvidence(db: CoveDatabase, courses: MoodleGradeCourse[]): void {
  const matching = db.db.prepare("SELECT id, submission_state FROM items WHERE source = 'moodle' AND deleted_at IS NULL AND url = ?");
  for (const course of courses) for (const item of course.items) {
    if (!item.url || (item.gradingState !== "graded" && item.gradingState !== "submitted")) continue;
    for (const row of matching.all(item.url) as Array<{ id: string; submission_state: string | null }>) {
      if (row.submission_state === "graded" && item.gradingState !== "graded") continue;
      db.setItemSubmissionState(row.id, item.gradingState);
    }
  }
}

/** Merge within an already account/range-scoped resource snapshot only. */
export function mergeGradeCourse(current: MoodleGradeCourse, previous: MoodleGradeCourse | undefined, baseUrl: string, at: string): MoodleGradeCourse {
  if (!previous || previous.courseId !== current.courseId) return { ...current, gradeChanges: [] };
  const merged = { ...current };
  if (current.assessmentWarning && previous.assessmentStructure.length) {
    const activities = previous.assessmentStructure.filter((row) => !row.isCategory);
    merged.assessmentStructure = previous.assessmentStructure.map((row) => ({ ...row,
      gradeItemId: row.isCategory ? null : matchGradebookItem(row, current.items, activities, baseUrl)?.id ?? null,
    }));
    merged.assessmentFetchedAt = previous.assessmentFetchedAt ?? null;
    merged.assessmentStale = true;
    merged.assessmentWarning = "Assessments 刷新失败，使用上次成功读取的权重结构；可重试刷新。";
  }
  if (current.overviewWarning) merged.overviewGrade = previous.overviewGrade ?? null;
  // Unknown detail reads cannot erase a previously verified activity result.
  merged.items = current.items.map((item) => {
    const old = previous.items.find((candidate) => candidate.id === item.id);
    if (!old || item.gradingState !== "unknown") return item;
    if (old.gradeSource === "activity" && old.gradeText) {
      merged.detailWarning ??= "活动详情暂未确认，保留上次成功读取的活动成绩。";
      return { ...item, grade: old.grade, gradeMax: old.gradeMax, gradeText: old.gradeText,
        gradeSource: old.gradeSource, gradingState: old.gradingState, feedback: item.feedback || old.feedback,
        gradedAt: item.gradedAt ?? old.gradedAt };
    }
    return old.gradingState === "graded" || old.gradingState === "submitted"
      ? { ...item, gradingState: old.gradingState } : item;
  });
  const events = (previous.gradeChanges ?? []).filter((event) => Date.parse(at) - Date.parse(event.detectedAt) <= 30 * 86_400_000);
  for (const item of merged.items) {
    const old = previous.items.find((candidate) => candidate.id === item.id);
    // A newly discovered item has no baseline; discovery is not a release.
    if (!old || !item.gradeText || item.gradeText === old.gradeText) continue;
    events.push({ id: randomUUID(), kind: old.gradeText ? "changed" : "released", itemName: item.name, detectedAt: at });
  }
  if (!current.overviewWarning && merged.overviewGrade && merged.overviewGrade !== previous.overviewGrade
    && previous.overviewGrade !== undefined) {
    events.push({ id: randomUUID(), kind: previous.overviewGrade ? "changed" : "released", itemName: null, detectedAt: at });
  }
  merged.gradeChanges = events.slice(-20);
  return merged;
}
