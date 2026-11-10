import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Response } from "playwright-core";
import type { PortalExam } from "./domain.js";

/**
 * The exam timetable comes from the Monash student portal, not Moodle. The page
 * calls `/api/student/userEvents` itself, so the capture only has to listen for
 * that response — constructing the request ourselves would need the portal's
 * private auth headers.
 *
 * Ported from Muster `src-tauri/src/student_portal_capture.js` and
 * `student_portal.rs`; the parsing rules below are deliberately the same.
 */
export const PORTAL_ORIGIN = "https://home.student.monash";
const EVENTS_PATH = "/api/student/userEvents";
const DEFAULT_TIMEOUT_MS = 60_000;
const LOGIN_POLL_MS = 500;

export type PortalFailureCode =
  | "portal_not_connected"
  | "portal_timeout"
  | "portal_response_error"
  | "portal_parse_error"
  | "portal_browser_unavailable";

/** A typed failure so the route can map it to a stable HTTP code. */
export class PortalError extends Error {
  readonly code: PortalFailureCode;

  constructor(code: PortalFailureCode, message: string) {
    super(message);
    this.name = "PortalError";
    this.code = code;
  }
}

/** The Chrome profile the portal login flow writes to. Shared, never re-created here. */
export function portalProfileDir(): string {
  const dataDir = process.env.COVE_DATA_DIR ?? path.join(os.homedir(), "Library", "Application Support", "Cove");
  return path.join(dataDir, "portal-login-profile");
}

/**
 * Cheap "has the portal ever been logged in" signal. It only says a saved
 * profile exists; a concrete capture still verifies the session.
 */
export function portalLoginSaved(): boolean {
  return existsSync(portalProfileDir());
}

const TIMEZONE_ALIASES: Record<string, string> = {
  "Kuala Lumpur": "Asia/Kuala_Lumpur",
  Malaysia: "Asia/Kuala_Lumpur",
  Melbourne: "Australia/Melbourne",
  Sydney: "Australia/Sydney",
  Prato: "Europe/Rome",
  Suzhou: "Asia/Shanghai",
};

function isIanaZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The portal reports a display name ("Kuala Lumpur") next to a campus code.
 * Empty location with campus "MA" (Malaysia) still means Kuala Lumpur.
 */
export function portalTimezone(location: unknown, campus: unknown): string | null {
  const label = typeof location === "string" ? location.trim() : "";
  if (label) {
    const zone = Object.hasOwn(TIMEZONE_ALIASES, label) ? TIMEZONE_ALIASES[label] : label;
    return isIanaZone(zone) ? zone : null;
  }
  return campus === "MA" ? "Asia/Kuala_Lumpur" : null;
}

/**
 * Epoch milliseconds. The portal API sends integers, but a WebView's native eval
 * callback has been observed re-serialising them as integral floats; fractional
 * or out-of-range values are not a timestamp.
 */
export function epochMillis(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || !Number.isSafeInteger(value)) return null;
  return value;
}

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function schemaError(index: number, total: number, problem: string): PortalError {
  return new PortalError("portal_parse_error", `学生门户的考试数据无法解析：第 ${index + 1}/${total} 场${problem}。`);
}

/** `location.data` is either a description string wrapper or a room list. */
function examLocation(event: JsonObject): string {
  const data = record(event.location)?.data;
  const direct = record(data);
  if (direct) return text(direct.description) ?? "";
  if (!Array.isArray(data)) return "";
  return data
    .map((room) => {
      const entry = record(room);
      if (!entry) return "";
      return [text(entry.buildingName) ?? "", text(entry.roomName) ?? ""].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Parse the `/api/student/userEvents` body. A source error is never turned into
 * a valid empty timetable: only `errorFlags.exams === 0` with an events array
 * counts, and every malformed exam fails the whole capture.
 */
export function parsePortalEvents(body: unknown, httpStatus = 200): PortalExam[] {
  if (httpStatus !== 200) {
    throw new PortalError("portal_response_error", `Monash 学生门户返回了 HTTP ${httpStatus}。`);
  }
  const payload = record(body);
  if (!payload) throw new PortalError("portal_parse_error", "Monash 学生门户返回的考试数据为空。");
  if (record(payload.errorFlags)?.exams !== 0) {
    throw new PortalError("portal_response_error", "Monash 学生门户这次没有返回可用的考试数据（errorFlags.exams ≠ 0）。");
  }
  if (!Array.isArray(payload.events)) {
    throw new PortalError("portal_parse_error", "Monash 学生门户返回的数据里没有 events 数组。");
  }

  const candidates = payload.events.filter((event) => record(event)?.eventType === "exam");
  const exams: PortalExam[] = [];
  const seen = new Set<string>();

  for (const [index, raw] of candidates.entries()) {
    const event = record(raw);
    if (!event) throw schemaError(index, candidates.length, "不是对象");

    const startMs = epochMillis(record(event.start)?.time);
    if (startMs === null) throw schemaError(index, candidates.length, "的开始时间不是有效的 epoch 毫秒");
    const endMs = epochMillis(record(event.end)?.time);
    if (endMs === null) throw schemaError(index, candidates.length, "的结束时间不是有效的 epoch 毫秒");
    if (endMs <= startMs) throw schemaError(index, candidates.length, "的结束时间不晚于开始时间");
    if (!Number.isFinite(new Date(startMs).getTime()) || !Number.isFinite(new Date(endMs).getTime())) {
      throw schemaError(index, candidates.length, "的时间超出可表示范围");
    }

    const data = record(event.data) ?? {};
    const unitCode = text(data.unitCode);
    if (!unitCode) throw schemaError(index, candidates.length, "缺少课程代码（data.unitCode）");
    const timezone = portalTimezone(data.timezoneLocation, data.campus);
    if (!timezone) throw schemaError(index, candidates.length, "的 timezoneLocation 无法识别");

    // The row shows the exam name, so the activity type is the title; the unit
    // name in `data.unitTitle` stays in raw_json.
    const title = text(data.activityType) ?? text(data.unitTitle) ?? unitCode;
    const id = text(event.uuid) ?? `${unitCode}:${startMs}:${title}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const location = examLocation(event);
    const seat = /seat\s*(?:number|no\.?)?\s*:\s*([A-Za-z0-9-]+)/i.exec(location)?.[1] ?? null;

    exams.push({
      id,
      courseCode: unitCode,
      title,
      startMs,
      endMs,
      timezone,
      campus: text(data.campus) ?? "",
      location,
      seat,
      durationMin: Math.floor((endMs - startMs) / 60_000),
      rawJson: JSON.stringify(raw),
    });
  }

  exams.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  return exams;
}

function isEventsEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === PORTAL_ORIGIN && url.pathname === EVENTS_PATH;
  } catch {
    return false;
  }
}

function isLoginUrl(value: string): boolean {
  return /okta\.com|\/login|\/sso|adfs/i.test(value);
}

interface CapturedResponse {
  status: number;
  body: unknown;
}

async function captureFromProfile(profileDir: string, timeoutMs: number): Promise<PortalExam[]> {
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless: true,
      viewport: { width: 1180, height: 820 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new PortalError("portal_browser_unavailable", `无法打开学生门户已保存的浏览器 profile：${message}`);
  }

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    let resolveCapture: ((value: CapturedResponse | null) => void) | null = null;
    const captured = new Promise<CapturedResponse | null>((resolve) => {
      resolveCapture = resolve;
    });
    let settled = false;
    const onResponse = (response: Response) => {
      if (settled || !isEventsEndpoint(response.url())) return;
      settled = true;
      void response
        .json()
        .then((body) => resolveCapture?.({ status: response.status(), body }))
        .catch(() => resolveCapture?.({ status: response.status(), body: null }));
    };
    page.on("response", onResponse);

    const deadline = Date.now() + timeoutMs;
    // The portal page issues the request on load; failures here fall through to
    // the timeout branch because the response may still arrive late.
    await page
      .goto(`${PORTAL_ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: Math.min(30_000, timeoutMs) })
      .catch(() => undefined);

    try {
      while (Date.now() < deadline) {
        const result = await Promise.race([
          captured,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), LOGIN_POLL_MS)),
        ]);
        if (result) {
          if (result.status === 401 || result.status === 403) {
            throw new PortalError("portal_not_connected", "学生门户登录已失效，请重新登录后再同步。");
          }
          return parsePortalEvents(result.body, result.status);
        }
        // Only redirects to the identity provider come back here; a logged-in
        // portal answers the event request before this poll fires.
        if (isLoginUrl(page.url())) {
          throw new PortalError("portal_not_connected", "还没连接学生门户：请先在 Monash 学生门户完成登录。");
        }
      }
    } finally {
      page.off("response", onResponse);
    }

    throw new PortalError("portal_timeout", `Monash 学生门户在 ${Math.round(timeoutMs / 1000)} 秒内没有返回考试数据。`);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export interface PortalCaptureOptions {
  timeoutMs?: number;
  profileDir?: string;
}

/**
 * Open the saved portal profile and intercept one `/api/student/userEvents`
 * response. No saved profile means no login, so the caller gets a clear
 * `portal_not_connected` instead of a fabricated empty timetable.
 */
export async function capturePortalExams(options: PortalCaptureOptions = {}): Promise<PortalExam[]> {
  const profileDir = options.profileDir ?? portalProfileDir();
  if (!existsSync(profileDir)) {
    throw new PortalError("portal_not_connected", "还没连接学生门户：请先在 Monash 学生门户（home.student.monash）用 Monash 账号登录一次。");
  }
  return captureFromProfile(profileDir, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}
