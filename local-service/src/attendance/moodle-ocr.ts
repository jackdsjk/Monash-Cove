import { fileURLToPath } from "node:url";
import { createWorker, type Worker } from "tesseract.js";
import { parse } from "node-html-parser";
import type { MoodleContentRow } from "../domain.js";
import type { AttendanceCode } from "./parser.js";

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

export function parseOcrLines(text: string, row: MoodleContentRow, url: string): AttendanceCode[] {
  const week = weekOf(`${row.title} ${row.sectionTitle}`);
  if (!week) return [];
  const course = courseCode(row.courseName);
  const codes: AttendanceCode[] = [];
  const rawLines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const lines = rawLines.map((line, index) => {
    if (/\b(tutorial|workshop|applied)\b.*?\d{1,2}:\d{2}\s*[AP]M/i.test(line) && !/[A-Z0-9]{3,8}\.?$/.test(line)) {
      const next = rawLines[index + 1] ?? "";
      if (/^[A-Z0-9]{3,8}\.?$/.test(next)) return `${line} ${next}`;
    }
    return line;
  });
  for (const line of lines) {
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

async function createOcrWorker() {
  const langPath = fileURLToPath(new URL("../../node_modules/@tesseract.js-data/eng/4.0.0", import.meta.url));
  return createWorker("eng", 1, { langPath, logger: () => undefined });
}

async function ocrImage(buffer: Buffer, worker: Worker) {
  const result = await worker.recognize(buffer);
  return result.data.text;
}

export async function scanMoodleAttendanceImages(
  credentials: MoodleAttendanceCredentials,
  rows: MoodleContentRow[],
): Promise<AttendanceCode[]> {
  const candidates = rows.filter((row) => /attendance/i.test(`${row.title} ${row.text}`));
  if (candidates.length === 0) return [];
  let worker: Worker | null = null;
  try {
    worker = await createOcrWorker();
    const results = await mapLimit(candidates, 4, async (row) => {
      try {
        const pageResponse = await fetch(row.url, {
          headers: { cookie: `MoodleSession=${credentials.session}` },
          signal: AbortSignal.timeout(20_000),
        });
        if (!pageResponse.ok) return [];
        const root = parse(await pageResponse.text());
        const images = row.module === "label"
          ? [...root.querySelectorAll("li.activity")]
              .filter((activity) => /attendance/i.test(activity.getAttribute("data-activityname") ?? activity.text))
              .flatMap((activity) => activity.querySelectorAll("img"))
          : [...root.querySelectorAll("img")].filter((image) => /\/mod_forum\/post\//.test(image.getAttribute("src") ?? ""));
        const imageCodes = await mapLimit(images, 2, async (image) => {
          const src = image.getAttribute("src");
          if (!src || !/pluginfile\.php/.test(src)) return [];
          const imageUrl = new URL(src, row.url).toString();
          const imageResponse = await fetch(imageUrl, {
            headers: { cookie: `MoodleSession=${credentials.session}` },
            signal: AbortSignal.timeout(20_000),
          });
          if (!imageResponse.ok || !worker) return [];
          const text = await ocrImage(Buffer.from(await imageResponse.arrayBuffer()), worker);
          return parseOcrLines(text, row, row.url);
        });
        return imageCodes.flat();
      } catch {
        return [];
      }
    });
    return results.flat();
  } catch {
    return [];
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R[]>): Promise<R[]> {
  const output: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output.push(...(await fn(items[index])));
    }
  });
  await Promise.all(workers);
  return output;
}
