import { z } from "zod";
import { createHash } from "node:crypto";
import type { CoveDatabase } from "./db.js";
import type { SecretStore } from "./secrets.js";
import { moodleCookieHeader } from "./moodle-download.js";
import { MoodleClient, MoodleSessionExpiredError } from "./sources/moodle.js";

/** Keyring / secrets-file key that holds the captured Moodle cookie jar. */
export const MOODLE_CREDENTIALS_KEY = "moodle-credentials";

/**
 * User-visible copy, written to `sources.last_error`. The Sources page matches
 * 「会话已过期」to swap「重新同步」for「重新登录」, so keep the wording in sync with
 * `SESSION_EXPIRED` in webapp/src/pages/SourcesPage.tsx.
 */
export const MOODLE_SESSION_EXPIRED_MESSAGE = "Moodle 会话已过期，需要重新登录";
export const MOODLE_CREDENTIALS_INVALID_MESSAGE = "Moodle 凭据已损坏或缺少 Cookie，已清除，请重新登录";

/** Keep the idle session active even when page reads are served from cache. */
export const MOODLE_SESSION_CHECK_INTERVAL_MS = 10 * 60 * 1000;

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
    /** Opaque connection scope; maintained across cookie rotation, replaced on login. */
    connectionId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    userAgent: z.string().min(1).max(1000).regex(/^[^\r\n]+$/).optional(),
    cookies: z.array(z.object({
      name: z.string().min(1), value: z.string(), domain: z.string().min(1),
      path: z.string().startsWith("/"), expires: z.number().optional(),
      secure: z.boolean().optional(), httpOnly: z.boolean().optional(),
      sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
    })).max(300).optional(),
    cookieJar: z.object({ cookies: z.array(z.record(z.string(), z.unknown())).max(300) }).passthrough().optional(),
  })
  .refine((value) => Boolean(value.session || value.cookie), { message: "session or cookie is required" });

export type MoodleCredentialsShape = z.infer<typeof moodleCredentials>;

/** Preserve the original identity for legacy records when migrating to a jar. */
export function moodleCredentialIdentity(raw: string): string {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null && "connectionId" in value &&
        typeof value.connectionId === "string" && /^[a-f0-9]{64}$/.test(value.connectionId)) return value.connectionId;
  } catch { /* Invalid records still have a deterministic scope until validation. */ }
  return createHash("sha256").update(`moodle\0${raw}`).digest("hex");
}

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
  fetcherForCredentials?: (raw: string) => typeof fetch;
}

/** One probe per store, shared by startup, setup status and the keepalive timer. */
const activeChecks = new WeakMap<SecretStore, Promise<MoodleSessionState>>();

export function verifyMoodleSession(options: MoodleSessionCheckOptions): Promise<MoodleSessionState> {
  const active = activeChecks.get(options.secrets);
  if (active) return active;
  const promise = checkMoodleSession(options);
  activeChecks.set(options.secrets, promise);
  void promise.then(() => activeChecks.delete(options.secrets), () => activeChecks.delete(options.secrets));
  return promise;
}

async function checkMoodleSession(options: MoodleSessionCheckOptions): Promise<MoodleSessionState> {
  const raw = await options.secrets.get(MOODLE_CREDENTIALS_KEY);
  const parsed = parseMoodleCredentials(raw);
  if (!parsed.ok) {
    if (parsed.reason === "absent") return "absent";
    if (await options.secrets.get(MOODLE_CREDENTIALS_KEY) !== raw) return "unreachable";
    await options.secrets.delete(MOODLE_CREDENTIALS_KEY);
    disconnectMoodleSource(options.db);
    return "invalid";
  }
  const identity = moodleCredentialIdentity(raw!);
  const stillCurrent = async (): Promise<boolean> => {
    const current = await options.secrets.get(MOODLE_CREDENTIALS_KEY);
    return current !== null && moodleCredentialIdentity(current) === identity;
  };
  const client = new MoodleClient(parsed.credentials.baseUrl, parsed.cookie,
    options.fetcherForCredentials?.(raw!) ?? options.fetcher);
  let expired = false;
  try {
    const probe = await client.probeSession(options.timeoutMs ?? PROBE_TIMEOUT_MS);
    if (!await stillCurrent()) return "unreachable";
    if (probe.ok) {
      const source = moodleSource(options.db);
      if (source?.status === "degraded" && source.lastError === MOODLE_SESSION_EXPIRED_MESSAGE) {
        options.db.setSourceStatus("moodle", "connected", source.lastSyncAt, null);
      }
      return "valid";
    }
    expired = probe.expired;
  } catch (error) {
    expired = error instanceof MoodleSessionExpiredError;
  }
  if (!expired || !await stillCurrent()) return "unreachable";
  degradeMoodleSession(options.db);
  return "expired";
}

export interface MoodleSessionScheduleOptions {
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * Run `check` every ten minutes without keeping the process alive. A rejected
 * check is reported through `onError` and never becomes an unhandled rejection
 * — the periodic check must not take the service down with it.
 */
export function scheduleMoodleSessionChecks(
  check: () => unknown,
  { intervalMs = MOODLE_SESSION_CHECK_INTERVAL_MS, onError }: MoodleSessionScheduleOptions = {},
): () => void {
  let running = false;
  let stopped = false;
  const run = () => {
    if (running || stopped) return;
    running = true;
    try {
      void Promise.resolve(check()).catch((error: unknown) => onError?.(error)).finally(() => { running = false; });
    } catch (error) {
      running = false;
      onError?.(error);
    }
  };
  const timer = setInterval(run, intervalMs);
  // `unref` keeps a test runner or a CLI import from hanging on the timer.
  if (typeof timer.unref === "function") timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
