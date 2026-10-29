import { parse } from "node-html-parser";

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  publishedAt: string;
  text: string;
  url: string;
}

export interface GmailSyncClient {
  listMessageIds(maxResults?: number): Promise<string[]>;
  listHistoryMessageIds?(startHistoryId: string): Promise<string[]>;
  getMessage(id: string): Promise<GmailMessage>;
  getHistoryId(): Promise<string>;
}

interface GmailPayload {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string };
  parts?: GmailPayload[];
}

interface GmailApiMessage {
  id?: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPayload;
  snippet?: string;
}

export class GmailError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GmailError";
  }
}

export class GmailClient implements GmailSyncClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string): Promise<T> {
    const response = await this.fetcher(`https://gmail.googleapis.com/gmail/v1${path}`, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) throw new GmailError(response.status, `Gmail API returned HTTP ${response.status}.`);
    return (await response.json()) as T;
  }

  async getHistoryId(): Promise<string> {
    const profile = await this.request<{ historyId?: string }>("/users/me/profile");
    if (!profile.historyId) throw new GmailError(502, "Gmail profile did not include historyId.");
    return profile.historyId;
  }

  async listMessageIds(maxResults = 20): Promise<string[]> {
    const data = await this.request<{ messages?: Array<{ id?: string }> }>(
      `/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
    );
    return (data.messages ?? []).map((message) => message.id).filter((id): id is string => Boolean(id));
  }

  async listHistoryMessageIds(startHistoryId: string): Promise<string[]> {
    const data = await this.request<{
      history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
    }>(`/users/me/history?startHistoryId=${encodeURIComponent(startHistoryId)}&historyTypes=messageAdded`);
    const ids = (data.history ?? []).flatMap((entry) => (entry.messagesAdded ?? []).map((added) => added.message?.id));
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
  }

  async getMessage(id: string): Promise<GmailMessage> {
    const message = await this.request<GmailApiMessage>(`/users/me/messages/${encodeURIComponent(id)}?format=full`);
    const headers = new Map((message.payload?.headers ?? []).map((header) => [header.name?.toLowerCase() ?? "", header.value ?? ""]));
    const text = extractText(message.payload) || message.snippet || "";
    const publishedAt = message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date().toISOString();
    return {
      id: message.id ?? id,
      threadId: message.threadId ?? "",
      subject: headers.get("subject") ?? "(no subject)",
      from: headers.get("from") ?? "unknown",
      publishedAt,
      text,
      url: `https://mail.google.com/mail/u/0/#inbox/${message.id ?? id}`,
    };
  }
}

function extractText(payload?: GmailPayload): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return parse(Buffer.from(payload.body.data, "base64url").toString("utf8")).text;
  }
  for (const part of payload.parts ?? []) {
    const text = extractText(part);
    if (text) return text;
  }
  return "";
}
