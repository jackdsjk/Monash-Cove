import { createHash, randomBytes } from "node:crypto";
import type { SecretStore } from "../secrets.js";
import { GmailClient } from "../sources/gmail.js";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
  expires_in?: number;
}

interface Pending {
  verifier: string;
  createdAt: number;
}

const TOKEN_KEY = "gmail-oauth-tokens";

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

export class GoogleOAuth {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly config: GoogleOAuthConfig | null,
    private readonly secrets: SecretStore,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  get configured() {
    return Boolean(this.config?.clientId && this.config.clientSecret);
  }

  async connected() {
    return Boolean(await this.secrets.get(TOKEN_KEY));
  }

  start(): string {
    if (!this.configured || !this.config) throw new OAuthError("not_configured", "Google OAuth is not configured.", false);
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(48));
    this.pending.set(state, { verifier, createdAt: Date.now() });
    for (const [key, value] of this.pending) {
      if (Date.now() - value.createdAt > 10 * 60_000) this.pending.delete(key);
    }
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, state: string) {
    if (!this.config) throw new OAuthError("not_configured", "Google OAuth is not configured.");
    const pending = this.pending.get(state);
    if (!pending) throw new OAuthError("invalid_state", "OAuth state is missing or expired.");
    this.pending.delete(state);
    const body = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: pending.verifier,
    });
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new OAuthError("token_exchange_failed", `Google token endpoint returned HTTP ${response.status}.`, true);
    const tokens = (await response.json()) as Tokens;
    if (!tokens.access_token) throw new OAuthError("token_invalid", "Google did not return an access token.");
    await this.secrets.set(TOKEN_KEY, JSON.stringify({ ...tokens, expires_at: Date.now() + (tokens.expires_in ?? 3500) * 1000 }));
  }

  async accessToken(): Promise<string> {
    const raw = await this.secrets.get(TOKEN_KEY);
    if (!raw) throw new OAuthError("not_connected", "Gmail is not connected yet.");
    const tokens = JSON.parse(raw) as Tokens;
    if (tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
    if (!tokens.refresh_token || !this.config) throw new OAuthError("expired", "Gmail authorization expired; reconnect Gmail.");
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    });
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new OAuthError("refresh_failed", "Gmail refresh failed; reconnect Gmail.", true);
    const next = (await response.json()) as Tokens;
    const updated = { ...tokens, ...next, refresh_token: next.refresh_token ?? tokens.refresh_token, expires_at: Date.now() + (next.expires_in ?? 3500) * 1000 };
    await this.secrets.set(TOKEN_KEY, JSON.stringify(updated));
    return updated.access_token;
  }

  async client(): Promise<GmailClient> {
    return new GmailClient(await this.accessToken(), this.fetcher);
  }

  async disconnect() {
    await this.secrets.delete(TOKEN_KEY);
  }
}

function base64url(buffer: Buffer) {
  return buffer.toString("base64url");
}
