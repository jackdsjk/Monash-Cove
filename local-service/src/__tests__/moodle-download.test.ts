import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadMoodleResource, fileNameForDownload, moodleDownloadFailure, parseContentDispositionFilename, safeDownloadName } from "../moodle-download.js";

describe("Moodle download file names", () => {
  it("uses the resource title and preserves the real extension", () => {
    expect(fileNameForDownload("FIT1047.pdf", "FIT1047 Textbook (pdf version)", "application/pdf")).toBe(
      "FIT1047 Textbook (pdf version).pdf",
    );
  });

  it("uses a title without an extension plus the MIME extension", () => {
    expect(fileNameForDownload("pluginfile.php", "Week 1 slides", "application/pdf")).toBe("Week 1 slides.pdf");
  });

  it("keeps an extension already present in the title", () => {
    expect(fileNameForDownload("download.bin", "Week 1 notes.docx", "application/octet-stream")).toBe(
      "Week 1 notes.docx",
    );
  });

  it("sanitizes unsafe characters", () => {
    expect(safeDownloadName('a/b:c*?"<>|.pdf')).toBe("a_b_c______.pdf");
  });
});


const credentials = { baseUrl: "https://moodle.example.invalid", session: "fixture" };
const resource = `${credentials.baseUrl}/mod/resource/view.php?id=1`;
const plugin = `${credentials.baseUrl}/pluginfile.php/1/notes.pdf`;
const cdn = "https://fixture.cloudfront.net/notes?Signature=fixture&Key-Pair-Id=fixture&Expires=2000000000";
const redirect = (location: string) => new Response(null, { status: 303, headers: { location } });
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Real network blocked"); })));
afterEach(() => vi.unstubAllGlobals());

describe("Muster file download port", () => {
  it.each([
    ['attachment; filename="Lecture 1.pdf"', "Lecture 1.pdf"],
    ["attachment; filename=Notes.pptx", "Notes.pptx"],
    ["attachment; filename*=UTF-8''%E8%AE%B2%E4%B9%89.pdf", "讲义.pdf"],
    ['attachment; filename="a.pdf"; filename*=UTF-8\'\'b.pdf', "a.pdf"],
    ["inline", null], ["", null],
    ["attachment; filename*=UTF-8''100%25%broken.pdf", "100%%broken.pdf"],
  ])("uses upstream Content-Disposition precedence: %s", (header, expected) => {
    expect(parseContentDispositionFilename(header)).toBe(expected);
  });

  it("adds redirect=1 and downloads signed CDN bytes anonymously with the header filename", async () => {
    const authenticated = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname.includes("/mod/") ? redirect(plugin) : redirect(cdn));
    const publicFetcher = vi.fn<typeof fetch>(async () => new Response("%PDF-fixture", { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="Notes.pdf"' } }));
    const file = await downloadMoodleResource(credentials, resource, undefined, authenticated, { publicFetcher });
    expect(file.fileName).toBe("Notes.pdf");
    expect(file.buffer.toString()).toBe("%PDF-fixture");
    expect(new URL(String(authenticated.mock.calls[0][0])).searchParams.get("redirect")).toBe("1");
    expect(authenticated).toHaveBeenCalledTimes(2);
    const init = publicFetcher.mock.calls[0][1]!;
    expect(init).toMatchObject({ credentials: "omit", redirect: "manual" });
    expect(new Headers(init.headers).get("cookie")).toBeNull();
    expect(new Headers(init.headers).get("authorization")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([cdn, "https://external.example.invalid/file.pdf", `${credentials.baseUrl}/pluginfile.php/1/a.pdf`])("rejects direct untrusted input %s", async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(downloadMoodleResource(credentials, url, undefined, fetcher)).rejects.toMatchObject({ code: "invalid_url" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "https://eassessment.example.invalid/quiz", "http://fixture.cloudfront.net/file?Signature=x&Key-Pair-Id=x&Expires=1",
    "https://fixture.cloudfront.net/file", "https://fixture.cloudfront.net.evil.invalid/file?Signature=x&Key-Pair-Id=x&Expires=1",
    "https://fixture.cloudfront.net:8443/file?Signature=x&Key-Pair-Id=x&Expires=1",
    "http://127.0.0.1/private", "https://user:password@fixture.cloudfront.net/file?Signature=x&Key-Pair-Id=x&Expires=1",
  ])("rejects unsafe file redirect %s", async (target) => {
    const authenticated = vi.fn<typeof fetch>(async (input) => String(input).includes("pluginfile.php") ? redirect(target) : redirect(plugin));
    const publicFetcher = vi.fn<typeof fetch>();
    await expect(downloadMoodleResource(credentials, resource, undefined, authenticated, { publicFetcher })).rejects.toBeTruthy();
    expect(publicFetcher).not.toHaveBeenCalled();
  });

  it("does not allow a resource URL to introduce a CDN without pluginfile evidence", async () => {
    const publicFetcher = vi.fn<typeof fetch>();
    await expect(downloadMoodleResource(credentials, resource, undefined, async () => redirect(cdn), { publicFetcher })).rejects.toMatchObject({ code: "external_link" });
    expect(publicFetcher).not.toHaveBeenCalled();
  });

  it("validates every CDN redirect without fetching localhost", async () => {
    const authenticated: typeof fetch = async (input) => String(input).includes("pluginfile.php") ? redirect(cdn) : redirect(plugin);
    const publicFetcher = vi.fn<typeof fetch>(async () => redirect("http://127.0.0.1/private"));
    await expect(downloadMoodleResource(credentials, resource, undefined, authenticated, { publicFetcher })).rejects.toBeTruthy();
    expect(publicFetcher).toHaveBeenCalledTimes(1);
  });

  it("reads pluginfile links from a Moodle HTML wrapper", async () => {
    const fetcher: typeof fetch = async (input) => String(input).includes("pluginfile.php")
      ? new Response("%PDF-fixture", { headers: { "content-type": "application/pdf" } })
      : new Response(`<iframe src="${plugin}"></iframe>`, { headers: { "content-type": "text/html" } });
    expect((await downloadMoodleResource(credentials, resource, "Reading", fetcher)).fileName).toBe("Reading.pdf");
  });

  it.each([404, 503])("retains HTTP %s without claiming login expiry", async (status) => {
    await expect(downloadMoodleResource(credentials, resource, undefined, async () => new Response(null, { status }))).rejects.toMatchObject({ code: "download_failed", message: expect.stringContaining(`HTTP ${status}`) });
  });

  it.each([
    () => redirect(`${credentials.baseUrl}/login/index.php`),
    () => new Response('<form id="login"><input type="password"></form>', { headers: { "content-type": "text/html" } }),
    () => new Response(null, { status: 401 }),
  ])("distinguishes definite Moodle login failures", async (response) => {
    try { await downloadMoodleResource(credentials, resource, undefined, async () => response()); throw new Error("Expected failure"); }
    catch (error) { expect(moodleDownloadFailure(error).code).toBe("session_expired"); }
  });

  it("does not treat a CDN authorization failure as Moodle session expiry", async () => {
    const fetcher: typeof fetch = async (input) => String(input).includes("pluginfile.php") ? redirect(cdn) : redirect(plugin);
    await expect(downloadMoodleResource(credentials, resource, undefined, fetcher, { publicFetcher: async () => new Response(null, { status: 401 }) })).rejects.toMatchObject({ code: "download_failed" });
  });

  it.each([true, false])("bounds declared and streamed bytes (declared=%s)", async (declared) => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(50 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    const response = new Response(stream, { headers: declared ? { "content-length": String(50 * 1024 * 1024 + 1) } : {} });
    await expect(downloadMoodleResource(credentials, resource, undefined, async () => response)).rejects.toMatchObject({ code: "file_too_large" });
    expect(cancelled).toBe(true);
  });

  it("rejects partial responses and redirect loops", async () => {
    await expect(downloadMoodleResource(credentials, resource, undefined, async () => new Response("part", { status: 206 }))).rejects.toMatchObject({ code: "incomplete_file" });
    const fetcher = vi.fn<typeof fetch>(async () => redirect(resource));
    await expect(downloadMoodleResource(credentials, resource, undefined, fetcher)).rejects.toMatchObject({ code: "too_many_redirects" });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("rejects bytes completed after the connection changes", async () => {
    let current = true;
    const response = new Response("fixture");
    const getReader = response.body!.getReader.bind(response.body!);
    vi.spyOn(response.body!, "getReader").mockImplementation((...args: unknown[]) => {
      const reader = getReader(...args as []);
      const read = reader.read.bind(reader);
      reader.read = async () => { const chunk = await read(); if (chunk.done) current = false; return chunk; };
      return reader;
    });
    await expect(downloadMoodleResource(credentials, resource, undefined, async () => response, { assertCurrent: async () => { if (!current) throw new Error("Connection changed"); } })).rejects.toThrow("Connection changed");
  });

  it("never exposes signed queries from upstream exceptions", () => {
    expect(moodleDownloadFailure(new Error(cdn)).message).not.toContain("Signature");
  });
});
