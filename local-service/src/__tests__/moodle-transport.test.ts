import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type CoveDatabase } from "../db.js";
import { MemorySecretStore } from "../secrets.js";
import { MoodleConnectionChangedError, MoodleSessionTransport } from "../moodle-transport.js";
import { MOODLE_CREDENTIALS_KEY, MOODLE_SESSION_CHECK_INTERVAL_MS, moodleCredentialIdentity, scheduleMoodleSessionChecks, verifyMoodleSession } from "../moodle-session.js";
import { MoodleClient, MoodleSessionExpiredError } from "../sources/moodle.js";

const baseUrl = "https://moodle.example.invalid";
const dashboard = '<script>M.cfg={"sesskey":"fixture-key"};</script><a href="/login/logout.php">Log out</a>';
const initial = JSON.stringify({ baseUrl, cookie: "MoodleSession=initial; MDL_SSP_SessID=fixture", userAgent: "FixtureBrowser/1.0" });
let secrets: MemorySecretStore;
let transport: MoodleSessionTransport;
let directory: string;
let db: CoveDatabase;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "cove-moodle-transport-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", directory);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked"); }));
  secrets = new MemorySecretStore();
  await secrets.set(MOODLE_CREDENTIALS_KEY, initial);
  db = createDatabase({ dbPath: ":memory:", seed: false });
});
afterEach(async () => {
  transport?.close(); db.close();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
function use(fetcher: typeof fetch): MoodleSessionTransport {
  transport = new MoodleSessionTransport({ secrets, fetcher });
  return transport;
}

describe("Moodle shared cookie transport", () => {
  it("migrates legacy credentials without changing identity, rotates cookies, and avoids repeated keychain writes", async () => {
    const headers: Headers[] = [];
    const fetcher = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      headers.push(new Headers(init?.headers));
      return new Response(dashboard, { headers: headers.length === 1 ? { "set-cookie": "MoodleSession=rotated; Path=/; HttpOnly; Secure" } : {} });
    });
    const save = vi.spyOn(secrets, "set");
    const scoped = use(fetcher).forCredentials(initial);
    await scoped(`${baseUrl}/my/`, { headers: { cookie: "MoodleSession=obsolete" } });
    const saved = (await secrets.get(MOODLE_CREDENTIALS_KEY))!;
    expect(moodleCredentialIdentity(saved)).toBe(moodleCredentialIdentity(initial));
    expect(JSON.parse(saved).cookie).toContain("MoodleSession=rotated");
    await scoped(`${baseUrl}/lib/ajax/service.php`);
    expect(headers[1].get("cookie")).toContain("MoodleSession=rotated");
    expect(headers.every((header) => header.get("user-agent") === "FixtureBrowser/1.0")).toBe(true);
    expect(headers[0].get("cookie")).not.toContain("obsolete");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("applies intermediate redirect cookies exactly once, before following the same-origin destination", async () => {
    const cookies: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      cookies.push(new Headers(init?.headers).get("cookie") ?? "");
      return cookies.length === 1
        ? new Response(null, { status: 302, headers: { location: "/my/", "set-cookie": "MoodleSession=redirected; Path=/" } })
        : new Response(dashboard);
    };
    await use(fetcher).forCredentials(initial)(`${baseUrl}/auth/saml2/`);
    expect(cookies[1]).toContain("MoodleSession=redirected");
    expect(cookies[1].match(/MoodleSession=/g)).toHaveLength(1);
  });

  it.each(["listCourses", "pull"] as const)("follows dashboard renewal before %s reads AJAX data", async (method) => {
    const paths: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (paths.length === 1) return new Response(null, { status: 302, headers: {
        location: "/my/?renewed=1", "set-cookie": "MoodleSession=renewed; Path=/; Secure",
      } });
      expect(new Headers(init?.headers).get("cookie")).toContain("MoodleSession=renewed");
      if (url.pathname === "/my/") return new Response(dashboard);
      expect(url.searchParams.get("sesskey")).toBe("fixture-key");
      return Response.json([
        { data: { courses: [{ id: 2, shortname: "TEST101", fullname: "Fixture course" }] } },
        { data: { events: [] } },
      ]);
    };
    const client = new MoodleClient(baseUrl, "MoodleSession=initial", use(fetcher).forCredentials(initial));
    const result = await client[method]();
    expect(paths).toEqual(["/my/", "/my/", "/lib/ajax/service.php"]);
    expect(result).toHaveLength(method === "listCourses" ? 1 : 0);
  });

  it("retains browser cookie paths and restores the rotated jar after restart", async () => {
    const captured = JSON.stringify({ baseUrl, cookie: "MoodleSession=initial", cookies: [
      { name: "MoodleSession", value: "initial", domain: "moodle.example.invalid", path: "/", secure: true, expires: -1 },
      { name: "MDL_SSP_SessID", value: "path-only", domain: "moodle.example.invalid", path: "/auth", secure: true },
    ] });
    await secrets.set(MOODLE_CREDENTIALS_KEY, captured);
    const seen: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      seen.push(new Headers(init?.headers).get("cookie") ?? "");
      return new Response(dashboard, { headers: { "set-cookie": "MoodleSession=new; Path=/; Secure" } });
    };
    await use(fetcher).forCredentials(captured)(`${baseUrl}/my/`);
    expect(seen[0]).not.toContain("MDL_SSP");
    transport.close();
    const saved = (await secrets.get(MOODLE_CREDENTIALS_KEY))!;
    await use(fetcher).forCredentials(saved)(`${baseUrl}/auth/saml2/`);
    expect(seen[1]).toContain("MoodleSession=new");
    expect(seen[1]).toContain("MDL_SSP_SessID=path-only");
  });

  it("stops at an external SSO redirect without sending any authenticated request there", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://idp.example.invalid/login" } }));
    await expect(use(fetcher).forCredentials(initial)(`${baseUrl}/my/`)).rejects.toBeInstanceOf(MoodleSessionExpiredError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects old readers immediately after reconnecting", async () => {
    const fetcher = vi.fn(async () => new Response(dashboard));
    const old = use(fetcher).forCredentials(initial);
    await transport.replaceCredentials(JSON.stringify({ baseUrl, session: "another" }));
    await expect(old(`${baseUrl}/my/`)).rejects.toBeInstanceOf(MoodleConnectionChangedError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("orders a new login after an already-started rotation write", async () => {
    const blocked = deferred<void>(); const started = deferred<void>();
    const realSet = secrets.set.bind(secrets);
    vi.spyOn(secrets, "set").mockImplementationOnce(async (key, value) => {
      started.resolve(); await blocked.promise; await realSet(key, value);
    });
    const read = use(async () => new Response(dashboard)).forCredentials(initial)(`${baseUrl}/my/`);
    const rejected = expect(read).rejects.toBeInstanceOf(MoodleConnectionChangedError);
    await started.promise;
    const replace = transport.replaceCredentials(JSON.stringify({ baseUrl, session: "new-account" }));
    blocked.resolve(); await rejected; await replace;
    expect(JSON.parse((await secrets.get(MOODLE_CREDENTIALS_KEY))!).session).toBe("new-account");
  });

  it("does not resurrect a connection when disconnect races a rotation write", async () => {
    const blocked = deferred<void>(); const started = deferred<void>();
    const realSet = secrets.set.bind(secrets);
    vi.spyOn(secrets, "set").mockImplementationOnce(async (key, value) => {
      started.resolve(); await blocked.promise; await realSet(key, value);
    });
    const read = use(async () => new Response(dashboard)).forCredentials(initial)(`${baseUrl}/my/`);
    const rejected = expect(read).rejects.toBeInstanceOf(MoodleConnectionChangedError);
    await started.promise;
    const disconnect = transport.deleteCredentials();
    blocked.resolve(); await rejected; await disconnect;
    expect(await secrets.get(MOODLE_CREDENTIALS_KEY)).toBeNull();
  });

  it("rolls back a cancelled login write before applying the next login", async () => {
    const blocked = deferred<void>(); const started = deferred<void>();
    const realSet = secrets.set.bind(secrets);
    vi.spyOn(secrets, "set").mockImplementationOnce(async (key, value) => {
      started.resolve(); await blocked.promise; await realSet(key, value);
    });
    use(async () => new Response(dashboard));
    const controller = new AbortController();
    const saving = transport.replaceCredentials(JSON.stringify({ baseUrl, session: "cancelled" }), controller.signal);
    const rejected = expect(saving).rejects.toThrow();
    await started.promise; controller.abort();
    const next = transport.replaceCredentials(JSON.stringify({ baseUrl, session: "newest" }));
    blocked.resolve(); await rejected; await next;
    expect(JSON.parse((await secrets.get(MOODLE_CREDENTIALS_KEY))!).session).toBe("newest");
  });
});

describe("Moodle session maintenance", () => {
  it("keeps an idle lease alive beyond its original timeout while page reads are cached", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T00:00:00Z"));
    let expires = Date.now() + 30 * 60_000;
    let pings = 0;
    use(async () => {
      pings += 1;
      if (Date.now() >= expires) return new Response('<form action="/login/index.php"><input type="password"></form>');
      expires = Date.now() + 30 * 60_000;
      return new Response(dashboard);
    });
    const check = () => verifyMoodleSession({ db, secrets, fetcherForCredentials: (raw) => transport.forCredentials(raw) });
    const stop = scheduleMoodleSessionChecks(check);
    await vi.advanceTimersByTimeAsync(4 * MOODLE_SESSION_CHECK_INTERVAL_MS);
    stop();
    expect(pings).toBe(4);
    expect(await check()).toBe("valid");
  });

  it("joins overlapping probes and recovers an expired status without changing sync success time", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(async () => pending.promise);
    use(fetcher);
    const successAt = "2026-11-01T00:00:00Z";
    db.setSourceStatus("moodle", "degraded", successAt, "Moodle 会话已过期，需要重新登录");
    const options = { db, secrets, fetcherForCredentials: (raw: string) => transport.forCredentials(raw) };
    const first = verifyMoodleSession(options); const second = verifyMoodleSession(options);
    expect(first).toBe(second);
    pending.resolve(new Response(dashboard));
    expect(await first).toBe("valid");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.listSources().find((source) => source.id === "moodle")).toMatchObject({ status: "connected", lastSyncAt: successAt, lastError: null });
  });

  it("does not turn a late old login bounce into an error on the new connection", async () => {
    const pending = deferred<Response>(); const started = deferred<void>();
    use(async () => { started.resolve(); return pending.promise; });
    const check = verifyMoodleSession({ db, secrets, fetcherForCredentials: (raw) => transport.forCredentials(raw) });
    await started.promise;
    await transport.replaceCredentials(JSON.stringify({ baseUrl, session: "new" }));
    db.setSourceStatus("moodle", "connected", null, null);
    pending.resolve(new Response(null, { status: 302, headers: { location: "/login/index.php" } }));
    expect(await check).toBe("unreachable");
    expect(db.listSources().find((source) => source.id === "moodle")?.status).toBe("connected");
  });
});
