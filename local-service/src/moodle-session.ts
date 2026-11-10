import { z } from "zod";
import type { CoveDatabase } from "./db.js";
import type { SecretStore } from "./secrets.js";
import { moodleCookieHeader } from "./moodle-download.js";
import { MoodleClient } from "./sources/moodle.js";

/** Keyring / secrets-file key that holds the captured Moodle cookie jar. */
export const MOODLE_CREDENTIALS_KEY = "moodle-credentials";

/**
 * User-visible copy, written to `sources.last_error`. The Sources page matches
 * 「会话已过期」to swap「重新同步」for「重新登录」, so keep the wording in sync with
 * `SESSION_EXPIRED` in webapp/src/pages/SourcesPage.tsx.
 */
export const MOODLE_SESSION_EXPIRED_MESSAGE = "Moodle 会话已过期，需要重新登录";
export const MOODLE_CREDENTIALS_INVALID_MESSAGE = "Moodle 凭据已损坏或缺少 Cookie，已清除，请重新登录";

/** A session cookie dies silently, so check it on a timer instead of on failure. */
export const MOODLE_SESSION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Muster gives its background ping a 4s budget: a hung check is worse than a retry. */
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Shape accepted by `POST /api/sources/moodle/credentials` and by the login
 * assistant. Kept here so the writer and the validator cannot drift apart.
 */
export const moodleCredentials = z
  .object({
    baseUrl: z.string().url(),
    /** Raw MoodleSession value; still accepted for older saved credentials. */
    session: z.string().min(1).optional(),
    /** Full Cookie header captured by the login assistant. */
    cookie: z.string().min(1).optional(),
    /** Monash account behind the session; shown on the Sources page, never used to authenticate. */
    username: z.string().min(1).max(200).optional(),
  })
  .refine((value) => Boolean(value.session || value.cookie), { message: "session or cookie is required" });

export type MoodleCredentialsShape = z.infer<typeof moodleCredentials>;

export type MoodleSessionState = "absent" | "invalid" | "expired" | "valid" | "unreachable";

export type ParsedMoodleCredentials =
  | { ok: true; credentials: MoodleCredentialsShape; cookie: string }
  | { ok: false; reason: "absent" | "malformed" };

/**
 * Muster drops any session whose cookie list is empty; the header equivalent
 * is that no `name=value` pair carries a value. `MoodleSession=` or a blank
 * header is a torn write, not a login.
 */
export function hasMoodleCookieValue(header: string): boolean {
  return header.split(";").some((pair) => {
    const separator = pair.indexOf("=");
    return separator > 0 && pair.slice(0, separator).trim() !== "" && pair.slice(separator + 1).trim() !== "";
  });
}

/**
 * Split "no credentials at all" from "credentials we cannot use". Only the
 * second case is worth deleting: an absent credential is a normal disconnected
 * source, not a corrupt one.
 */
export function parseMoodleCredentials(raw: string | null): ParsedMoodleCredentials {
  if (!raw || !raw.trim()) return { ok: false, reason: "absent" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const parsed = moodleCredentials.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  let cookie: string;
  try {
    cookie = moodleCookieHeader(parsed.data);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!hasMoodleCookieValue(cookie)) return { ok: false, reason: "malformed" };
  return { ok: true, credentials: parsed.data, cookie };
}

function moodleSource(db: CoveDatabase) {
  return db.listSources().find((source) => source.id === "moodle");
}

/** Degrade without losing `last_sync_at`; the row still says when it last worked. */
export function degradeMoodleSession(db: CoveDatabase, message = MOODLE_SESSION_EXPIRED_MESSAGE) {
  db.setSourceStatus("moodle", "degraded", moodleSource(db)?.lastSyncAt ?? null, message);
}

/** The credentials are gone, so the account behind them is unknown too. */
export function disconnectMoodleSource(db: CoveDatabase, message = MOODLE_CREDENTIALS_INVALID_MESSAGE) {
  db.setSourceStatus("moodle", "disconnected", null, message);
  db.setSourceAccount("moodle", null);
}

/**
 * Muster's `is_logged_out_url`: a bounce to a login page or an external SSO
 * provider means the cookie is dead, even when the response is a 200.
 */
export function isLoggedOutUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("/login") ||
    lower.includes("okta.com") ||
    lower.includes("accounts.google.com") ||
    lower.includes("microsoftonline.com") ||
    lower.includes("/signin")
  );
}

export interface MoodleSessionCheckOptions {
  db: CoveDatabase;
  secrets: SecretStore;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Verify a stored Moodle session with one lightweight `/my/` request.
 *
 * Outcomes, and why each is different:
 * - `invalid`: the stored JSON does not parse, misses a field, or has no
 *   usable cookie value. Muster's rule is "purge and start over", so the
 *   credential is deleted and the source goes back to `disconnected`.
 * - `expired`: Moodle bounced us to login/SSO. The credential is *kept* (the
 *   user may still be signed in elsewhere) and the source is only degraded.
 * - `unreachable`: a network error or an upstream 5xx. Being offline is not a
 *   logout, so nothing is written; the next interval retries.
 * - `valid`: nothing is written either — a light ping proves the cookie works,
 *   not that the last sync succeeded.
 */
export async function verifyMoodleSession(options: MoodleSessionCheckOptions): Promise<MoodleSessionState> {
  const parsed = parseMoodleCredentials(await options.secrets.get(MOODLE_CREDENTIALS_KEY));
  if (!parsed.ok) {
    if (parsed.reason === "absent") return "absent";
    await options.secrets.delete(MOODLE_CREDENTIALS_KEY);
    disconnectMoodleSource(options.db);
    return "invalid";
  }

  const client = new MoodleClient(parsed.credentials.baseUrl, parsed.cookie, options.fetcher);
  let probe: { ok: boolean; status: number; url: string };
  try {
    probe = await client.probeSession(options.timeoutMs ?? PROBE_TIMEOUT_MS);
  } catch {
    return "unreachable";
  }
  if (probe.ok) return "valid";

  const baseUrl = parsed.credentials.baseUrl.replace(/\/$/, "");
  const offSite = probe.url !== "" && !probe.url.startsWith(baseUrl);
  // A redirect that lands somewhere else (Okta, Microsoft) is a login bounce;
  // a 5xx from Moodle itself is an outage and must not claim the cookie died.
  const bounced = isLoggedOutUrl(probe.url) || (offSite && probe.status < 400);
  if (!bounced) return "unreachable";

  degradeMoodleSession(options.db);
  return "expired";
}

export interface MoodleSessionScheduleOptions {
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * Run `check` every six hours without keeping the process alive. A rejected
 * check is reported through `onError` and never becomes an unhandled rejection
 * — the periodic check must not take the service down with it.
 */
export function scheduleMoodleSessionChecks(
  check: () => unknown,
  { intervalMs = MOODLE_SESSION_CHECK_INTERVAL_MS, onError }: MoodleSessionScheduleOptions = {},
): () => void {
  const run = () => {
    try {
      void Promise.resolve(check()).catch((error: unknown) => onError?.(error));
    } catch (error) {
      onError?.(error);
    }
  };
  const timer = setInterval(run, intervalMs);
  // `unref` keeps a test runner or a CLI import from hanging on the timer.
  if (typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
}
