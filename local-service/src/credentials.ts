import type { Source } from "./domain.js";
import type { SecretStore } from "./secrets.js";
import { fetchOnTrackAccount } from "./sources/ontrack.js";

export interface CredentialInfo {
  source: Source;
  connected: boolean;
  /** When the stored credential stops working, if the platform tells us. */
  expiresAt: string | null;
  /** True when the app can renew without the user signing in again. */
  renewable: boolean;
  note: string;
}

interface Tokens {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

function parse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isoOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

/**
 * Every source keeps a credential with its own lifetime. The UI shows that
 * lifetime so a silent expiry is never a surprise: Gmail renews with a refresh
 * token, OnTrack mints short-lived tokens from a refresh cookie, and the
 * session-cookie sources simply stop working when the cookie dies.
 */
export async function describeCredentials(secrets: SecretStore): Promise<CredentialInfo[]> {
  const [gmailRaw, edRaw, moodleRaw, onTrackRaw] = await Promise.all([
    secrets.get("gmail-oauth-tokens"),
    secrets.get("ed-credentials"),
    secrets.get("moodle-credentials"),
    secrets.get("ontrack-credentials"),
  ]);

  const gmail = parse(gmailRaw) as Tokens | null;
  const ed = parse(edRaw);
  const moodle = parse(moodleRaw);
  const onTrack = parse(onTrackRaw);

  // A CLI session can be a working login without a stored refresh cookie.
  const onTrackSession = onTrack?.refreshToken ? null : await fetchOnTrackAccount().catch(() => null);

  return [
    {
      source: "gmail",
      connected: Boolean(gmail?.access_token || gmail?.refresh_token),
      expiresAt: isoOrNull(gmail?.expires_at),
      renewable: Boolean(gmail?.refresh_token),
      note: gmail?.refresh_token
        ? "Google 授权可自动续期，不会中途失效"
        : "只有短时 access token，约一小时后需要重新授权",
    },
    {
      source: "ed",
      connected: Boolean(ed?.token),
      expiresAt: isoOrNull(ed?.expiresAt),
      renewable: false,
      note: "长期 token，平台不公布到期时间；失效时同步会报错，需要重新粘贴",
    },
    {
      source: "moodle",
      connected: Boolean(moodle?.session || moodle?.cookie),
      expiresAt: isoOrNull(moodle?.expiresAt),
      renewable: false,
      note: moodle?.expiresAt
        ? "Moodle 会话 Cookie，到期需要重新登录"
        : "Moodle 会话 Cookie，平台未给到期时间；失效时同步会报错",
    },
    {
      source: "ontrack",
      connected: Boolean(onTrack?.refreshToken) || Boolean(onTrackSession),
      // The CLI session only caches a ten-minute access token; it renews itself,
      // so that timestamp is not the login lifetime.
      expiresAt: isoOrNull(onTrack?.expiresAt),
      renewable: Boolean(onTrack?.refreshToken),
      note: onTrack?.refreshToken
        ? "刷新凭据可自动换取短时 token，不用反复登录"
        : onTrackSession
          ? "当前登录来自本机的 CLI 会话缓存，到期后需要重新登录；用登录助手连接后会一直自动续期"
          : "还没有通过登录助手连接",
    },
  ];
}
