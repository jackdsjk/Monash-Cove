import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { BriefResponse, FixtureItem, MoodleContentRow, NewItem, Source, SourceStatus, StoredItem } from "./domain.js";

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
  due_at TEXT,
  deadline_kind TEXT,
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
CREATE TABLE IF NOT EXISTS moodle_content (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  section_number INTEGER NOT NULL,
  section_title TEXT NOT NULL,
  module TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS moodle_content_course ON moodle_content(course_id, section_number);
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
    this.ensureColumns();
    this.ensureSources();
    if (options.seed !== false) this.seedFixture();
  }

  close() {
    this.db.close();
  }

  private ensureColumns() {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(items)").all() as Array<{ name?: string }>).map((column) => column.name),
    );
    if (!columns.has("due_at")) this.db.exec("ALTER TABLE items ADD COLUMN due_at TEXT");
    if (!columns.has("deadline_kind")) this.db.exec("ALTER TABLE items ADD COLUMN deadline_kind TEXT");
  }

  private ensureSources() {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO sources (id, label, status, last_sync_at, last_error) VALUES (?, ?, 'fixture', NULL, NULL)",
    );
    for (const source of SOURCE_IDS) insert.run(source, SOURCE_LABELS[source]);
  }

  seedFixture() {
    const connectedRows = this.db.prepare("SELECT id FROM sources WHERE status = 'connected'").all() as Array<{ id: string }>;
    const connected = new Set(connectedRows.map((row) => row.id));
    for (const source of connected) this.removeFixtures(source as Source);
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
      if (connected.has(item.source)) continue;
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
    for (const source of SOURCE_IDS) {
      if (!connected.has(source)) this.setSourceStatus(source, "fixture", new Date().toISOString(), null);
    }
  }

  removeFixtures(source: Source) {
    this.db.exec(`DELETE FROM item_content WHERE item_id IN (SELECT id FROM items WHERE source = '${source}' AND triage_version = 'fixture-1')`);
    this.db.prepare("DELETE FROM items WHERE source = ? AND triage_version = 'fixture-1'").run(source);
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
      const contentCount = id === "moodle"
        ? (this.db.prepare("SELECT COUNT(*) AS n FROM moodle_content").get() as { n: number }).n
        : 0;
      return {
        id,
        label: String(row.label),
        status: String(row.status) as SourceStatus["status"],
        lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
        lastError: row.last_error ? String(row.last_error) : null,
        itemCount: count.n,
        contentCount,
      };
    });
  }

  upsertItem(item: NewItem) {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO items (
          id, source, source_item_id, course, title, author_role, published_at, updated_at, url,
          due_at, deadline_kind, content_hash, content_type, importance, action_required, open_original, triage_version,
          model, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          course = excluded.course,
          title = excluded.title,
          author_role = excluded.author_role,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at,
          url = excluded.url,
          due_at = excluded.due_at,
          deadline_kind = excluded.deadline_kind,
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
        item.dueAt ?? null,
        item.deadlineKind ?? null,
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

  replaceMoodleContent(courseId: string, rows: MoodleContentRow[]) {
    this.db.prepare("DELETE FROM moodle_content WHERE course_id = ?").run(courseId);
    const insert = this.db.prepare(`
      INSERT INTO moodle_content (id, course_id, course_name, section_number, section_title, module, title, url, text, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      insert.run(row.id, row.courseId, row.courseName, row.sectionNumber, row.sectionTitle, row.module, row.title, row.url, row.text, row.updatedAt);
    }
  }

  listAttendanceItems(): Array<{ id: string; source: "gmail" | "ed"; course: string; title: string; text: string; url: string; publishedAt: string }> {
    const rows = this.db.prepare(`
      SELECT i.id, i.source, i.course, i.title, i.published_at, i.url, c.text
      FROM items i JOIN item_content c ON c.item_id = i.id
      WHERE i.deleted_at IS NULL AND (
        lower(i.title) LIKE '%attendance%' OR lower(c.text) LIKE '%attendance%'
      )
      ORDER BY i.published_at DESC
    `).all() as Array<Record<string, unknown>>;
    return rows
      .filter((row) => row.source === "gmail" || row.source === "ed")
      .map((row) => ({
        id: String(row.id),
        source: String(row.source) as "gmail" | "ed",
        course: String(row.course ?? ""),
        title: String(row.title ?? ""),
        text: String(row.text ?? ""),
        url: String(row.url ?? ""),
        publishedAt: String(row.published_at ?? ""),
      }));
  }

  listAllMoodleContent(): MoodleContentRow[] {
    const rows = this.db.prepare("SELECT * FROM moodle_content ORDER BY course_name, section_number, title").all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      courseId: String(row.course_id),
      courseName: String(row.course_name),
      sectionNumber: Number(row.section_number),
      sectionTitle: String(row.section_title),
      module: String(row.module),
      title: String(row.title),
      url: String(row.url),
      text: String(row.text ?? ""),
      updatedAt: String(row.updated_at),
    }));
  }

  listMoodleContent(courseId: string): MoodleContentRow[] {
    const rows = this.db
      .prepare("SELECT * FROM moodle_content WHERE course_id = ? ORDER BY section_number, title")
      .all(courseId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      courseId: String(row.course_id),
      courseName: String(row.course_name),
      sectionNumber: Number(row.section_number),
      sectionTitle: String(row.section_title),
      module: String(row.module),
      title: String(row.title),
      url: String(row.url),
      text: String(row.text ?? ""),
      updatedAt: String(row.updated_at),
    }));
  }

  clearAll() {
    this.db.exec("DELETE FROM corrections; DELETE FROM reads; DELETE FROM sync_cursors; DELETE FROM settings; DELETE FROM item_content; DELETE FROM items; DELETE FROM moodle_content;");
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
    dueAt: row.due_at ? String(row.due_at) : null,
    deadlineKind: row.deadline_kind ? String(row.deadline_kind) : null,
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
