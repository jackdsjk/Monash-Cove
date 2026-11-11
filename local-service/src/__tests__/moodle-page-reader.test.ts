import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMoodlePageReader, MoodlePageReadError } from "../moodle-page-reader.js";
import { MemorySecretStore } from "../secrets.js";
import { MOODLE_CREDENTIALS_KEY } from "../moodle-session.js";
import { MoodleConnectionChangedError, MoodleSessionTransport } from "../moodle-transport.js";
import { MoodleSessionExpiredError } from "../sources/moodle.js";

const baseUrl = "https://moodle.example.invalid";
const page = `${baseUrl}/course/view.php?id=1`;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked"); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("sync-scoped Moodle page reads", () => {
  it("joins concurrent GETs, retains success and keeps different scopes separate", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const pages = createMoodlePageReader(fetcher);
    const reads = Array.from({ length: 6 }, () => pages.text(page));
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish(new Response("<p>course</p>"));
    expect(await Promise.all(reads)).toEqual(Array(6).fill("<p>course</p>"));
    expect(await pages.text(page)).toBe("<p>course</p>");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockImplementation(async () => new Response("<p>new sync</p>"));
    expect(await createMoodlePageReader(fetcher).text(page)).toBe("<p>new sync</p>");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retain HTTP errors or login pages", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response('<form action="/login/index.php"><input type="password"></form>'))
      .mockResolvedValueOnce(new Response("<p>recovered</p>"));
    const pages = createMoodlePageReader(fetcher);
    await expect(pages.text(page)).rejects.toMatchObject({ status: 503 });
    await expect(pages.text(page)).rejects.toBeInstanceOf(MoodleSessionExpiredError);
    expect(await pages.text(page)).toBe("<p>recovered</p>");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([401, 404])("classifies HTTP %s without exposing the URL", async (status) => {
    const pages = createMoodlePageReader(async () => new Response("failure", { status }));
    await expect(pages.text(page)).rejects.toBeInstanceOf(status === 401 ? MoodleSessionExpiredError : MoodlePageReadError);
    await expect(pages.text(page)).rejects.not.toThrow(baseUrl);
  });

  it("rejects redirects to login and other origins", async () => {
    for (const url of [`${baseUrl}/login/index.php`, "https://sso.example.invalid/authorize"]) {
      const response = new Response("<p>login</p>");
      Object.defineProperty(response, "url", { value: url });
      await expect(createMoodlePageReader(async () => response).text(page)).rejects.toBeInstanceOf(MoodleSessionExpiredError);
    }
  });

  it("bounds retained entries and bytes and refreshes recently used entries", async () => {
    const fetcher = vi.fn(async () => new Response("abcd"));
    const pages = createMoodlePageReader(fetcher, { maxEntries: 2, maxRetainedBytes: 8 });
    await pages.text(`${page}&n=1`);
    await pages.text(`${page}&n=2`);
    await pages.text(`${page}&n=1`);
    await pages.text(`${page}&n=3`);
    await pages.text(`${page}&n=1`);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await pages.text(`${page}&n=2`);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const bytes = createMoodlePageReader(fetcher, { maxEntries: 10, maxRetainedBytes: 6 });
    await bytes.text(`${page}&n=1`);
    await bytes.text(`${page}&n=2`);
    await bytes.text(`${page}&n=1`);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it("rejects oversized streamed bodies and declared lengths without retaining them", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("too large")); }, cancel,
    })));
    const pages = createMoodlePageReader(fetcher, { maxPageBytes: 4 });
    await expect(pages.text(page)).rejects.toThrow("size limit");
    await expect(pages.text(page)).rejects.toThrow("size limit");
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(createMoodlePageReader(async () => new Response("large", { headers: { "content-length": "5" } }), { maxPageBytes: 4 }).text(page)).rejects.toThrow("size limit");
  });

  it("cancels one waiter without cancelling or stranding the shared download", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn((_input, init?: RequestInit) => new Promise<Response>((resolve) => {
      expect(init?.signal?.aborted).toBe(false); finish = resolve;
    }));
    const pages = createMoodlePageReader(fetcher);
    const abort = new AbortController();
    const first = pages.text(page, { signal: abort.signal });
    const rejected = expect(first).rejects.toThrow("cancelled");
    const second = pages.text(page);
    await Promise.resolve();
    abort.abort(new Error("cancelled"));
    await rejected;
    finish(new Response("shared"));
    expect(await second).toBe("shared");
    expect(await pages.text(page)).toBe("shared");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("separates header variants and rejects writes", async () => {
    const fetcher = vi.fn(async () => new Response("ok"));
    const pages = createMoodlePageReader(fetcher);
    await pages.text(page, { headers: { accept: "text/html" } });
    await pages.text(page, { headers: { accept: "application/xhtml+xml" } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(pages.text(page, { method: "POST" })).rejects.toThrow("only supports GET");
  });

  it("rejects old retained pages and in-flight reads after explicit reconnect", async () => {
    const initial = JSON.stringify({ baseUrl, cookie: "MoodleSession=first" });
    const secrets = new MemorySecretStore();
    await secrets.set(MOODLE_CREDENTIALS_KEY, initial);
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(async () => new Response("old account"));
    const transport = new MoodleSessionTransport({ secrets, fetcher });
    try {
      const pages = createMoodlePageReader(transport.forCredentials(initial));
      expect(await pages.text(page)).toBe("old account");
      fetcher.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
      const pending = pages.text(`${page}&pending=1`);
      const rejected = expect(pending).rejects.toBeInstanceOf(MoodleConnectionChangedError);
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      await transport.replaceCredentials(initial);
      finish(new Response("late old account"));
      await rejected;
      await expect(pages.text(page)).rejects.toBeInstanceOf(MoodleConnectionChangedError);
      fetcher.mockImplementation(async () => new Response("new connection"));
      const raw = await secrets.get(MOODLE_CREDENTIALS_KEY);
      expect(await createMoodlePageReader(transport.forCredentials(raw!)).text(page)).toBe("new connection");
    } finally { transport.close(); }
  });
});
