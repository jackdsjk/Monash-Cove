import os from "node:os";
import path from "node:path";
import { createDatabase } from "../db.js";
import { triage } from "../triage/rules.js";

const dbPath = process.env.COVE_DB_PATH ?? path.join(os.homedir(), "Library", "Application Support", "Cove", "cove.sqlite");
const db = createDatabase({ dbPath, seed: false });
const items = db.listItems();
for (const item of items) {
  const result = triage({
    source: item.source,
    authorRole: item.authorRole,
    title: item.title,
    text: item.text,
    publishedAt: item.publishedAt,
    ...(item.source === "moodle" ? { kind: "assessment" as const } : {}),
  });
  db.upsertItem({
    id: item.id,
    source: item.source,
    sourceItemId: item.sourceItemId,
    course: item.course,
    title: item.title,
    authorRole: item.authorRole,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    url: item.url,
    dueAt: item.dueAt,
    deadlineKind: item.deadlineKind,
    contentHash: item.contentHash,
    contentType: result.contentType,
    importance: result.importance,
    actionRequired: result.actionRequired,
    openOriginal: result.openOriginal,
    evidenceQuote: result.evidenceQuote,
    text: item.text,
    triageVersion: result.triageVersion,
    model: result.model,
  });
}
const counts = (key: "importance" | "actionRequired") => {
  const result: Record<string, number> = {};
  for (const item of db.listItems()) result[item[key]] = (result[item[key]] ?? 0) + 1;
  return result;
};
console.log(JSON.stringify({ items: db.listItems().length, importance: counts("importance"), action: counts("actionRequired") }, null, 2));
db.close();
