import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createDatabase, type CoveDatabase } from "../db.js";
import { MemorySecretStore } from "../secrets.js";
import type { GmailMessage, GmailSyncClient } from "../sources/gmail.js";
import { syncGmail } from "../sync/gmail.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cove-changes-flow-"));
  dbPath = path.join(dir, "cove.sqlite");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A Gmail client that always reports the same single message, so a second
 *  sync run re-reads an item that already exists in the store. */
function gmailClient(message: GmailMessage): GmailSyncClient {
  return {
    listMessageIds: async () => [message.id],
    getMessage: async () => message,
    getHistoryId: async () => "history-1",
  };
}

function message(overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: "18f0a1",
    threadId: "18f0a1",
    subject: "Assignment 3 parts A and B: requirements updated",
    from: "unit@monash.edu",
    fromName: "Teaching team",
    publishedAt: "2026-11-06T00:00:00.000Z",
    text: "Part B must now include a short comparison table.",
    url: "https://mail.example.test/18f0a1",
    ...overrides,
  };
}

describe("change tracking through a real sync run", () => {
  it("records nothing on the first sync, then records edits on the next one", async () => {
    const db: CoveDatabase = createDatabase({ dbPath, seed: false });

    await syncGmail(db, gmailClient(message()));
    expect(db.listChanges()).toHaveLength(0);

    await syncGmail(
      db,
      gmailClient(
        message({
          subject: "Assignment 3: Part B now needs a comparison table",
          text: "Part B must now include a short comparison table and a reflection.",
        }),
      ),
    );

    const changes = db.listChanges();
    expect(changes.map((change) => change.field).sort()).toEqual(["text", "title"]);
    expect(changes.find((change) => change.field === "title")).toMatchObject({
      before: "Assignment 3 parts A and B: requirements updated",
      after: "Assignment 3: Part B now needs a comparison table",
      source: "gmail",
    });

    // A third identical sync must stay quiet.
    await syncGmail(
      db,
      gmailClient(
        message({
          subject: "Assignment 3: Part B now needs a comparison table",
          text: "Part B must now include a short comparison table and a reflection.",
        }),
      ),
    );
    expect(db.listChanges()).toHaveLength(2);

    db.close();
  });

  it("serves the recorded changes over the local API", async () => {
    const db = createDatabase({ dbPath, seed: false });
    await syncGmail(db, gmailClient(message()));
    await syncGmail(db, gmailClient(message({ subject: "Assignment 3: due date moved" })));
    db.close();

    let app: FastifyInstance | undefined;
    try {
      app = buildApp({ dbPath, seed: false, secretStore: new MemorySecretStore() });

      const response = await app.inject({ method: "GET", url: "/api/changes" });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { changes: Array<Record<string, unknown>>; since: string | null };
      expect(body.since).toBeNull();
      expect(body.changes).toHaveLength(1);
      expect(body.changes[0]).toMatchObject({
        field: "title",
        before: "Assignment 3 parts A and B: requirements updated",
        after: "Assignment 3: due date moved",
        course: "",
      });

      const future = await app.inject({ method: "GET", url: "/api/changes?since=2999-01-01T00:00:00.000Z" });
      expect((future.json() as { changes: unknown[] }).changes).toHaveLength(0);

      const past = await app.inject({ method: "GET", url: "/api/changes?since=2000-01-01T00:00:00.000Z" });
      expect((past.json() as { changes: unknown[] }).changes).toHaveLength(1);

      const invalid = await app.inject({ method: "GET", url: "/api/changes?limit=0" });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app?.close();
    }
  });
});
