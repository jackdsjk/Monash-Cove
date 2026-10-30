import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "node-html-parser";
import type { MoodleContentRow } from "../domain.js";
import type { AttendanceCode } from "./parser.js";

const execFileAsync = promisify(execFile);

export interface MoodleAttendanceCredentials {
  baseUrl: string;
  session: string;
}

function courseCode(value: string) {
  return (/^[A-Z]{2,5}\d{3,4}/i.exec(value)?.[0] ?? value).toUpperCase();
}

function weekOf(value: string) {
  const match = /\bweek\s*(\d{1,2})\b/i.exec(value);
  return match ? Number(match[1]) : null;
}

function parseOcrLines(text: string, row: MoodleContentRow, url: string): AttendanceCode[] {
  const week = weekOf(`${row.title} ${row.sectionTitle}`);
  if (!week) return [];
  const course = courseCode(row.courseName);
  const codes: AttendanceCode[] = [];
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!/tutorial|workshop|applied/i.test(normalized)) continue;
    const match = /\b(tutorial|workshop|applied)\b.*?\b(\d{1,2})\s+\d{1,2}:\d{2}\s*[AP]M\s+([A-Z0-9]{3,8})\b/i.exec(normalized);
    if (!match) continue;
    const session = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${Number(match[2])}`;
    const code = match[3].toUpperCase();
    codes.push({
      id: `ocr:${row.id}:${session}:${code}`,
      source: "moodle",
      course,
      week,
      session,
      code,
      title: row.title,
      url,
      publishedAt: row.updatedAt,
    });
  }
  return codes;
}

async function ocrImage(buffer: Buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cove-attendance-ocr-"));
  try {
    const file = path.join(dir, "image.png");
    await writeFile(file, buffer);
    const { stdout } = await execFileAsync("tesseract", [path.basename(file), "stdout", "--psm", "6"], { cwd: dir, timeout: 20_000 });
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function scanMoodleAttendanceImages(
  credentials: MoodleAttendanceCredentials,
  rows: MoodleContentRow[],
): Promise<AttendanceCode[]> {
  if (process.platform === "win32") return [];
  const labels = rows.filter((row) => row.module === "label" && /attendance/i.test(row.title));
  const found: AttendanceCode[] = [];
  for (const row of labels) {
    try {
      const pageResponse = await fetch(row.url, {
        headers: { cookie: `MoodleSession=${credentials.session}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!pageResponse.ok) continue;
      const root = parse(await pageResponse.text());
      for (const activity of root.querySelectorAll("li.activity")) {
        const name = activity.getAttribute("data-activityname") ?? activity.text;
        if (!/attendance/i.test(name)) continue;
        for (const image of activity.querySelectorAll("img")) {
          const src = image.getAttribute("src");
          if (!src || !/pluginfile\.php/.test(src)) continue;
          const imageUrl = new URL(src, row.url).toString();
          const imageResponse = await fetch(imageUrl, {
            headers: { cookie: `MoodleSession=${credentials.session}` },
            signal: AbortSignal.timeout(20_000),
          });
          if (!imageResponse.ok) continue;
          const text = await ocrImage(Buffer.from(await imageResponse.arrayBuffer()));
          found.push(...parseOcrLines(text, row, row.url));
        }
      }
    } catch {
      // OCR is best-effort; a missing image/tesseract should not break the list.
    }
  }
  return found;
}
