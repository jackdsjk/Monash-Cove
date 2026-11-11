import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { MemorySecretStore } from "../secrets.js";
import { fetchOnTrackArtifact } from "../sources/ontrack.js";
import { ONTRACK_MAX_ARTIFACT_BYTES, validateOnTrackArtifact, type OnTrackArtifact } from "../sources/ontrack-artifacts.js";

const pdf = "%PDF-1.7\nfixture only";
const zip = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]);
const baseUrl = "https://ontrack.example.invalid/api";

function artifact(body: string | Uint8Array, filename?: string): OnTrackArtifact {
  return {
    body: Buffer.from(body), contentType: "application/octet-stream",
    contentDisposition: filename ? `attachment; filename="${filename}"` : null,
  };
}

describe("OnTrack artifact validation adapted from Always-Ontrack", () => {
  it.each(["task", "submission"] as const)("requires a PDF signature for %s", (kind) => {
    expect(validateOnTrackArtifact(artifact(pdf), kind)).toEqual({ extension: ".pdf", contentType: "application/pdf" });
    expect(() => validateOnTrackArtifact(artifact("<html>Login required</html>"), kind)).toThrow("PDF");
    expect(() => validateOnTrackArtifact(artifact(""), kind)).toThrow("PDF");
  });

  it.each(["FileNotFound.pdf", "AwaitingProcessing.pdf"])("rejects HTTP-200 placeholder %s", (name) => {
    for (const kind of ["task", "submission", "resources"] as const) {
      expect(() => validateOnTrackArtifact(artifact(pdf, name), kind)).toThrow("文件不存在或仍在处理中");
    }
  });

  it("also rejects a single-quoted placeholder filename", () => {
    const download = artifact(pdf);
    download.contentDisposition = "attachment; filename='FileNotFound.pdf'";
    expect(() => validateOnTrackArtifact(download, "task")).toThrow("文件不存在或仍在处理中");
  });

  it("also rejects a percent-encoded filename* placeholder", () => {
    const download = artifact(pdf);
    download.contentDisposition = "attachment; filename*=UTF-8''%46ileNotFound.pdf";
    expect(() => validateOnTrackArtifact(download, "resources")).toThrow("文件不存在或仍在处理中");
  });

  it("retains a linked resource extension and validates linked PDFs", () => {
    expect(validateOnTrackArtifact(artifact(pdf, "linked-sheet.PDF"), "resources"))
      .toEqual({ extension: ".pdf", contentType: "application/pdf" });
    expect(validateOnTrackArtifact(artifact("fixture content", "notes.txt"), "resources").extension).toBe(".txt");
    expect(() => validateOnTrackArtifact(artifact("Not PDF", "linked.pdf"), "resources")).toThrow("PDF");
  });

  it("recognizes ZIP signatures and rejects error pages or misleading ZIP declarations", () => {
    expect(validateOnTrackArtifact(artifact(zip), "resources")).toEqual({ extension: ".zip", contentType: "application/zip" });
    expect(validateOnTrackArtifact(artifact(zip, "uploaded.zip"), "resources").extension).toBe(".zip");
    expect(() => validateOnTrackArtifact(artifact("<html>Login</html>"), "resources")).toThrow("ZIP");
    expect(() => validateOnTrackArtifact(artifact(pdf, "uploaded.zip"), "resources")).toThrow("ZIP");
  });
});

let directory: string;
let app: FastifyInstance;
let downloadResponse: () => Response;
let calls: string[];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "cove-ontrack-artifacts-"));
  vi.stubEnv("ONTRACK_CONFIG_DIR", directory);
  calls = [];
  downloadResponse = () => new Response(pdf, { headers: { "content-type": "application/pdf" } });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url === `${baseUrl}/auth/access-token`) return Response.json({
      auth_token: "fixture-token", auth_token_expiry: new Date(Date.now() + 3_600_000).toISOString(),
      user: { id: 123, username: "fixture-user" },
    });
    if (url === `${baseUrl}/projects`) return Response.json([{ id: 1, unit: { id: 2, code: "TEST1001", name: "Fixture" } }]);
    if (/^https:\/\/ontrack\.example\.invalid\/api\/(units\/2\/task_definitions\/3\/(task_pdf|task_resources)\.json|projects\/1\/task_def_id\/3\/submission)/.test(url)) return downloadResponse();
    throw new Error(`Unexpected network URL in isolated test: ${url}`);
  }));
  const secrets = new MemorySecretStore();
  await secrets.set("ontrack-credentials", JSON.stringify({ baseUrl, username: "fixture-user", refreshToken: "fixture-refresh" }));
  app = buildApp({ dbPath: join(directory, "fixture.sqlite"), secretStore: secrets, moodleSessionCheck: false });
});

afterEach(async () => {
  await app?.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("OnTrack artifact HTTP route", () => {
  it.each([
    "project=0&task=3", "project=-1&task=3", "project=1.5&task=3",
    "project=1&task=0", "project=1&task=9007199254740992", "project=1&task=3&kind=unknown",
  ])("rejects invalid target or kind before requesting upstream: %s", async (query) => {
    const result = await app.inject(`/api/ontrack/artifact?${query}`);
    expect(result.statusCode).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns a 502 instead of downloading an HTTP-200 placeholder", async () => {
    downloadResponse = () => new Response(pdf, { headers: { "content-disposition": 'attachment; filename="AwaitingProcessing.pdf"' } });
    const response = await app.inject("/api/ontrack/artifact?project=1&task=3&kind=submission");
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toMatchObject({ code: "ontrack_download_failed", message: expect.stringContaining("仍在处理中") });
    expect(response.headers["content-disposition"]).toBeUndefined();
  });

  it("keeps linked PDF resources as PDF and generates its own safe download name", async () => {
    downloadResponse = () => new Response(pdf, { headers: {
      "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="../../private student sheet.PDF"',
    } });
    const response = await app.inject("/api/ontrack/artifact?project=1&task=3&kind=resources");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe('attachment; filename="ontrack-resources-3.pdf"');
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toBe(pdf);
  });

  it("downloads uploaded ZIP resources under a ZIP name", async () => {
    downloadResponse = () => new Response(zip);
    const response = await app.inject("/api/ontrack/artifact?project=1&task=3&kind=resources");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe('attachment; filename="ontrack-resources-3.zip"');
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.rawPayload).toEqual(Buffer.from(zip));
  });

  it("rejects an invalid task-sheet body and a partial response", async () => {
    downloadResponse = () => new Response("<html>Login required</html>");
    expect((await app.inject("/api/ontrack/artifact?project=1&task=3")).statusCode).toBe(502);
    downloadResponse = () => new Response(pdf, { status: 206 });
    const partial = await app.inject("/api/ontrack/artifact?project=1&task=3");
    expect(partial.statusCode).toBe(502);
    expect(partial.json().error.message).toContain("完整文件");
  });

  it("rejects an oversized declared download before reading its body", async () => {
    const cancel = vi.fn();
    downloadResponse = () => new Response(new ReadableStream({ cancel }), {
      headers: { "content-length": String(ONTRACK_MAX_ARTIFACT_BYTES + 1) },
    });
    await expect(fetchOnTrackArtifact("/units/2/task_definitions/3/task_pdf.json")).rejects.toThrow("25 MiB");
    expect(cancel).toHaveBeenCalled();
  });

  it("stops an oversized streaming body even if Content-Length is absent", async () => {
    const cancel = vi.fn();
    downloadResponse = () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(ONTRACK_MAX_ARTIFACT_BYTES + 1)); }, cancel,
    }));
    await expect(fetchOnTrackArtifact("/units/2/task_definitions/3/task_pdf.json")).rejects.toThrow("25 MiB");
    expect(cancel).toHaveBeenCalled();
  });
});
