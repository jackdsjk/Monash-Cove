import { parse } from "node-html-parser";
import { MoodleSessionExpiredError } from "./sources/moodle.js";
import { MoodleConnectionChangedError } from "./moodle-transport.js";

export interface MoodleCredentials {
  baseUrl: string;
  /** Raw MoodleSession value; kept for older saved credentials. */
  session?: string;
  /** Full cookie header captured from the login browser, when available. */
  cookie?: string;
  userAgent?: string;
  cookies?: Array<{
    name: string; value: string; domain: string; path: string; expires?: number;
    secure?: boolean; httpOnly?: boolean; sameSite?: "Strict" | "Lax" | "None";
  }>;
  cookieJar?: { cookies: Array<Record<string, unknown>>; [key: string]: unknown };
}

export function moodleCookieHeader(credentials: { session?: string; cookie?: string }): string {
  if (credentials.cookie) return credentials.cookie;
  if (credentials.session) return `MoodleSession=${credentials.session}`;
  throw new Error("Moodle credentials are missing both a session and a cookie header.");
}

export class MoodleDownloadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MoodleDownloadError";
  }
}

export interface DownloadedFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/msword": ".doc",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.ms-excel": ".xls",
  "text/plain": ".txt",
  "text/html": ".html",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "application/json": ".json",
};

export function safeDownloadName(value: string) {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 180);
}

export function fileNameForDownload(actualName: string, preferredName?: string, contentType?: string) {
  const actual = safeDownloadName(actualName);
  const title = preferredName ? safeDownloadName(preferredName) : actual;
  if (!title) return "moodle-file";
  const actualExtension = /\.[A-Za-z0-9]{1,8}$/.exec(actual)?.[0] ?? "";
  const titleHasExtension = /\.[A-Za-z0-9]{1,8}$/.test(title);
  if (titleHasExtension) return title;
  const mimeExtension = contentType ? MIME_EXTENSIONS[contentType.split(";")[0].trim()] ?? "" : "";
  const usefulActualExtension = /\.(php|aspx?|cgi)$/i.test(actualExtension) ? "" : actualExtension;
  return `${title}${usefulActualExtension || mimeExtension}`;
}

/** Ported from pinned Muster scraper.rs::percent_decode; malformed escapes survive. */
function percentDecode(value: string): string {
  const bytes = Buffer.from(value);
  const output: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const hex = bytes.subarray(i + 1, i + 3).toString();
    if (bytes[i] === 37 && /^[a-f\d]{2}$/i.test(hex)) {
      output.push(Number.parseInt(hex, 16));
      i += 2;
    } else output.push(bytes[i]);
  }
  return Buffer.from(output).toString("utf8");
}

/** Ported from pinned Muster scraper.rs::parse_content_disposition_filename.
 * Plain filename takes precedence over filename*, matching upstream.
 * Copyright 2026 Poetrynan; PolyForm Noncommercial 1.0.0. See vendor/muster/NOTICE.
 */
export function parseContentDispositionFilename(value: string): string | null {
  const plainIndex = value.indexOf("filename=");
  if (plainIndex >= 0) {
    const plain = value.slice(plainIndex + 9).split(";")[0].trim().replace(/^"+|"+$/g, "").trim();
    if (plain) return plain;
  }
  const encodedIndex = value.indexOf("filename*=");
  if (encodedIndex >= 0) {
    const raw = value.slice(encodedIndex + 10).split(";")[0];
    const first = raw.indexOf("'");
    const second = first >= 0 ? raw.indexOf("'", first + 1) : -1;
    if (second >= 0 && raw.slice(second + 1)) return percentDecode(raw.slice(second + 1));
    if (raw) return percentDecode(raw);
  }
  return null;
}

/** Safe public reasons only; never return upstream URLs, signed queries or raw fetch errors. */
export function moodleDownloadFailure(error: unknown): MoodleDownloadError {
  if (error instanceof MoodleDownloadError) return error;
  if (error instanceof MoodleSessionExpiredError) return new MoodleDownloadError(409, "session_expired", "Moodle 登录已失效，请到来源页重新连接后重试下载。");
  if (error instanceof MoodleConnectionChangedError) return new MoodleDownloadError(409, "connection_changed", "Moodle 连接已更改，请重新读取资料后下载。");
  return new MoodleDownloadError(502, "download_failed", "文件下载暂时失败，请稍后重试。");
}

function isFileUrl(url: URL): boolean {
  return /^\/pluginfile\.php(?:\/|$)/.test(url.pathname);
}

/** Only a Moodle file response may introduce a signed CloudFront download. */
function isSignedCdn(url: URL): boolean {
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
    /^[a-z0-9-]+\.cloudfront\.net$/i.test(url.hostname) &&
    !!url.searchParams.get("Signature") && !!url.searchParams.get("Key-Pair-Id") &&
    !!(url.searchParams.get("Expires") || url.searchParams.get("Policy"));
}

async function boundedFile(response: Response): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > MAX_FILE_BYTES) {
    await response.body?.cancel();
    throw new MoodleDownloadError(413, "file_too_large", "文件超过 50 MB 下载限制。");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new MoodleDownloadError(502, "download_failed", "文件服务返回空内容，请重试。");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new MoodleDownloadError(413, "file_too_large", "文件超过 50 MB 下载限制。");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

export async function downloadMoodleResource(
  credentials: MoodleCredentials,
  resourceUrl: string,
  preferredName?: string,
  fetcher: typeof fetch = fetch,
  options: { publicFetcher?: typeof fetch; assertCurrent?: () => Promise<void> } = {},
): Promise<DownloadedFile> {
  const base = new URL(credentials.baseUrl);
  let current: URL;
  try { current = new URL(resourceUrl); }
  catch { throw new MoodleDownloadError(400, "invalid_url", "资料链接无效，请重新同步资料。"); }
  if (current.origin !== base.origin || current.username || current.password ||
    !/^\/mod\/(?:resource|url)\/view\.php$/.test(current.pathname)) {
    throw new MoodleDownloadError(400, "invalid_url", "只能下载 Moodle 的资料或文件链接。");
  }
  // Pinned Muster scraper.rs::download_file: ask Moodle for the real file,
  // instead of downloading its HTML viewer. See vendor/muster/NOTICE.
  if (current.pathname === "/mod/resource/view.php") current.searchParams.set("redirect", "1");
  const headers = { cookie: moodleCookieHeader(credentials) };
  let filePhase = false;
  for (let hop = 0; hop < 6; hop += 1) {
    await options.assertCurrent?.();
    const sameOrigin = current.origin === base.origin;
    if (!sameOrigin && (!filePhase || !isSignedCdn(current))) {
      throw new MoodleDownloadError(400, "invalid_file", "文件跳转到不支持的下载地址，请在 Moodle 中打开。");
    }
    // CDN URLs carry their own signature. Never forward Moodle cookies or auth,
    // and never pass this request through the authenticated session transport.
    const response = sameOrigin
      ? await fetcher(current, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) })
      : await (options.publicFetcher ?? fetch)(current, { credentials: "omit", redirect: "manual", signal: AbortSignal.timeout(30_000) });
    await options.assertCurrent?.();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new MoodleDownloadError(502, "download_failed", "文件跳转地址缺失，请重试。");
      const next = new URL(location, current);
      if (next.username || next.password) throw new MoodleDownloadError(400, "invalid_file", "文件跳转地址无效。");
      if (next.origin === base.origin) {
        if (/^\/(?:login|signin)(?:\/|\.php|$)/i.test(next.pathname)) throw new MoodleSessionExpiredError();
        if (isFileUrl(next)) filePhase = true;
        else if (!/^\/mod\/(?:resource|url)\/view\.php$/.test(next.pathname)) {
          throw new MoodleDownloadError(400, "invalid_file", "Moodle 未返回可下载的文件地址。");
        }
      } else if (!filePhase || !isSignedCdn(next)) {
        throw new MoodleDownloadError(422, "external_link", "该资源是外部网页链接，无法打包为文件；请在 Moodle 中打开。");
      }
      current = next;
      continue;
    }
    if (sameOrigin && response.status === 401) { await response.body?.cancel(); throw new MoodleSessionExpiredError(); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new MoodleDownloadError(response.status === 404 ? 404 : 502, "download_failed", `文件服务返回 HTTP ${response.status}，请稍后重试或在 Moodle 中核对访问权限。`);
    }
    if (response.status === 206) {
      await response.body?.cancel();
      throw new MoodleDownloadError(502, "incomplete_file", "文件服务仅返回部分内容，请重试下载。");
    }
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await boundedFile(response);
    await options.assertCurrent?.();
    if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      const root = parse(buffer.toString("utf8"));
      if (root.querySelector('form input[type="password"], form#login, form#loginform, body.notloggedin, body#page-login-index')) {
        if (sameOrigin) throw new MoodleSessionExpiredError();
        throw new MoodleDownloadError(502, "invalid_file", "文件服务返回网页，请在 Moodle 中打开或重试。");
      }
      if (!filePhase) {
        const link = root.querySelector("a[href*='pluginfile.php'], iframe[src*='pluginfile.php'], object[data*='pluginfile.php']");
        const value = link?.getAttribute("href") ?? link?.getAttribute("src") ?? link?.getAttribute("data");
        if (value) {
          const next = new URL(value, current);
          if (next.origin !== base.origin || next.username || next.password || !isFileUrl(next)) throw new MoodleDownloadError(400, "invalid_file", "Moodle 文件地址无效。");
          current = next; filePhase = true; continue;
        }
      }
      if (!/attachment/i.test(response.headers.get("content-disposition") ?? "")) {
        throw new MoodleDownloadError(404, "file_not_found", "该资源未提供可下载文件，可能是网页或外部工具；请在 Moodle 中打开。");
      }
    }
    const actualName = parseContentDispositionFilename(response.headers.get("content-disposition") ?? "")
      ?? percentDecode(current.pathname.split("/").pop() ?? "moodle-file");
    return { buffer, fileName: fileNameForDownload(actualName, preferredName, contentType), contentType };
  }
  throw new MoodleDownloadError(502, "too_many_redirects", "文件跳转次数过多，请在 Moodle 中打开或稍后重试。");
}
