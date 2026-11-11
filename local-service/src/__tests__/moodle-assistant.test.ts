import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { APIResponse, BrowserContext, Cookie, Page } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type CoveDatabase } from "../db.js";
import { MemorySecretStore } from "../secrets.js";
import { isAuthenticatedMoodleDashboard, MoodleLoginAssistant } from "../setup/moodle-assistant.js";

const { launchPersistentContext } = vi.hoisted(() => ({ launchPersistentContext: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launchPersistentContext } }));

const baseUrl = "https://learning.monash.edu";
const dashboard = '<body id="page-my-index"><script>M.cfg={"sesskey":"fixture-key"}</script></body>';
const browserUserAgent = "Fixture Chrome/150.0";

function cookie(name: string, value: string, overrides: Partial<Cookie> = {}): Cookie {
  return { name, value, domain: "learning.monash.edu", path: "/", expires: -1,
    secure: true, httpOnly: true, sameSite: "Lax", ...overrides };
}
function response(html = dashboard, url = `${baseUrl}/my/`, status = 200): APIResponse {
  return { status: () => status, url: () => url, text: async () => html,
    dispose: vi.fn(async () => undefined) } as unknown as APIResponse;
}
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function browser(session = "initial") {
  let jar = [cookie("MoodleSession", session)];
  const page = { goto: vi.fn(async () => undefined), evaluate: vi.fn(async () => browserUserAgent) };
  const request = { get: vi.fn(async () => response()) };
  const close = vi.fn(async () => undefined);
  const pages = vi.fn(() => [page as unknown as Page]);
  const cookies = vi.fn(async (url?: string | string[]) => url
    ? jar.filter((entry) => ["learning.monash.edu", ".monash.edu"].includes(entry.domain) && "/my/".startsWith(entry.path) && (entry.expires <= 0 || entry.expires > Date.now() / 1000))
    : jar);
  const context = { request, close, pages, cookies, newPage: vi.fn(async () => page) } as unknown as BrowserContext;
  return { context, request, close, pages, cookies, page, setCookies: (value: Cookie[]) => { jar = value; } };
}

let directory: string;
let db: CoveDatabase;
let secrets: MemorySecretStore;
let assistants: MoodleLoginAssistant[];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "cove-moodle-assistant-"));
  vi.stubEnv("COVE_DATA_DIR", directory);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked in login fixture"); }));
  launchPersistentContext.mockReset();
  db = createDatabase({ dbPath: ":memory:", seed: false });
  secrets = new MemorySecretStore();
  assistants = [];
});
afterEach(async () => {
  await Promise.all(assistants.map((assistant) => assistant.cancel()));
  db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
function assistant(persistCredentials?: (value: string, signal: AbortSignal) => Promise<void>): MoodleLoginAssistant {
  const value = new MoodleLoginAssistant(secrets, db, persistCredentials);
  assistants.push(value);
  return value;
}

it.each([
  [200, `${baseUrl}/my/`, dashboard, true],
  [200, `${baseUrl}/my/index.php`, dashboard, true],
  [200, `${baseUrl}/my/`, '<a href="/login/logout.php?sesskey=fixture">Log out</a>', true],
  [200, `${baseUrl}/my/`, '<form id="login"><input name="password"><input name="sesskey" value="guest"></form>', false],
  [200, `${baseUrl}/my/`, "Redirecting to SSO…", false],
  [200, `${baseUrl}/my/`, '<script>M.cfg={"sesskey":"guest-key"}</script>', false],
  [200, `${baseUrl}/login/index.php`, dashboard, false],
  [200, "https://learning.monash.edu.attacker.invalid/my/", dashboard, false],
  [503, `${baseUrl}/my/`, dashboard, false],
] as const)("recognizes authenticated dashboard evidence: %s %s", (status, url, html, expected) => {
  expect(isAuthenticatedMoodleDashboard(baseUrl, status, url, html)).toBe(expected);
});

describe("Moodle login browser session capture", () => {
  it("verifies inside the browser jar and persists cookies after rotation with their scope and actual UA", async () => {
    const mock = browser();
    mock.request.get.mockImplementation(async () => {
      mock.setCookies([
        cookie("MoodleSession", "rotated"),
        cookie("MDL_SSP_SessID", "scoped", { path: "/auth/saml2/" }),
        cookie("parent", "allowed", { domain: ".monash.edu" }),
        cookie("expired", "old", { expires: 1 }),
        cookie("external", "excluded", { domain: ".okta.com" }),
        cookie("sibling", "excluded", { domain: "other.monash.edu" }),
        cookie("suffix", "excluded", { domain: "evilmonash.edu" }),
      ]);
      return response();
    });
    launchPersistentContext.mockResolvedValue(mock.context);
    const login = assistant();
    await login.start();
    await vi.waitFor(() => expect(login.get().status).toBe("connected"));
    const saved = JSON.parse((await secrets.get("moodle-credentials"))!);
    expect(saved).toMatchObject({ session: "rotated", userAgent: browserUserAgent });
    expect(saved.cookies).toEqual([
      cookie("MoodleSession", "rotated"),
      cookie("MDL_SSP_SessID", "scoped", { path: "/auth/saml2/" }),
      cookie("parent", "allowed", { domain: ".monash.edu" }),
    ]);
    expect(saved.cookie).toBe("MoodleSession=rotated; parent=allowed");
    expect(mock.request.get).toHaveBeenCalledWith(`${baseUrl}/my/`, { timeout: 15_000 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(mock.close).toHaveBeenCalled());
  });

  it("does not save a cookie merely because the dashboard URL returns HTTP 200", async () => {
    const mock = browser();
    mock.request.get.mockResolvedValue(response('<form id="login"><input name="password"></form>'));
    mock.pages.mockReturnValueOnce([mock.page as unknown as Page]).mockReturnValue([]);
    launchPersistentContext.mockResolvedValue(mock.context);
    const login = assistant();
    await login.start();
    await vi.waitFor(() => expect(login.get().status).toBe("error"));
    expect(await secrets.get("moodle-credentials")).toBeNull();
  });

  it("closes a late launch result after cancellation without saving credentials", async () => {
    const launch = deferred<BrowserContext>();
    const mock = browser();
    launchPersistentContext.mockReturnValue(launch.promise);
    const login = assistant();
    await login.start();
    await login.cancel();
    launch.resolve(mock.context);
    await vi.waitFor(() => expect(mock.close).toHaveBeenCalled());
    expect(mock.request.get).not.toHaveBeenCalled();
    expect(await secrets.get("moodle-credentials")).toBeNull();
    expect(login.get().status).toBe("cancelled");
  });

  it("does not let an old probe overwrite a restarted login or close its browser", async () => {
    const old = browser("old");
    const next = browser("new");
    const oldProbe = deferred<APIResponse>();
    const nextProbe = deferred<APIResponse>();
    old.request.get.mockReturnValue(oldProbe.promise);
    next.request.get.mockReturnValue(nextProbe.promise);
    launchPersistentContext.mockResolvedValueOnce(old.context).mockResolvedValueOnce(next.context);
    const login = assistant();
    await login.start();
    await vi.waitFor(() => expect(old.request.get).toHaveBeenCalled());
    await login.cancel();
    await login.start();
    await vi.waitFor(() => expect(next.request.get).toHaveBeenCalled());
    oldProbe.resolve(response());
    await vi.waitFor(() => expect(old.close).toHaveBeenCalledTimes(2));
    expect(next.close).not.toHaveBeenCalled();
    expect(login.get().status).toBe("waiting_login");
    expect(await secrets.get("moodle-credentials")).toBeNull();
    nextProbe.resolve(response());
    await vi.waitFor(() => expect(login.get().status).toBe("connected"));
    expect(JSON.parse((await secrets.get("moodle-credentials"))!).session).toBe("new");
  });

  it("does not overwrite a new login when an old post-verification capture finishes late", async () => {
    const old = browser("old");
    const next = browser("new");
    const capture = deferred<Cookie[]>();
    old.cookies.mockImplementationOnce(async () => [cookie("MoodleSession", "old")])
      .mockImplementationOnce(() => capture.promise);
    launchPersistentContext.mockResolvedValueOnce(old.context).mockResolvedValueOnce(next.context);
    const login = assistant();
    await login.start();
    await vi.waitFor(() => expect(old.cookies).toHaveBeenCalledTimes(2));
    await login.cancel();
    await login.start();
    await vi.waitFor(() => expect(login.get().status).toBe("connected"));
    capture.resolve([cookie("MoodleSession", "old")]);
    await vi.waitFor(() => expect(old.close).toHaveBeenCalledTimes(2));
    expect(login.get().status).toBe("connected");
    expect(JSON.parse((await secrets.get("moodle-credentials"))!).session).toBe("new");
  });


  it("aborts the injected credential writer on cancel and ignores its late completion", async () => {
    const mock = browser();
    const write = deferred<void>();
    const persist = vi.fn((_value: string, _signal: AbortSignal) => write.promise);
    launchPersistentContext.mockResolvedValue(mock.context);
    const login = assistant(persist);
    await login.start();
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const [value, signal] = persist.mock.calls[0];
    expect(JSON.parse(value).session).toBe("initial");
    expect(signal.aborted).toBe(false);
    await login.cancel();
    expect(signal.aborted).toBe(true);
    write.resolve();
    await vi.waitFor(() => expect(mock.close).toHaveBeenCalledTimes(2));
    expect(login.get().status).toBe("cancelled");
    expect(db.listSources().find((source) => source.id === "moodle")?.status).toBe("disconnected");
    expect(await secrets.get("moodle-credentials")).toBeNull();
  });

});
