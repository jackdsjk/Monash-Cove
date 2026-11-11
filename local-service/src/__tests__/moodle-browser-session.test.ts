import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieJar } from "tough-cookie";
import { moodleBrowserCookies } from "../moodle-browser-session.js";
import { captureMoodlePage } from "../moodle-snapshot.js";
import { scanMoodleAttendanceImages } from "../attendance/moodle-ocr.js";
import { MoodleSessionExpiredError } from "../sources/moodle.js";
import type { MoodleCredentials } from "../moodle-download.js";
import type { MoodleContentRow } from "../domain.js";

const mocks = vi.hoisted(() => ({
  launch: vi.fn(), newContext: vi.fn(), addCookies: vi.fn(), newPage: vi.fn(),
  goto: vi.fn(), url: vi.fn(), content: vi.fn(), screenshot: vi.fn(), close: vi.fn(),
  recognize: vi.fn(), terminate: vi.fn(), createWorker: vi.fn(),
}));
vi.mock("playwright", () => ({ chromium: { launch: mocks.launch } }));
vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker }));

const baseUrl = "https://moodle.example.edu";
const credentials: MoodleCredentials = { baseUrl, cookie: "MoodleSession=old", userAgent: "Fixture Browser" };
const row: MoodleContentRow = {
  id: "row-1", courseId: "42", courseName: "FIT1001", sectionNumber: 3,
  sectionTitle: "Week 3", module: "label", title: "Week 3 Attendance",
  url: `${baseUrl}/course/view.php?id=42`, text: "Attendance", updatedAt: "2026-01-01T00:00:00Z",
  campus: "malaysia", images: [`${baseUrl}/pluginfile.php/1/attendance.png`],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Global network blocked"); }));
  mocks.launch.mockResolvedValue({ newContext: mocks.newContext, close: mocks.close });
  mocks.newContext.mockResolvedValue({ addCookies: mocks.addCookies, newPage: mocks.newPage });
  mocks.newPage.mockResolvedValue({
    goto: mocks.goto, url: mocks.url, content: mocks.content, screenshot: mocks.screenshot,
  });
  mocks.goto.mockResolvedValue({ ok: () => true });
  mocks.url.mockReturnValue(row.url);
  mocks.content.mockResolvedValue('<body class="loggedin">Course</body>');
  mocks.screenshot.mockResolvedValue(Buffer.from("fixture screenshot"));
  mocks.close.mockResolvedValue(undefined);
  mocks.createWorker.mockResolvedValue({ recognize: mocks.recognize, terminate: mocks.terminate });
  mocks.recognize.mockResolvedValue({ data: { text: "Tutorial 1 10:00 AM ABC123" } });
  mocks.terminate.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("browser cookie projection", () => {
  it("uses the authoritative rotated jar and preserves cookie scope", () => {
    const jar = new CookieJar();
    jar.setCookieSync("MoodleSession=new; Path=/course; Secure; HttpOnly; SameSite=Lax", `${baseUrl}/course`);
    jar.setCookieSync("parent=yes; Domain=example.edu; Path=/; Secure", baseUrl);
    jar.setCookieSync("foreign=no; Path=/", "https://foreign.example.org");
    jar.setCookieSync("expired=no; Max-Age=0; Path=/", baseUrl);
    const result = moodleBrowserCookies({ ...credentials, cookieJar: jar.serializeSync() as MoodleCredentials["cookieJar"] });
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      name: "MoodleSession", value: "new", domain: "moodle.example.edu", path: "/course",
      secure: true, httpOnly: true, sameSite: "Lax",
    });
    expect(result).toContainEqual(expect.objectContaining({ name: "parent", domain: ".example.edu" }));
  });

  it("does not revive a deleted cookie from a legacy header", () => {
    expect(moodleBrowserCookies({ ...credentials, cookieJar: { cookies: [] } })).toEqual([]);
    expect(moodleBrowserCookies({ ...credentials, cookies: [] })).toEqual([]);
  });

  it("preserves captured attributes while rejecting expired and foreign cookies", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const cookie = { name: "MoodleSession", value: "captured", domain: "moodle.example.edu", path: "/my", expires: future, secure: true, httpOnly: true, sameSite: "Strict" as const };
    const result = moodleBrowserCookies({ ...credentials, cookies: [
      cookie, { ...cookie, name: "expired", expires: 0 },
      { ...cookie, name: "foreign", domain: "foreign.example.org" },
      { ...cookie, name: "session", expires: -1, sameSite: "None" },
    ] });
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ ...cookie, sameSite: "Strict" });
    expect(result).toContainEqual(expect.objectContaining({ name: "session", sameSite: "None" }));
    expect(result.find((entry) => entry.name === "session")).not.toHaveProperty("expires");
  });

  it("scopes legacy credentials to the Moodle host", () => {
    expect(moodleBrowserCookies(credentials)).toEqual([{
      name: "MoodleSession", value: "old", domain: "moodle.example.edu", path: "/",
      secure: true, httpOnly: false,
    }]);
  });
});

describe("authenticated Moodle screenshots", () => {
  it("uses the saved browser identity and scoped cookies", async () => {
    await expect(captureMoodlePage(credentials, row.url)).resolves.toEqual(Buffer.from("fixture screenshot"));
    expect(mocks.newContext).toHaveBeenCalledWith({ viewport: { width: 1440, height: 1000 }, userAgent: "Fixture Browser" });
    expect(mocks.addCookies).toHaveBeenCalledWith(moodleBrowserCookies(credentials));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("rejects a foreign origin before launching any browser", async () => {
    await expect(captureMoodlePage(credentials, "https://moodle.example.edu.evil.example/course")).rejects.toThrow("origin");
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it.each([
    ["https://sso.example.edu/login", "<body>Sign in</body>"],
    [`${baseUrl}/login/index.php`, "<body>Sign in</body>"],
    [row.url, '<form id="login"><input type="password"></form>'],
    [row.url, '<body class="notloggedin">Sign in</body>'],
  ])("rejects a login page at %s and closes the browser", async (url, html) => {
    mocks.url.mockReturnValue(url);
    mocks.content.mockResolvedValue(html);
    await expect(captureMoodlePage(credentials, row.url)).rejects.toBeInstanceOf(MoodleSessionExpiredError);
    expect(mocks.screenshot).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("does not screenshot a failed request", async () => {
    mocks.goto.mockResolvedValue({ ok: () => false });
    await expect(captureMoodlePage(credentials, row.url)).rejects.toThrow("request failed");
    expect(mocks.screenshot).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe("Moodle OCR session requests", () => {
  it("uses the injected session fetcher and preserves browser identity", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("image", { headers: { "content-type": "image/png" } }));
    const result = await scanMoodleAttendanceImages(credentials, [row], fetcher);
    expect(result.codes).toHaveLength(1);
    expect(result.failedRowIds).toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(row.images![0], expect.objectContaining({
      headers: { cookie: "MoodleSession=old", "user-agent": "Fixture Browser" }, redirect: "manual",
    }));
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });

  it("discovers images through the same injected session fetcher", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<li class="activity" data-activityname="Attendance"><img src="/pluginfile.php/1/attendance.png"></li>'))
      .mockResolvedValueOnce(new Response("image", { headers: { "content-type": "image/png" } }));
    const result = await scanMoodleAttendanceImages(credentials, [{ ...row, images: [] }], fetcher);
    expect(result.codes).toHaveLength(1);
    expect(result.failedRowIds).toEqual([]);
    expect(fetcher).toHaveBeenNthCalledWith(1, row.url, expect.objectContaining({ redirect: "manual" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, row.images![0], expect.objectContaining({ redirect: "manual" }));
  });

  it("rejects a foreign image before sending credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await scanMoodleAttendanceImages(credentials, [{ ...row, images: ["https://evil.example/image.png"] }], fetcher);
    expect(result).toEqual({ codes: [], failedRowIds: [row.id] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a foreign discovery page before sending credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await scanMoodleAttendanceImages(credentials, [{ ...row, url: "https://evil.example/course", images: [] }], fetcher);
    expect(result).toEqual({ codes: [], failedRowIds: [row.id] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    new Response(null, { status: 302, headers: { location: "https://sso.example.edu" } }),
    new Response("<body>Login</body>", { headers: { "content-type": "text/html" } }),
    new Response(null, { status: 503 }),
  ])("records redirects, HTML and HTTP errors as failed image reads", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(scanMoodleAttendanceImages(credentials, [row], fetcher)).resolves.toEqual({ codes: [], failedRowIds: [row.id] });
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it("does not treat login HTML as an empty discovery result", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<form id="login"><input type="password"></form>'));
    await expect(scanMoodleAttendanceImages(credentials, [{ ...row, images: [] }], fetcher)).resolves.toEqual({ codes: [], failedRowIds: [row.id] });
    expect(mocks.recognize).not.toHaveBeenCalled();
  });
});
