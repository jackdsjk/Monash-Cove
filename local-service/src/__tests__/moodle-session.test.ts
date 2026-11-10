import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createDatabase } from "../db.js";
import {
  MOODLE_CREDENTIALS_KEY,
  MOODLE_SESSION_CHECK_INTERVAL_MS,
  MOODLE_SESSION_EXPIRED_MESSAGE,
  scheduleMoodleSessionChecks,
  verifyMoodleSession,
} from "../moodle-session.js";
import { MemorySecretStore } from "../secrets.js";
import { MoodleClient } from "../sources/moodle.js";
import { moodleCookieHeader } from "../moodle-download.js";

function responseWithUrl(body: string, url: string, status = 200) {
  const response = new Response(body, { status });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("moodle session probing", () => {
  it("accepts a dashboard response served from the Moodle host", async () => {
    const fetcher = vi.fn(async () => responseWithUrl("<html>dashboard</html>", "https://learning.monash.edu/my/")) as unknown as typeof fetch;
    const client = new MoodleClient("https://learning.monash.edu", "MoodleSession=abc", fetcher);
    await expect(client.probeSession()).resolves.toMatchObject({ ok: true, status: 200 });
  });

  it("rejects an SSO bounce even when it returns 200", async () => {
    const fetcher = vi.fn(async () => responseWithUrl("<html>okta</html>", "https://monashuni.okta.com/app/x/sso/saml")) as unknown as typeof fetch;
    const client = new MoodleClient("https://learning.monash.edu", "MoodleSession=abc", fetcher);
    await expect(client.validateSession()).resolves.toBe(false);
  });

  it("sends the captured cookie jar verbatim", async () => {
    const seen: string[] = [];
    const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      seen.push(String((init?.headers as Record<string, string>).cookie));
      return responseWithUrl("<html>dashboard</html>", "https://learning.monash.edu/my/");
    }) as unknown as typeof fetch;
    const jar = "MoodleSession=abc; MDL_SSP_SessID=def";
    await new MoodleClient("https://learning.monash.edu", jar, fetcher).validateSession();
    expect(seen[0]).toBe(jar);
  });
});

describe("moodle credential shapes", () => {
  it("prefers the captured cookie header", () => {
    expect(moodleCookieHeader({ session: "abc", cookie: "MoodleSession=abc; MDL_SSP_SessID=def" })).toBe("MoodleSession=abc; MDL_SSP_SessID=def");
  });

  it("falls back to a pasted session value", () => {
    expect(moodleCookieHeader({ session: "abc" })).toBe("MoodleSession=abc");
  });

  it("fails loudly when neither is stored", () => {
    expect(() => moodleCookieHeader({})).toThrow(/missing both/);
  });
});

const BASE_URL = "https://learning.monash.edu";
const VALID_COOKIE = "MoodleSession=abc; MDL_SSP_SessID=def";

function moodleRow(db: ReturnType<typeof createDatabase>) {
  const source = db.listSources().find((row) => row.id === "moodle");
  if (!source) throw new Error("Moodle source row is missing");
  return source;
}

describe("moodle session cleanup", () => {
  it.each([
    ["损坏的 JSON", '{ "baseUrl": "https://learning.monash.edu", '],
    ["缺少 baseUrl", JSON.stringify({ cookie: VALID_COOKIE })],
    ["空白 cookie", JSON.stringify({ baseUrl: BASE_URL, cookie: "   " })],
    ["没有值的 cookie", JSON.stringify({ baseUrl: BASE_URL, cookie: "MoodleSession=" })],
    ["缺少 cookie 与 session", JSON.stringify({ baseUrl: BASE_URL })],
  ])("遇到%s就删掉凭据并把来源标为 disconnected", async (_label, raw) => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const secrets = new MemorySecretStore();
    await secrets.set(MOODLE_CREDENTIALS_KEY, raw);
    db.setSourceStatus("moodle", "connected", "2026-11-01T00:00:00.000Z", null);
    db.setSourceAccount("moodle", "student@monash.edu");
    const fetcher = vi.fn();

    await expect(verifyMoodleSession({ db, secrets, fetcher: fetcher as unknown as typeof fetch })).resolves.toBe("invalid");

    expect(await secrets.get(MOODLE_CREDENTIALS_KEY)).toBeNull();
    expect(moodleRow(db)).toMatchObject({ status: "disconnected", lastError: expect.stringContaining("已清除"), account: null });
    // 解析失败连请求都不用发。
    expect(fetcher).not.toHaveBeenCalled();
    db.close();
  });

  it("expired session degrades the source but keeps the credential", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const secrets = new MemorySecretStore();
    const raw = JSON.stringify({ baseUrl: BASE_URL, session: "abc", cookie: VALID_COOKIE });
    await secrets.set(MOODLE_CREDENTIALS_KEY, raw);
    db.setSourceStatus("moodle", "connected", "2026-11-01T00:00:00.000Z", null);
    const fetcher = vi.fn(async () =>
      responseWithUrl("<html>login</html>", "https://learning.monash.edu/login/index.php?loginredirect=1"),
    );

    await expect(verifyMoodleSession({ db, secrets, fetcher: fetcher as unknown as typeof fetch })).resolves.toBe("expired");

    // 失效不等于损坏：凭据留着，来源只降级，并写清原因让界面给出「重新登录」。
    expect(await secrets.get(MOODLE_CREDENTIALS_KEY)).toBe(raw);
    expect(moodleRow(db)).toMatchObject({
      status: "degraded",
      lastError: MOODLE_SESSION_EXPIRED_MESSAGE,
      lastSyncAt: "2026-11-01T00:00:00.000Z",
    });
    // 用的是存储里的 Cookie，而不是空 header。
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ cookie: VALID_COOKIE });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${BASE_URL}/my/`);
    db.close();
  });

  it("leaves a working-looking session untouched when Moodle is unreachable", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const secrets = new MemorySecretStore();
    const raw = JSON.stringify({ baseUrl: BASE_URL, cookie: VALID_COOKIE });
    await secrets.set(MOODLE_CREDENTIALS_KEY, raw);
    db.setSourceStatus("moodle", "connected", "2026-11-01T00:00:00.000Z", null);
    const fetcher = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND learning.monash.edu");
    });

    await expect(verifyMoodleSession({ db, secrets, fetcher: fetcher as unknown as typeof fetch })).resolves.toBe("unreachable");

    expect(moodleRow(db)).toMatchObject({ status: "connected", lastError: null });
    expect(await secrets.get(MOODLE_CREDENTIALS_KEY)).toBe(raw);
    db.close();
  });

  it("treats a Moodle 5xx as an outage, not a logout", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    const secrets = new MemorySecretStore();
    await secrets.set(MOODLE_CREDENTIALS_KEY, JSON.stringify({ baseUrl: BASE_URL, cookie: VALID_COOKIE }));
    db.setSourceStatus("moodle", "connected", "2026-11-01T00:00:00.000Z", null);
    const fetcher = vi.fn(async () => responseWithUrl("<html>busy</html>", `${BASE_URL}/my/`, 503));

    await expect(verifyMoodleSession({ db, secrets, fetcher: fetcher as unknown as typeof fetch })).resolves.toBe("unreachable");
    expect(moodleRow(db)).toMatchObject({ status: "connected", lastError: null });
    db.close();
  });
});

describe("moodle session schedule", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks every six hours until cancelled", async () => {
    vi.useFakeTimers();
    const check = vi.fn();
    const stop = scheduleMoodleSessionChecks(check);

    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MOODLE_SESSION_CHECK_INTERVAL_MS - 1);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MOODLE_SESSION_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(MOODLE_SESSION_CHECK_INTERVAL_MS * 2);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("never lets a failed check become an unhandled rejection", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const stop = scheduleMoodleSessionChecks(() => Promise.reject(new Error("boom")), { onError });

    await vi.advanceTimersByTimeAsync(MOODLE_SESSION_CHECK_INTERVAL_MS);
    expect(onError).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("moodle session at startup", () => {
  it("verifies the stored session on ready and reflects it in /api/sources", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set(MOODLE_CREDENTIALS_KEY, JSON.stringify({ baseUrl: BASE_URL, cookie: VALID_COOKIE }));
    const fetcher = vi.fn(async () =>
      responseWithUrl("<html>login</html>", "https://learning.monash.edu/login/index.php"),
    );
    const app = buildApp({
      dbPath: ":memory:",
      seed: false,
      secretStore: secrets,
      fetcher: fetcher as unknown as typeof fetch,
      moodleSessionCheck: true,
    });

    try {
      await app.ready();
      await vi.waitFor(async () => {
        const response = await app.inject({ method: "GET", url: "/api/sources" });
        const moodle = response.json().sources.find((source: { id: string }) => source.id === "moodle");
        expect(moodle).toMatchObject({ status: "degraded", lastError: MOODLE_SESSION_EXPIRED_MESSAGE });
      });
    } finally {
      await app.close();
    }
  });
});
