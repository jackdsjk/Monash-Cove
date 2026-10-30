import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { CoveDatabase } from "../db.js";
import type { GmailSyncClient } from "../sources/gmail.js";
import { classify } from "../triage/model.js";

export interface GmailSyncResult {
  synced: number;
  historyId: string;
  mode: "backfill" | "history" | "full";
}

export async function syncGmail(
  db: CoveDatabase,
  client: GmailSyncClient,
  options: { maxMessages?: number; full?: boolean; onProgress?: (processed: number, total: number | null) => void } = {},
): Promise<GmailSyncResult> {
  const previous = db.getCursor("gmail", "history_id");
  let ids: string[] = [];
  let mode: "backfill" | "history" | "full" = "backfill";

  if (options.full && client.listAllMessageIds) {
    ids = await client.listAllMessageIds((processed) => options.onProgress?.(processed, null));
    mode = "full";
  } else if (previous && client.listHistoryMessageIds) {
    try {
      ids = await client.listHistoryMessageIds(previous);
      mode = "history";
    } catch {
      ids = await client.listMessageIds(options.maxMessages ?? 20);
    }
  } else {
    ids = await client.listMessageIds(options.maxMessages ?? 20);
  }

  let processed = 0;
  for (const id of ids) {
    // Full Gmail backfill can hit the 6,000 quota-units/minute per-user limit.
    // 100 ms between 5-unit message reads keeps us around 3,000 units/minute.
    if (mode === "full") await sleep(100);
    const message = await client.getMessage(id);
    const result = await classify({
      source: "gmail",
      authorRole: "unknown",
      title: message.subject,
      text: message.text,
      publishedAt: message.publishedAt,
    });
    const hash = createHash("sha256").update(message.text).digest("hex");
    db.upsertItem({
      id: `gmail:${message.id}`,
      source: "gmail",
      sourceItemId: message.id,
      course: "",
      title: message.subject,
      authorRole: "unknown",
      publishedAt: message.publishedAt,
      updatedAt: message.publishedAt,
      url: message.url,
      contentHash: hash,
      contentType: result.contentType,
      importance: result.importance,
      actionRequired: result.actionRequired,
      openOriginal: result.openOriginal,
      evidenceQuote: result.evidenceQuote,
      text: message.text,
      triageVersion: result.triageVersion,
      model: result.model,
    });
    processed += 1;
    options.onProgress?.(processed, ids.length);
  }

  const historyId = await client.getHistoryId();
  db.removeFixtures("gmail");
  db.setCursor("gmail", "history_id", historyId);
  const at = new Date().toISOString();
  if (mode === "full") db.setSetting("gmail_full_synced_at", at);
  db.setSourceStatus("gmail", "connected", at, null);
  db.setSetting("last_synced_at", at);
  return { synced: ids.length, historyId, mode };
}
