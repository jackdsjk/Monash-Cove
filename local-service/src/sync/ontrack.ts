import { createHash } from "node:crypto";
import type { CoveDatabase } from "../db.js";
import type { NewItem } from "../domain.js";
import {
  fetchOnTrackComments,
  fetchOnTrackAccount,
  onTrackCacheIdentity,
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

/** Incremental briefs keep recent feedback; explicit backfill includes all dates. */
const FEEDBACK_RETENTION_DAYS = 90;

function dueAtIso(date: string | null) {
  return date ? `${date}T23:59:00${CAMPUS_OFFSET}` : null;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function taskItem(projectId: number, unitCode: string, task: OnTrackTask, baseUrl: string, sourceItemId: string): NewItem {
  const label = [task.abbreviation, task.name].filter(Boolean).join(" ");
  const applicable = task.visibility === "within_target";
  const due = applicable ? dueAtIso(task.dueDate) : null;
  const text = [
    `${label}：状态 ${task.status || "未知"}`,
    task.weighting ? `权重 ${task.weighting}%` : "",
    task.submissionDate ? `提交于 ${task.submissionDate}` : "尚未提交",
    task.description,
  ]
    .filter(Boolean)
    .join("。");

  return {
    id: `ontrack:${sourceItemId}`,
    source: "ontrack",
    sourceItemId,
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
    importance: applicable && task.dueDate && !task.completionDate ? "important" : "reference",
    actionRequired: task.visibility === "unknown" ? "uncertain" : applicable && task.dueDate && !task.completionDate ? "yes" : "no",
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

export interface OnTrackSyncOptions {
  full?: boolean;
  /** Counts projects whose tasks and feedback have finished. */
  onProgress?: (processed: number, total: number) => void;
}

export async function syncOnTrack(db: CoveDatabase, account: OnTrackAccount | null, options: OnTrackSyncOptions = {}): Promise<OnTrackSyncResult> {
  if (!account) throw new Error("OnTrack 还没有登录。在终端运行 ontrack login。");
  if (!Number.isSafeInteger(account.userId) || account.userId <= 0) throw new Error("OnTrack 未提供有效的账户身份，请重新登录。");
  const identity = await onTrackCacheIdentity();
  const currentAccount = await fetchOnTrackAccount();
  const assertIdentity = async (): Promise<void> => {
    if (!identity || await onTrackCacheIdentity() !== identity) throw new Error("OnTrack 连接已更改，请重新同步。");
  };
  await assertIdentity();
  if (!currentAccount || currentAccount.userId !== account.userId || currentAccount.baseUrl !== account.baseUrl) {
    throw new Error("OnTrack 连接已更改，请重新同步。");
  }

  const baseUrl = account.baseUrl;
  const projects = await fetchOnTrackProjects();
  await assertIdentity();
  const cutoff = Date.now() - FEEDBACK_RETENTION_DAYS * 24 * 3_600_000;
  const scanKey = `ontrack_comment_scan_v2:${hash(`${baseUrl}\0${account.userId}`)}`;
  const scanned = new Set<string>(JSON.parse(db.getSetting(scanKey) ?? "[]") as string[]);
  let synced = 0;
  let tasksSeen = 0;
  let feedbackSeen = 0;
  let processed = 0;
  options.onProgress?.(0, projects.length);

  for (const project of projects) {
    const tasks = await fetchOnTrackTasks(project.id, project, { includeNonApplicable: options.full });
    await assertIdentity();
    tasksSeen += tasks.length;

    for (const task of tasks) {
      // Preserve existing instance IDs and keep newly discovered definitions stable
      // if OnTrack later creates an instance, including local read/correction state.
      const definitionKey = `task:project:${project.id}:definition:${task.taskDefinitionId}`;
      const sourceItemId = task.id !== null && !db.getItem(`ontrack:${definitionKey}`)
        ? `task:${task.id}` : definitionKey;
      db.upsertItem(taskItem(project.id, project.unitCode, task, baseUrl, sourceItemId));
      synced += 1;

      if (!task.taskDefinitionId || !task.isInstantiated) continue;
      const taskKey = `${project.id}:${task.taskDefinitionId}`;
      if (!options.full && scanned.has(taskKey) && task.numNewComments <= 0) continue;
      const comments = await fetchOnTrackComments(project.id, task.taskDefinitionId);
      await assertIdentity();
      const feedback = comments.filter(
        (comment) =>
          Boolean(comment.id) &&
          comment.authorId !== null &&
          comment.authorId !== account.userId &&
          comment.comment.trim() &&
          (comment.type === "text" || comment.type === "assessment") &&
          (options.full || !comment.createdAt || Date.parse(comment.createdAt) > cutoff),
      );
      for (const comment of feedback) {
        db.upsertItem(feedbackItem(project.id, project.unitCode, task, comment, baseUrl));
        synced += 1;
        feedbackSeen += 1;
      }
      scanned.add(taskKey);
    }
    options.onProgress?.(++processed, projects.length);
  }

  await assertIdentity();
  db.setSetting(scanKey, JSON.stringify([...scanned]));
  db.setSourceStatus("ontrack", "connected", new Date().toISOString(), null);
  db.setSetting("last_synced_at", new Date().toISOString());
  return { synced, projects: projects.length, tasks: tasksSeen, feedback: feedbackSeen };
}
