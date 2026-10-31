import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../db.js";
import { GmailClient, type GmailMessage, type GmailSyncClient } from "../sources/gmail.js";
import { GoogleOAuth } from "../oauth/google.js";
import { MemorySecretStore } from "../secrets.js";
import { syncGmail } from "../sync/gmail.js";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Gmail client", () => {
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
