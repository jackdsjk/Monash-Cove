import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { BriefResponse, FixtureItem, NewItem, Source, SourceStatus, StoredItem } from "./domain.js";

const SOURCE_LABELS: Record<Source, string> = { gmail: "Gmail", ed: "Ed", moodle: "Moodle" };
const SOURCE_IDS: Source[] = ["gmail", "ed", "moodle"];
const DEFAULT_FIXTURE = fileURLToPath(new URL("../fixtures/items.json", import.meta.url));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  last_sync_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  course TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'unknown',
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  importance TEXT NOT NULL,
  action_required TEXT NOT NULL,
  open_original TEXT NOT NULL,
  triage_version TEXT NOT NULL,
  model TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(source, source_item_id)
);
CREATE TABLE IF NOT EXISTS item_content (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  evidence_quote TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_cursors (
  source TEXT NOT NULL,
  cursor_key TEXT NOT NULL,
  cursor_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(source, cursor_key)
);
CREATE TABLE IF NOT EXISTS corrections (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  pinned INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0,
  feedback_reason TEXT,
  feedback_note TEXT,
  feedback_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reads (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_published ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS items_source ON items(source);
`;

export interface DbOptions {
  dbPath: string;
  fixturePath?: string;
  seed?: boolean;
}

export class CoveDatabase {
  readonly db: DatabaseSync;
  private readonly fixturePath: string;

  constructor(options: DbOptions) {
    this.db = new DatabaseSync(options.dbPath);
    this.fixturePath = options.fixturePath ?? DEFAULT_FIXTURE;
    this.db.exec(SCHEMA);
    this.ensureSources();
    if (options.seed !== false) this.seedFixture();
  }

  close() {
    this.db.close();
  }

  private ensureSources() {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO sources (id, label, status, last_sync_at, last_error) VALUES (?, ?, 'fixture', NULL, NULL)",
    );
    for (const source of SOURCE_IDS) insert.run(source, SOURCE_LABELS[source]);
  }

  seedFixture() {
    const data = JSON.parse(readFileSync(this.fixturePath, "utf8")) as { items: FixtureItem[] };
    const now = Date.now();
    const insertItem = this.db.prepare(`
      INSERT OR IGNORE INTO items (
        id, source, source_item_id, course, title, author_role, published_at, updated_at, url,
        content_hash, content_type, importance, action_required, open_original, triage_version,
        model, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertContent = this.db.prepare(
      "INSERT OR IGNORE INTO item_content (item_id, text, evidence_quote) VALUES (?, ?, ?)",
    );
    for (const item of data.items) {
      const publishedAt = new Date(now - item.ageHours * 3_600_000).toISOString();
      const hash = createHash("sha256").update(item.text).digest("hex");
      insertItem.run(
        item.id,
        item.source,
        item.id,
        item.course ?? "",
        item.title,
        item.authorRole,
        publishedAt,
        publishedAt,
        "",
        hash,
        item.contentType,
        item.importance,
        item.actionRequired,
        item.openOriginal,
        "fixture-1",
        "gpt-5.6-luna-2026-10-29",
        publishedAt,
        publishedAt,
      );
      insertContent.run(item.id, item.text, item.evidenceQuote);
    }
    this.setSourceStatus("gmail", "fixture", new Date().toISOString(), null);
    this.setSourceStatus("ed", "fixture", new Date().toISOString(), null);
    this.setSourceStatus("moodle", "fixture", new Date().toISOString(), null);
  }

  setSourceStatus(source: Source, status: SourceStatus["status"], lastSyncAt: string | null, lastError: string | null) {
    this.db
      .prepare("UPDATE sources SET status = ?, last_sync_at = ?, last_error = ? WHERE id = ?")
      .run(status, lastSyncAt, lastError, source);
  }

  listSources(): SourceStatus[] {
    const rows = this.db.prepare("SELECT * FROM sources ORDER BY id").all() as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const id = String(row.id) as Source;
      const count = this.db.prepare("SELECT COUNT(*) AS n FROM items WHERE source = ? AND deleted_at IS NULL").get(id) as { n: number };
      return {
        id,
        label: String(row.label),
        status: String(row.status) as SourceStatus["status"],
        lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
        lastError: row.last_error ? String(row.last_error) : null,
        itemCount: count.n,
      };
    });
  }

  upsertItem(item: NewItem) {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO items (
          id, source, source_item_id, course, title, author_role, published_at, updated_at, url,
          content_hash, content_type, importance, action_required, open_original, triage_version,
          model, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          course = excluded.course,
          title = excluded.title,
          author_role = excluded.author_role,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at,
          url = excluded.url,
          content_hash = excluded.content_hash,
          content_type = excluded.content_type,
          importance = excluded.importance,
          action_required = excluded.action_required,
          open_original = excluded.open_original,
          triage_version = excluded.triage_version,
          model = excluded.model,
          last_seen_at = excluded.last_seen_at,
          deleted_at = NULL
      `)
      .run(
        item.id,
        item.source,
        item.sourceItemId,
        item.course,
        item.title,
        item.authorRole,
        item.publishedAt,
        item.updatedAt,
        item.url,
        item.contentHash,
        item.contentType,
        item.importance,
        item.actionRequired,
        item.openOriginal,
        item.triageVersion,
        item.model,
        now,
        now,
      );
    this.db
      .prepare(`
        INSERT INTO item_content (item_id, text, evidence_quote) VALUES (?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET text = excluded.text, evidence_quote = excluded.evidence_quote
      `)
      .run(item.id, item.text, item.evidenceQuote);
  }

  setCursor(source: Source, key: string, value: string) {
    this.db
      .prepare(`
        INSERT INTO sync_cursors (source, cursor_key, cursor_value, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(source, cursor_key) DO UPDATE SET cursor_value = excluded.cursor_value, updated_at = excluded.updated_at
      `)
      .run(source, key, value, new Date().toISOString());
  }

  getCursor(source: Source, key: string): string | null {
    const row = this.db.prepare("SELECT cursor_value FROM sync_cursors WHERE source = ? AND cursor_key = ?").get(source, key) as { cursor_value?: string } | undefined;
    return row?.cursor_value ?? null;
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string) {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  private baseQuery() {
    return `
      SELECT i.*, c.text, c.evidence_quote,
        r.item_id IS NOT NULL AS is_read,
        co.pinned, co.dismissed, co.feedback_reason, co.feedback_note, co.feedback_at
      FROM items i
      JOIN item_content c ON c.item_id = i.id
      LEFT JOIN reads r ON r.item_id = i.id
      LEFT JOIN corrections co ON co.item_id = i.id
      WHERE i.deleted_at IS NULL
    `;
  }

  listItems(options: { since?: string; source?: Source; query?: string } = {}): StoredItem[] {
    const clauses: string[] = [];
    const params: Array<string> = [];
    if (options.since) {
      clauses.push("i.published_at >= ?");
      params.push(options.since);
    }
    if (options.source) {
      clauses.push("i.source = ?");
      params.push(options.source);
    }
    if (options.query) {
      clauses.push("(i.title LIKE ? OR i.course LIKE ? OR c.text LIKE ?)");
      const like = `%${options.query}%`;
      params.push(like, like, like);
    }
    const where = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`${this.baseQuery()}${where} ORDER BY i.published_at DESC`)
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map(toStoredItem);
  }

  getItem(id: string): StoredItem | null {
    const row = this.db.prepare(`${this.baseQuery()} AND i.id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? toStoredItem(row) : null;
  }

  brief(options: { since?: string; source?: Source; query?: string } = {}): BriefResponse {
    return {
      items: this.listItems(options),
      sources: this.listSources(),
      syncedAt: this.getSetting("last_synced_at"),
      lastCheckedAt: this.getSetting("last_checked_at"),
    };
  }

  markChecked(ids: string[], at = new Date().toISOString()) {
    const insert = this.db.prepare("INSERT OR REPLACE INTO reads (item_id, read_at) VALUES (?, ?)");
    for (const id of ids) insert.run(id, at);
    this.setSetting("last_checked_at", at);
  }

  saveCorrection(
    id: string,
    correction: { pinned?: boolean; dismissed?: boolean; feedback?: { reason: string; note: string; at: string } },
  ) {
    const previous = this.db.prepare("SELECT * FROM corrections WHERE item_id = ?").get(id) as Record<string, unknown> | undefined;
    this.db
      .prepare(`
        INSERT INTO corrections (item_id, pinned, dismissed, feedback_reason, feedback_note, feedback_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
          pinned = excluded.pinned,
          dismissed = excluded.dismissed,
          feedback_reason = excluded.feedback_reason,
          feedback_note = excluded.feedback_note,
          feedback_at = excluded.feedback_at,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        correction.pinned ?? Boolean(previous?.pinned) ? 1 : 0,
        correction.dismissed ?? Boolean(previous?.dismissed) ? 1 : 0,
        correction.feedback?.reason ?? (previous?.feedback_reason as string | null) ?? null,
        correction.feedback?.note ?? (previous?.feedback_note as string | null) ?? null,
        correction.feedback?.at ?? (previous?.feedback_at as string | null) ?? null,
        new Date().toISOString(),
      );
    return this.getItem(id);
  }

  clearAll() {
    this.db.exec("DELETE FROM corrections; DELETE FROM reads; DELETE FROM sync_cursors; DELETE FROM settings; DELETE FROM item_content; DELETE FROM items;");
    for (const source of SOURCE_IDS) {
      this.setSourceStatus(source, "disconnected", null, null);
    }
  }

  counts() {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM items WHERE deleted_at IS NULL").get() as { n: number };
    return { items: row.n };
  }
}

function toStoredItem(row: Record<string, unknown>): StoredItem {
  const correction = row.pinned !== null || row.dismissed !== null
    ? {
        pinned: Boolean(row.pinned),
        dismissed: Boolean(row.dismissed),
        ...(row.feedback_reason
          ? { feedback: { reason: String(row.feedback_reason), note: String(row.feedback_note ?? ""), at: String(row.feedback_at ?? "") } }
          : {}),
      }
    : undefined;
  return {
    id: String(row.id),
    source: String(row.source) as Source,
    sourceItemId: String(row.source_item_id),
    course: String(row.course ?? ""),
    title: String(row.title),
    authorRole: String(row.author_role ?? "unknown"),
    publishedAt: String(row.published_at),
    updatedAt: String(row.updated_at),
    url: String(row.url ?? ""),
    ageHours: Math.max(0, (Date.now() - Date.parse(String(row.published_at))) / 3_600_000),
    contentHash: String(row.content_hash),
    contentType: String(row.content_type) as StoredItem["contentType"],
    importance: String(row.importance) as StoredItem["importance"],
    actionRequired: String(row.action_required) as StoredItem["actionRequired"],
    openOriginal: String(row.open_original) as StoredItem["openOriginal"],
    evidenceQuote: String(row.evidence_quote),
    text: String(row.text),
    triageVersion: String(row.triage_version),
    model: String(row.model),
    read: Boolean(row.is_read),
    ...(correction ? { correction } : {}),
  };
}

export function createDatabase(options: DbOptions): CoveDatabase {
  return new CoveDatabase(options);
}
