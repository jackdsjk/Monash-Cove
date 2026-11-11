/**
 * Adapted from Always-Ontrack src/lib/api.ts at
 * 4e038b4af7f030cd4cdf07832c7e472184a2f519 (Copyright 2026 Mark).
 * SPDX-License-Identifier: Apache-2.0
 * See ../vendor/always-ontrack/LICENSE.
 * Modified for Cove: validate local DTOs, decode filename*, and return only a
 * safe extension/MIME instead of forwarding the remote Content-Disposition.
 */
export interface OnTrackArtifact {
  body: Buffer;
  contentType: string;
  contentDisposition: string | null;
}

export type OnTrackArtifactKind = "task" | "submission" | "resources";

export const ONTRACK_MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

/** Extract only the filename token; never return it as a response header. */
export function contentDispositionFilename(disposition: string | null): string | undefined {
  const encoded = disposition?.match(/(?:^|;)\s*filename\*\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  const plain = disposition?.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^\s;]+))/i);
  const raw = encoded ? (encoded[1] ?? encoded[2]).trim().replace(/^[^']*'[^']*'/, "") : plain?.[1] ?? plain?.[2];
  if (raw === undefined) return undefined;
  const token = raw.trim().replace(/^'(.*)'$/, "$1");
  try { return decodeURIComponent(token).trim(); } catch { return token; }
}

/** OnTrack serves these placeholder PDFs with HTTP 200, even for resources. */
function requireAvailableDownload(download: OnTrackArtifact): void {
  const name = contentDispositionFilename(download.contentDisposition)?.split(/[\\/]/).pop();
  if (/^(FileNotFound|AwaitingProcessing)\.pdf$/i.test(name ?? "")) {
    throw new Error("OnTrack 文件不存在或仍在处理中，请稍后重试。");
  }
}

function isZip(body: Buffer): boolean {
  const [first, second, third, fourth] = body;
  return first === 0x50 && second === 0x4b &&
    ((third === 0x03 && fourth === 0x04) ||
      (third === 0x05 && fourth === 0x06) ||
      (third === 0x07 && fourth === 0x08));
}

function requirePdfDownload(download: OnTrackArtifact): void {
  if (download.body.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("OnTrack 返回的文件不是有效的 PDF。");
  }
}

/** Uploaded resources are ZIPs; linked resources retain their declared type. */
export function validateOnTrackArtifact(download: OnTrackArtifact, kind: OnTrackArtifactKind): { extension: string; contentType: string } {
  requireAvailableDownload(download);
  if (kind !== "resources") {
    requirePdfDownload(download);
    return { extension: ".pdf", contentType: "application/pdf" };
  }
  const filename = contentDispositionFilename(download.contentDisposition);
  const extension = filename?.match(/\.[A-Za-z0-9]{1,10}$/)?.[0]?.toLowerCase();
  if (extension === ".pdf") {
    requirePdfDownload(download);
    return { extension, contentType: "application/pdf" };
  }
  if (extension !== undefined && extension !== ".zip") {
    return { extension, contentType: download.contentType };
  }
  if (!isZip(download.body)) throw new Error("OnTrack 返回的任务资源不是有效的 ZIP 文件。");
  return { extension: ".zip", contentType: "application/zip" };
}
