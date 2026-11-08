import { createHash } from "node:crypto";
import type { CoveDatabase } from "../db.js";
import type { NewItem } from "../domain.js";
import {
  fetchOnTrackComments,
  fetchOnTrackProjects,
  fetchOnTrackTasks,
  onTrackWebUrl,
  type OnTrackAccount,
  type OnTrackComment,
  type OnTrackTask,
} from "../sources/ontrack.js";

export interface OnTrackSyncResult {
  synced: number;
  projects: number;
  tasks: number;
  feedback: number;
}

/** Monash teaching dates are published as calendar days; a task is due at the
 *  end of that day in the campus timezone the student is enrolled in. */
const CAMPUS_OFFSET = "+08:00";

/** Older comments belong to last semester, not to this brief. */
const FEEDBACK_RETENTION_DAYS = 90;

function dueAtIso(date: string | null) {
  return date ? `${date}T23:59:00${CAMPUS_OFFSET}` : null;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function taskItem(projectId: number, unitCode: string, task: OnTrackTask, baseUrl: string): NewItem {
  const label = [task.abbreviation, task.name].filter(Boolean).join(" ");
  const due = dueAtIso(task.dueDate);
  const text = [
    `${label}：状态 ${task.status || "未知"}`,
    task.weighting ? `权重 ${task.weighting}%` : "",
    task.submissionDate ? `提交于 ${task.submissionDate}` : "尚未提交",
    task.description,
  ]
    .filter(Boolean)
    .join("。");

  return {
    id: `ontrack:task:${task.id}`,
    source: "ontrack",
    sourceItemId: `task:${task.id}`,
    course: unitCode,
    title: label || "未命名任务",
    authorRole: "system",
    publishedAt: `${task.targetDueDate ?? task.dueDate ?? "1970-01-01"}T00:00:00.000Z`,
    updatedAt: new Date().toISOString(),
    url: onTrackWebUrl(baseUrl, projectId, task.taskDefinitionId),
    dueAt: due,
    deadlineKind: "ontrack",
    completedAt: task.completionDate ? `${task.completionDate}T00:00:00.000Z` : null,
    contentHash: hash(`${task.status}|${task.dueDate}|${task.submissionDate}|${task.timesAssessed}`),
    contentType: "assessment_fact",
    importance: task.dueDate && !task.completionDate ? "important" : "reference",
    actionRequired: task.dueDate && !task.completionDate ? "yes" : "no",
    openOriginal: "optional",
    triageVersion: "ontrack-1",
    model: "ontrack",
    text,
    evidenceQuote: `${label} 截止 ${task.dueDate ?? "未公布"}`,
  };
}

function feedbackItem(projectId: number, unitCode: string, task: OnTrackTask, comment: OnTrackComment, baseUrl: string): NewItem {
  const label = [task.abbreviation, task.name].filter(Boolean).join(" ");
  const author = comment.authorName || "OnTrack";
  const isAssessment = comment.type === "assessment";

  return {
    id: `ontrack:feedback:${comment.id}`,
    source: "ontrack",
    sourceItemId: `feedback:${comment.id}`,
    course: unitCode,
    title: `${label}：${author} 的${isAssessment ? "评分" : "反馈"}`,
    authorRole: "staff",
    publishedAt: comment.createdAt || new Date().toISOString(),
    updatedAt: comment.createdAt || new Date().toISOString(),
    url: onTrackWebUrl(baseUrl, projectId, task.taskDefinitionId),
    dueAt: null,
    deadlineKind: null,
    completedAt: null,
    contentHash: hash(`${comment.type}|${comment.comment}`),
    contentType: isAssessment ? "assessment_fact" : "staff_answer",
    importance: isAssessment ? "critical" : "important",
    actionRequired: isAssessment ? "yes" : "no",
    openOriginal: "required",
    triageVersion: "ontrack-1",
    model: "ontrack",
    text: comment.comment,
    evidenceQuote: comment.comment.length > 160 ? `${comment.comment.slice(0, 160)}…` : comment.comment,
  };
}

export async function syncOnTrack(db: CoveDatabase, account: OnTrackAccount | null): Promise<OnTrackSyncResult> {
  if (!account) throw new Error("OnTrack 还没有登录。在终端运行 ontrack login。");

  const projects = await fetchOnTrackProjects();
  // Comment fetches are one request per task. Scan each task once, then only
  // re-scan when OnTrack reports unseen comments on it.
  const cutoff = Date.now() - FEEDBACK_RETENTION_DAYS * 24 * 3_600_000;
  const scanKey = "ontrack_comment_scan_v1";
  const scanned = new Set<string>(JSON.parse(db.getSetting(scanKey) ?? "[]") as string[]);
  let synced = 0;
  let tasksSeen = 0;
  let feedbackSeen = 0;

  for (const project of projects) {
    const baseUrl = process.env.ONTRACK_BASE_URL ?? "https://ontrack.infotech.monash.edu/api";
    const tasks = await fetchOnTrackTasks(project.id);
    tasksSeen += tasks.length;

    for (const task of tasks) {
      db.upsertItem(taskItem(project.id, project.unitCode, task, baseUrl));
      synced += 1;

      if (!task.taskDefinitionId) continue;
      const scannedBefore = scanned.has(String(task.taskDefinitionId));
      if (scannedBefore && task.numNewComments <= 0) continue;
      const comments = await fetchOnTrackComments(project.id, task.taskDefinitionId);
      const fromStaff = comments.filter(
        (comment) =>
          comment.authorId !== null &&
          comment.authorId !== account.userId &&
          comment.comment.trim() &&
          // Status transitions duplicate task.status; only real messages and
          // assessment results are worth a brief entry.
          (comment.type === "text" || comment.type === "assessment") &&
          (!comment.createdAt || Date.parse(comment.createdAt) > cutoff),
      );
      for (const comment of fromStaff) {
        db.upsertItem(feedbackItem(project.id, project.unitCode, task, comment, baseUrl));
        synced += 1;
        feedbackSeen += 1;
      }
      scanned.add(String(task.taskDefinitionId));
    }
  }

  db.setSetting(scanKey, JSON.stringify([...scanned]));

  db.setSourceStatus("ontrack", "connected", new Date().toISOString(), null);
  db.setSetting("last_synced_at", new Date().toISOString());
  return { synced, projects: projects.length, tasks: tasksSeen, feedback: feedbackSeen };
}
