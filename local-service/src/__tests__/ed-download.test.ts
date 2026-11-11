import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { MemorySecretStore } from "../secrets.js";

let app: FastifyInstance | undefined;
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "cove-ed-download-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", directory);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network blocked"); }));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

const asset = "https://static.edusercontent.com/files/fixture";
const pdf = () => new Response("%PDF-fixture", { headers: { "content-type": "application/pdf" } });
async function setup(fetcher: typeof fetch) {
  const secrets = new MemorySecretStore();
  await secrets.set("ed-credentials", JSON.stringify({ token: "fixture-token", region: "au" }));
  app = buildApp({ dbPath: ":memory:", seed: false, secretStore: secrets, fetcher });
  return secrets;
}
const batch = (files: Array<{ name: string; url: string }>, markdown = "# Fixture lesson") => app!.inject({
  method: "POST", url: "/api/ed/download-batch", payload: { files, markdown, lessonTitle: "Fixture" },
});

describe("Ed attachment downloads", () => {
  it("downloads PDF bytes anonymously with a safe filename", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
      return pdf();
    });
    await setup(fetcher);
    const response = await app!.inject(`/api/ed/download?url=${encodeURIComponent(asset)}&name=Notes.pdf`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("%PDF-fixture");
    expect(response.headers["content-disposition"]).toContain("Notes.pdf");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports actual attachment successes and safe partial failure reasons in the ZIP", async () => {
    await setup(async (input) => String(input).endsWith("/missing") ? new Response(null, { status: 404 }) : pdf());
    const response = await batch([{ name: "Notes.pdf", url: asset }, { name: "Missing.pdf", url: `${asset}/missing` }]);
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-cove-batch-count"]).toBe("1");
    expect(response.headers["x-cove-batch-skipped"]).toBe("1");
    const zip = await JSZip.loadAsync(response.rawPayload);
    expect(await zip.file("Notes.pdf")!.async("string")).toBe("%PDF-fixture");
    expect(zip.file("lesson.md")).not.toBeNull();
    const report = await zip.file("下载说明.txt")!.async("string");
    expect(report).toContain("Missing.pdf：Ed 文件服务返回 HTTP 404");
    expect(report).not.toMatch(/https:|token/);
  });

  it("does not claim success for a Markdown-only archive when all requested attachments failed", async () => {
    await setup(async () => new Response(null, { status: 503 }));
    const response = await batch([{ name: "Notes.pdf", url: asset }]);
    expect(response.statusCode).toBe(502);
    expect(response.json().error.message).toContain("HTTP 503");
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("still exports lessons that deliberately have no attachments", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await setup(fetcher);
    const response = await batch([]);
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-cove-batch-count"]).toBe("0");
    expect(Object.keys((await JSZip.loadAsync(response.rawPayload)).files)).toEqual(["lesson.md"]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["https://outside.invalid/notes.pdf", "https://edstem.org.evil.invalid/notes.pdf", "http://127.0.0.1/private", "https://static.edusercontent.com:8443/a.pdf", "https://user:pass@static.edusercontent.com/a.pdf"])("rejects unsafe download addresses before fetching", async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    await setup(fetcher);
    const response = await batch([{ name: "Notes.pdf", url }]);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(response.body).not.toMatch(/outside.invalid|user:pass/);
  });

  it("rejects an unsafe redirect and hides raw upstream exceptions", async () => {
    await setup(async () => new Response(null, { status: 303, headers: { location: "http://127.0.0.1/private" } }));
    expect((await batch([{ name: "Notes.pdf", url: asset }])).statusCode).toBe(400);
    await app!.close();
    app = undefined;
    await setup(async () => { throw new Error("secret-token https://static.edusercontent.com/file?Signature=private"); });
    const failed = await batch([{ name: "Notes.pdf", url: asset }]);
    expect(failed.body).not.toMatch(/secret-token|Signature|https:/);
  });

  it.each([206, 200])("rejects partial or non-PDF responses (%s)", async (status) => {
    await setup(async () => new Response("<html>not a PDF</html>", { status, headers: { "content-type": "text/html" } }));
    const response = await batch([{ name: "Notes.pdf", url: asset }]);
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe(status === 206 ? "incomplete_file" : "invalid_file");
  });

  it.each([true, false])("bounds both declared and actual streamed bytes (declared=%s)", async (declared) => {
    let cancelled = false;
    await setup(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(100 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    }), { headers: declared ? { "content-length": String(100 * 1024 * 1024 + 1) } : {} }));
    const response = await app!.inject(`/api/ed/download?url=${encodeURIComponent(asset)}`);
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("too_large");
    expect(cancelled).toBe(true);
  });

  it.each([false, true])("rejects download bytes after token change/disconnect (disconnect=%s)", async (disconnect) => {
    let secrets: MemorySecretStore;
    secrets = await setup(async () => {
      if (disconnect) await secrets.delete("ed-credentials");
      else await secrets.set("ed-credentials", JSON.stringify({ token: "new-account", region: "au" }));
      return pdf();
    });
    const response = await batch([{ name: "Notes.pdf", url: asset }]);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("connection_changed");
    expect(response.body).not.toContain("%PDF");
  });

  it("avoids collisions between attachment names, lesson Markdown and failure explanations", async () => {
    await setup(async (input) => String(input).endsWith("/missing") ? new Response(null, { status: 404 }) : new Response("file"));
    const response = await batch([
      { name: "lesson.md", url: asset }, { name: "下载说明.txt", url: asset }, { name: "bad.pdf", url: `${asset}/missing` },
    ]);
    const zip = await JSZip.loadAsync(response.rawPayload);
    expect(Object.keys(zip.files)).toContain("lesson (2).md");
    expect(Object.keys(zip.files)).toContain("_下载说明.txt");
  });
});
