import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../db.js";
import { GmailClient, GmailError, type GmailMessage, type GmailSyncClient } from "../sources/gmail.js";
import { GoogleOAuth } from "../oauth/google.js";
import { MemorySecretStore } from "../secrets.js";
import { syncGmail } from "../sync/gmail.js";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function gmailMessage(id: string): GmailMessage {
  return {
    id,
    threadId: id,
    subject: "Course announcement",
    from: "staff@example.edu",
    fromName: "Teaching Staff",
    publishedAt: "2026-10-29T10:00:00.000Z",
    text: "The course materials are available.",
    url: `https://mail.google.com/mail/u/0/#inbox/${id}`,
  };
}

describe("Gmail client", () => {
  it("reads every history page and deduplicates messages across records and pages", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("startHistoryId")).toBe("history/1");
      expect(url.searchParams.get("historyTypes")).toBe("messageAdded");
      if (url.searchParams.get("pageToken") === "page/2") {
        return jsonResponse({ history: [{ messagesAdded: [{ message: { id: "m-1" } }, { message: { id: "m-2" } }] }] });
      }
      return jsonResponse({
        history: [{ messagesAdded: [{ message: { id: "m-1" } }, { message: {} }] }, { messagesAdded: [{ message: { id: "m-1" } }] }],
        nextPageToken: "page/2",
      });
    }) as unknown as typeof fetch;
    expect(await new GmailClient("token", fetcher).listHistoryMessageIds("history/1")).toEqual(["m-1", "m-2"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("parses a message payload and decodes text", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/profile")) return jsonResponse({ historyId: "h-1" });
      if (url.includes("/messages?")) return jsonResponse({ messages: [{ id: "m-1" }] });
      return jsonResponse({
        id: "m-1",
        threadId: "t-1",
        internalDate: "1760000000000",
        payload: {
          mimeType: "text/plain",
          headers: [
            { name: "Subject", value: "A subject" },
            { name: "From", value: "staff@example.edu" },
          ],
          body: { data: Buffer.from("A body sentence. Another sentence.").toString("base64url") },
        },
      });
    }) as unknown as typeof fetch;

    const client = new GmailClient("token", fetcher);
    expect(await client.getHistoryId()).toBe("h-1");
    expect(await client.listMessageIds()).toEqual(["m-1"]);
    const message = await client.getMessage("m-1");
    expect(message.subject).toBe("A subject");
    expect(message.text).toContain("A body sentence.");
    expect(message.url).toContain("m-1");
  });
});

describe("Gmail sync", () => {
  it.each([false, true])("keeps mail arriving during a %s full backfill for the next sync", async (full) => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    let currentHistory = "history-1";
    const client: GmailSyncClient = {
      listMessageIds: async () => ["m-1"],
      listAllMessageIds: async () => ["m-1"],
      getHistoryId: async () => currentHistory,
      getMessage: async (id) => {
        if (id === "m-1") currentHistory = "history-2";
        return gmailMessage(id);
      },
      listHistoryMessageIds: async (since) => since === "history-1" ? ["m-2"] : [],
    };
    try {
      await syncGmail(db, client, { full });
      expect(db.getCursor("gmail", "history_id")).toBe("history-1");
      await syncGmail(db, client);
      expect(db.listItems().map((item) => item.id).sort()).toEqual(["gmail:m-1", "gmail:m-2"]);
      expect(db.getCursor("gmail", "history_id")).toBe("history-2");
    } finally {
      db.close();
    }
  });

  it("keeps mail arriving during history processing for the next sync", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    db.setCursor("gmail", "history_id", "history-1");
    let currentHistory = "history-2";
    const client: GmailSyncClient = {
      listMessageIds: vi.fn(async () => []),
      getHistoryId: async () => currentHistory,
      listHistoryMessageIds: async (since) => since === "history-1" ? ["m-1"] : since === "history-2" ? ["m-2"] : [],
      getMessage: async (id) => {
        if (id === "m-1") currentHistory = "history-3";
        return gmailMessage(id);
      },
    };
    try {
      await syncGmail(db, client);
      expect(db.getCursor("gmail", "history_id")).toBe("history-2");
      await syncGmail(db, client);
      expect(db.listItems().map((item) => item.id).sort()).toEqual(["gmail:m-1", "gmail:m-2"]);
      expect(db.getCursor("gmail", "history_id")).toBe("history-3");
    } finally {
      db.close();
    }
  });

  it("does not replace a failed history page with a limited inbox or advance the cursor", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    db.setCursor("gmail", "history_id", "history-1");
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/profile")) return jsonResponse({ historyId: "history-3" });
      if (url.includes("pageToken=")) return new Response("Service unavailable", { status: 503 });
      if (url.includes("/history?")) return jsonResponse({ history: [{ messagesAdded: [{ message: { id: "m-1" } }] }], nextPageToken: "page-2" });
      throw new Error("Unexpected inbox fallback or message read");
    }) as unknown as typeof fetch;
    try {
      await expect(syncGmail(db, new GmailClient("token", fetcher))).rejects.toMatchObject({ status: 503 });
      expect(db.getCursor("gmail", "history_id")).toBe("history-1");
      expect(db.listItems()).toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      db.close();
    }
  });

  it("recovers an expired history cursor with a complete backfill", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    db.setCursor("gmail", "history_id", "expired");
    const client: GmailSyncClient = {
      listMessageIds: vi.fn(async () => ["m-1"]),
      listAllMessageIds: vi.fn(async () => ["m-1", "m-2"]),
      listHistoryMessageIds: async () => { throw new GmailError(404, "Expired history"); },
      getHistoryId: async () => "history-2",
      getMessage: async (id) => gmailMessage(id),
    };
    try {
      expect((await syncGmail(db, client)).mode).toBe("full");
      expect(client.listMessageIds).not.toHaveBeenCalled();
      expect(client.listAllMessageIds).toHaveBeenCalledOnce();
      expect(db.listItems()).toHaveLength(2);
      expect(db.getCursor("gmail", "history_id")).toBe("history-2");
    } finally {
      db.close();
    }
  });

  it.each([false, true])("leaves the cursor unchanged when a message read fails (existing cursor: %s)", async (existing) => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    if (existing) db.setCursor("gmail", "history_id", "history-1");
    const client: GmailSyncClient = {
      listMessageIds: async () => ["m-1", "m-2"],
      listHistoryMessageIds: async () => ["m-1", "m-2"],
      getHistoryId: async () => "history-2",
      getMessage: async (id) => {
        if (id === "m-2") throw new GmailError(503, "Unavailable");
        return gmailMessage(id);
      },
    };
    try {
      await expect(syncGmail(db, client)).rejects.toMatchObject({ status: 503 });
      expect(db.getCursor("gmail", "history_id")).toBe(existing ? "history-1" : null);
    } finally {
      db.close();
    }
  });

  it("removes fixture Gmail rows after the first real sync", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: true });
    const client: GmailSyncClient = {
      listMessageIds: async () => ["m-1"],
      getMessage: async () => ({
        id: "m-1",
        threadId: "t-1",
        subject: "Real message",
        from: "staff@example.edu",
        publishedAt: "2026-10-29T10:00:00.000Z",
        text: "A real message body.",
        url: "https://mail.google.com/mail/u/0/#inbox/m-1",
      }),
      getHistoryId: async () => "history-1",
    };
    await syncGmail(db, client);
    const gmail = db.listItems({ source: "gmail" });
    expect(gmail).toHaveLength(1);
    expect(gmail[0].id).toBe("gmail:m-1");
    db.close();
  });

  it("backfills once, then uses the history cursor", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const message: GmailMessage = {
      id: "m-1",
      threadId: "t-1",
      subject: "Deadline updated",
      from: "staff@example.edu",
      fromName: "Staff Member",
      publishedAt: "2026-10-29T10:00:00.000Z",
      text: "The submission deadline has changed to Friday.",
      url: "https://mail.google.com/mail/u/0/#inbox/m-1",
    };
    const client: GmailSyncClient = {
      listMessageIds: async () => ["m-1"],
      getMessage: async () => message,
      getHistoryId: async () => "history-1",
      listHistoryMessageIds: async () => [],
    };

    const first = await syncGmail(db, client);
    expect(first.mode).toBe("backfill");
    expect(first.synced).toBe(1);
    expect(db.listItems()).toHaveLength(1);
    expect(db.getCursor("gmail", "history_id")).toBe("history-1");

    const second = await syncGmail(db, client);
    expect(second.mode).toBe("history");
    expect(second.synced).toBe(0);
    expect(db.listItems()).toHaveLength(1);
    db.close();
  });
});

describe("Google OAuth", () => {
  it("creates a stateful authorization URL and exchanges the code", async () => {
    const secrets = new MemorySecretStore();
    const fetcher = vi.fn(async () =>
      jsonResponse({ access_token: "access", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer" }),
    ) as unknown as typeof fetch;
    const oauth = new GoogleOAuth(
      { clientId: "client", clientSecret: "secret", redirectUri: "http://127.0.0.1:4317/oauth/google/callback" },
      secrets,
      fetcher,
    );
    const url = new URL(oauth.start());
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state") ?? "";
    await oauth.handleCallback("code", state);
    expect(await oauth.accessToken()).toBe("access");
    expect(await oauth.connected()).toBe(true);
  });
});
