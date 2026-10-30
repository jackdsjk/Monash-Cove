import { parse } from "node-html-parser";

export interface MoodleCredentials {
  baseUrl: string;
  session: string;
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
  const actual = safeDownloadName(decodeURIComponent(actualName));
  const title = preferredName ? safeDownloadName(preferredName) : actual;
  if (!title) return "moodle-file";
  const actualExtension = /\.[A-Za-z0-9]{1,8}$/.exec(actual)?.[0] ?? "";
  const titleHasExtension = /\.[A-Za-z0-9]{1,8}$/.test(title);
  if (titleHasExtension) return title;
  const mimeExtension = contentType ? MIME_EXTENSIONS[contentType.split(";")[0].trim()] ?? "" : "";
  const usefulActualExtension = /\.(php|aspx?|cgi)$/i.test(actualExtension) ? "" : actualExtension;
  return `${title}${usefulActualExtension || mimeExtension}`;
}

export async function downloadMoodleResource(
  credentials: MoodleCredentials,
  resourceUrl: string,
  preferredName?: string,
  fetcher: typeof fetch = fetch,
): Promise<DownloadedFile> {
  const base = new URL(credentials.baseUrl);
  let target: URL;
  try {
    target = new URL(resourceUrl);
  } catch {
    throw new MoodleDownloadError(400, "invalid_url", "Invalid Moodle URL.");
  }
  if (
    target.origin !== base.origin ||
    (!target.pathname.startsWith("/mod/resource/view.php") && !target.pathname.startsWith("/mod/url/view.php"))
  ) {
    throw new MoodleDownloadError(400, "invalid_url", "Only Moodle resource or URL pages can be downloaded.");
  }
  const headers = { cookie: `MoodleSession=${credentials.session}` };
  let current = target;
  let fileUrl: string | null = null;
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetcher(current, { headers, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      if (next.origin !== base.origin) throw new MoodleDownloadError(400, "invalid_file", "Moodle returned an untrusted redirect.");
      if (next.pathname.startsWith("/pluginfile.php")) {
        fileUrl = next.toString();
        break;
      }
      if (next.pathname.startsWith("/mod/resource/view.php") || next.pathname.startsWith("/mod/url/view.php")) {
        current = next;
        continue;
      }
      break;
    }
    if (!response.ok) break;
    const link = parse(await response.text()).querySelector("a[href*='pluginfile.php']");
    const href = link?.getAttribute("href");
    if (href) fileUrl = new URL(href, current).toString();
    break;
  }
  if (!fileUrl) throw new MoodleDownloadError(404, "file_not_found", "No downloadable file found for this resource.");
  const fileTarget = new URL(fileUrl);
  if (fileTarget.origin !== base.origin || !fileTarget.pathname.startsWith("/pluginfile.php")) {
    throw new MoodleDownloadError(400, "invalid_file", "Moodle returned an untrusted file URL.");
  }
  const file = await fetcher(fileTarget, { headers });
  if (!file.ok) throw new MoodleDownloadError(502, "download_failed", `Moodle file returned HTTP ${file.status}.`);
  const size = Number(file.headers.get("content-length") ?? 0);
  if (size > MAX_FILE_BYTES) throw new MoodleDownloadError(413, "file_too_large", "File exceeds the 50 MB local limit.");
  const contentType = file.headers.get("content-type") ?? "application/octet-stream";
  const actualName = fileTarget.pathname.split("/").pop() ?? "moodle-file";
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: fileNameForDownload(actualName, preferredName, contentType),
    contentType,
  };
}
