import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySecretStore } from "../secrets.js";
import {
  configureOnTrackCredentials,
  disconnectOnTrackCredentials,
  fetchOnTrackAccount,
  fetchOnTrackProjects,
  onTrackCacheIdentity,
} from "../sources/ontrack.js";

const baseUrl = "https://ontrack.example.invalid/api";
let configDir: string;
let store: MemorySecretStore;

async function saveCredentials(username: string, refreshToken = `refresh-${username}`): Promise<void> {
  await store.set("ontrack-credentials", JSON.stringify({ baseUrl, username, refreshToken }));
}

function tokenResponse(username: string, token = `token-${username}`): Response {
  return Response.json({
    auth_token: token,
    auth_token_expiry: new Date(Date.now() + 60 * 60_000).toISOString(),
    user: { id: username === "account-a" ? 1 : 2, username },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => { throw new Error("Deferred was not initialized"); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "cove-ontrack-auth-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", configDir);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network call in isolated test"); }));
  store = new MemorySecretStore();
  configureOnTrackCredentials(store);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(configDir, { recursive: true, force: true });
});

describe("OnTrack credential isolation", () => {
  it("uses the new account token and identity after switching accounts on the same host", async () => {
    const tokens: string[] = [];
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith("/auth/access-token")) {
        const cookie = new Headers(init?.headers).get("Cookie") ?? "";
        return tokenResponse(cookie.includes("username=account-a") ? "account-a" : "account-b");
      }
      tokens.push(new Headers(init?.headers).get("Auth-Token") ?? "");
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetcher);
    await saveCredentials("account-a");
    const firstIdentity = await onTrackCacheIdentity();
    expect((await fetchOnTrackAccount())?.username).toBe("account-a");
    await fetchOnTrackProjects();
    await saveCredentials("account-b");
    expect(await onTrackCacheIdentity()).not.toBe(firstIdentity);
    expect((await fetchOnTrackAccount())?.username).toBe("account-b");
    await fetchOnTrackProjects();
    expect(tokens).toEqual(["token-account-a", "token-account-b"]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/auth/access-token"))).toHaveLength(2);
  });

  it("keeps identity stable after reconfiguration but invalidates tokens when refresh credentials change", async () => {
    const fetcher = vi.fn(async () => tokenResponse("account-a"));
    vi.stubGlobal("fetch", fetcher);
    await saveCredentials("account-a", "refresh-one");
    const firstIdentity = await onTrackCacheIdentity();
    expect(firstIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(firstIdentity).not.toContain("account-a");
    configureOnTrackCredentials(store);
    expect(await onTrackCacheIdentity()).toBe(firstIdentity);
    expect(fetcher).not.toHaveBeenCalled();
    await fetchOnTrackAccount();
    await saveCredentials("account-a", "refresh-two");
    expect(await onTrackCacheIdentity()).not.toBe(firstIdentity);
    await fetchOnTrackAccount();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("joins concurrent token refreshes and retries after a failed mint", async () => {
    await saveCredentials("account-a");
    const pending = deferred<Response>();
    const started = deferred<void>();
    const fetcher = vi.fn(async (input: string | URL) => {
      if (!String(input).endsWith("/auth/access-token")) return Response.json([]);
      started.resolve();
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const results = Promise.all([fetchOnTrackAccount(), fetchOnTrackProjects()]);
    await started.promise;
    pending.resolve(tokenResponse("account-a"));
    await results;
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/auth/access-token"))).toHaveLength(1);

    await saveCredentials("account-a", "changed-refresh");
    fetcher.mockImplementationOnce(async () => new Response("expired", { status: 503 }));
    await expect(fetchOnTrackAccount()).rejects.toThrow("登录已失效");
    fetcher.mockImplementationOnce(async () => tokenResponse("account-a"));
    expect((await fetchOnTrackAccount())?.username).toBe("account-a");
  });

  it("rejects a late token result after credentials change", async () => {
    await saveCredentials("account-a");
    const pending = deferred<Response>();
    const started = deferred<void>();
    const fetcher = vi.fn(async () => { started.resolve(); return pending.promise; });
    vi.stubGlobal("fetch", fetcher);
    const oldAccount = fetchOnTrackAccount();
    const rejected = expect(oldAccount).rejects.toThrow("连接已更改");
    await started.promise;
    await saveCredentials("account-b");
    pending.resolve(tokenResponse("account-a"));
    await rejected;
    fetcher.mockImplementationOnce(async () => tokenResponse("account-b"));
    expect((await fetchOnTrackAccount())?.username).toBe("account-b");
  });

  it("times out a stalled token mint and allows the next attempt to retry", async () => {
    vi.useFakeTimers();
    // Node's native AbortSignal timer is outside fake timers; route only this timer
    // through the fake clock so the real timeout contract is exercised without waiting.
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    await saveCredentials("account-a");
    const started = deferred<void>();
    const fetcher = vi.fn((_input: string | URL, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const signal = init!.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      started.resolve();
    }));
    vi.stubGlobal("fetch", fetcher);
    const stalled = fetchOnTrackAccount();
    const rejected = expect(stalled).rejects.toMatchObject({ name: "TimeoutError" });
    await started.promise;
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    fetcher.mockImplementationOnce(async () => tokenResponse("account-a"));
    expect((await fetchOnTrackAccount())?.username).toBe("account-a");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects a late mint after replacing the configured store even with identical credentials", async () => {
    await saveCredentials("account-a");
    const pending = deferred<Response>();
    const started = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async () => { started.resolve(); return pending.promise; }));
    const oldAccount = fetchOnTrackAccount();
    const rejected = expect(oldAccount).rejects.toThrow("连接已更改");
    await started.promise;
    const replacement = new MemorySecretStore();
    await replacement.set("ontrack-credentials", (await store.get("ontrack-credentials"))!);
    configureOnTrackCredentials(replacement);
    pending.resolve(tokenResponse("account-a"));
    await rejected;
  });

  it("rejects a late data response after switching account", async () => {
    await saveCredentials("account-a");
    const pending = deferred<Response>();
    const started = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      if (String(input).endsWith("/auth/access-token")) return tokenResponse("account-a");
      started.resolve();
      return pending.promise;
    }));
    const oldProjects = fetchOnTrackProjects();
    const rejected = expect(oldProjects).rejects.toThrow("连接已更改");
    await started.promise;
    await saveCredentials("account-b");
    pending.resolve(Response.json([{ id: 1, unit: { id: 2, code: "OLD" } }]));
    await rejected;
  });

  it("persists explicit disconnect against CLI fallback and reconnects after the same credentials are saved", async () => {
    await writeFile(join(configDir, "session.json"), JSON.stringify({
      baseUrl, username: "cli-account", authToken: "cli-token", user: { id: 42 },
    }));
    await saveCredentials("account-a");
    const firstIdentity = await onTrackCacheIdentity();
    await disconnectOnTrackCredentials();
    configureOnTrackCredentials(store);
    expect(await onTrackCacheIdentity()).toBeNull();
    expect(await fetchOnTrackAccount()).toBeNull();
    await expect(fetchOnTrackProjects()).rejects.toThrow("还没有登录");
    expect(fetch).not.toHaveBeenCalled();
    await saveCredentials("account-a");
    expect(await onTrackCacheIdentity()).toBe(firstIdentity);
    vi.stubGlobal("fetch", vi.fn(async () => tokenResponse("account-a")));
    expect((await fetchOnTrackAccount())?.username).toBe("account-a");
  });

  it("isolates CLI identities without network access and never falls back for invalid saved credentials", async () => {
    const path = join(configDir, "session.json");
    await writeFile(path, JSON.stringify({ baseUrl, username: "account-a", authToken: "cli-token-a", user: { id: 1 } }));
    const firstIdentity = await onTrackCacheIdentity();
    expect(firstIdentity).toMatch(/^[a-f0-9]{64}$/);
    await writeFile(path, JSON.stringify({ baseUrl, username: "account-b", authToken: "cli-token-b", user: { id: 2 } }));
    expect(await onTrackCacheIdentity()).not.toBe(firstIdentity);
    await store.set("ontrack-credentials", "not-json");
    expect(await onTrackCacheIdentity()).toBeNull();
    expect(await fetchOnTrackAccount()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
