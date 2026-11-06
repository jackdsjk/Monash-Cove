import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type CoveDatabase } from "../db.js";
import type { NewItem } from "../domain.js";

let db: CoveDatabase;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cove-changes-"));
  db = createDatabase({ dbPath: path.join(dir, "cove.sqlite"), seed: false });
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function item(overrides: Partial<NewItem> = {}): NewItem {
  return {
    id: "gmail-1",
    source: "gmail",
    sourceItemId: "gmail-1",
    course: "FIT1047",
    title: "Assignment 3 requirements updated",
    authorRole: "staff",
    publishedAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
    url: "https://example.test/1",
    dueAt: "2026-11-07T03:30:00.000Z",
    deadlineKind: "assignment",
    completedAt: null,
    contentHash: "hash-a",
    contentType: "requirement_change",
    importance: "critical",
    actionRequired: "yes",
    openOriginal: "required",
    triageVersion: "1",
    model: "test",
    text: "Part B must now include a comparison table.",
    evidenceQuote: "Part B must now include a comparison table.",
    ...overrides,
  };
}

describe("item change tracking", () => {
  it("records nothing for a first insert", () => {
    db.upsertItem(item());
    expect(db.listChanges()).toHaveLength(0);
  });

  it("records a due date change with before and after", () => {
    db.upsertItem(item());
    db.upsertItem(item({ dueAt: "2026-11-09T03:30:00.000Z" }));

    const changes = db.listChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      itemId: "gmail-1",
      field: "due_at",
      before: "2026-11-07T03:30:00.000Z",
      after: "2026-11-09T03:30:00.000Z",
      course: "FIT1047",
      source: "gmail",
    });
  });

  it("records title and body edits without duplicating unchanged fields", () => {
    db.upsertItem(item());
    db.upsertItem(item({ title: "Assignment 3: due date moved", text: "New body." }));

    const fields = db.listChanges().map((change) => change.field).sort();
    expect(fields).toEqual(["text", "title"]);
  });

  it("records nothing when a re-sync returns identical content", () => {
    db.upsertItem(item());
    db.upsertItem(item());
    expect(db.listChanges()).toHaveLength(0);
  });

  it("filters by since and caps the limit", () => {
    db.upsertItem(item());
    db.upsertItem(item({ dueAt: "2026-11-09T03:30:00.000Z" }));

    expect(db.listChanges({ since: "2999-01-01T00:00:00.000Z" })).toHaveLength(0);
    expect(db.listChanges({ since: "2000-01-01T00:00:00.000Z" })).toHaveLength(1);
    expect(db.listChanges({ limit: 1 })).toHaveLength(1);
  });

  it("drops change rows past the retention window", () => {
    db.upsertItem(item());
    db.upsertItem(item({ dueAt: "2026-11-09T03:30:00.000Z" }));
    expect(db.listChanges()).toHaveLength(1);

    // Age the row instead of racing the clock: a freshly written row is within
    // any retention window, so pruning it immediately proves nothing.
    db.db.prepare("UPDATE item_changes SET changed_at = ?").run("2020-01-01T00:00:00.000Z");
    db.pruneChanges(90);
    expect(db.listChanges()).toHaveLength(0);
  });
});
