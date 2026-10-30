import { createHash } from "node:crypto";
import type { CoveDatabase } from "../db.js";
import type { NewItem, Source } from "../domain.js";
import type { EdRegion } from "../sources/ed.js";
import { EdClient } from "../sources/ed.js";
import { MoodleClient } from "../sources/moodle.js";
import { MoodleForumClient } from "../sources/moodle-forum.js";
import { classify } from "../triage/model.js";

interface RawSourceItem {
  id: string;
  sourceItemId: string;
  course: string;
  title: string;
  text: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
  dueAt?: string | null;
  deadlineKind?: string | null;
  kind?: "assessment" | "forum";
}

async function persist(db: CoveDatabase, source: Source, raw: RawSourceItem[], model = "deterministic-rules") {
  for (const item of raw) {
    const result = await classify({ source, authorRole: item.authorRole, title: item.title, text: item.text, kind: item.kind, publishedAt: item.publishedAt });
    const hash = createHash("sha256").update(item.text).digest("hex");
    const record: NewItem = {
      id: item.id,
      source,
      sourceItemId: item.sourceItemId,
      course: item.course,
      title: item.title,
      authorRole: item.authorRole,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt,
      url: item.url,
      dueAt: item.dueAt ?? null,
      deadlineKind: item.deadlineKind ?? null,
      contentHash: hash,
      contentType: result.contentType,
      importance: result.importance,
      actionRequired: result.actionRequired,
      openOriginal: result.openOriginal,
      evidenceQuote: result.evidenceQuote,
      text: item.text,
      triageVersion: result.triageVersion,
      model: result.model || model,
    };
    db.upsertItem(record);
  }
  db.removeFixtures(source);
  const at = new Date().toISOString();
  db.setSourceStatus(source, "connected", at, null);
  db.setSetting("last_synced_at", at);
  return { synced: raw.length };
}

export async function syncEd(
  db: CoveDatabase,
  token: string,
  region: EdRegion = "us",
  fetcher?: typeof fetch,
  options: { full?: boolean; onProgress?: (processed: number, total: number | null) => void } = {},
) {
  const client = new EdClient(token, region, fetcher ?? fetch);
  const raw = options.full
    ? await client.pullAll(options.onProgress)
    : await client.pull();
  if (options.full) db.setSetting("ed_full_synced_at", new Date().toISOString());
  return persist(db, "ed", raw);
}

export async function syncMoodle(db: CoveDatabase, baseUrl: string, session: string, fetcher?: typeof fetch) {
  const client = new MoodleClient(baseUrl, session, fetcher ?? fetch);
  const raw = await client.pull();
  return persist(db, "moodle", raw);
}

export async function syncMoodleForum(db: CoveDatabase, baseUrl: string, session: string, fetcher?: typeof fetch) {
  const client = new MoodleForumClient(baseUrl, session, fetcher ?? fetch);
  const raw = await client.pull();
  return persist(db, "moodle", raw);
}
