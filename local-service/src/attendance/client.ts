import { chromium } from "playwright";
import type { DetectedAttendanceSession } from "./preferences.js";

export interface AttendanceCredentials {
  baseUrl: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
}

export interface AttendanceCandidate {
  course: string;
  week: number;
  session: string;
  code: string;
}

function courseCode(course: string) {
  return (/^[A-Z]{2,5}\d{3,4}/i.exec(course)?.[0] ?? course.split(/[_ -]/)[0]).toUpperCase();
}

function sessionKey(value: string) {
  const match = /\b(workshop|applied|tutorial|pass)\s*0?(\d{1,2})\b/i.exec(value);
  return match ? `${match[1].toLowerCase()} ${Number(match[2])}` : value.trim().toLowerCase();
}

export async function validateAttendance(credentials: AttendanceCredentials) {
  // The Attendance TLS chain is not in Node's bundled CA store, but Chrome
  // resolves it using the system trust store. Use the same browser path as
  // the login assistant instead of disabling TLS verification.
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(credentials.cookies.map((cookie) => ({
      ...cookie,
      sameSite: cookie.sameSite === "None" ? "None" : cookie.sameSite === "Strict" ? "Strict" : "Lax",
    })));
    const page = await context.newPage();
    await page.goto(`${credentials.baseUrl}/student/Default.aspx`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const url = page.url();
    const text = await page.locator("body").innerText().catch(() => "");
    return !url.includes("okta.com") && text.includes("Attendance");
  } catch {
    return false;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function discoverAttendanceSessions(credentials: AttendanceCredentials): Promise<DetectedAttendanceSession[]> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(credentials.cookies.map((cookie) => ({
      ...cookie,
      sameSite: cookie.sameSite === "None" ? "None" : cookie.sameSite === "Strict" ? "Strict" : "Lax",
    })));
    const page = await context.newPage();
    await page.goto(`${credentials.baseUrl}/student/Units.aspx`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const dates = await page.locator("#daySel option").evaluateAll((options) =>
      options.map((option) => (option as unknown as { value: string }).value),
    );
    const found = new Map<string, DetectedAttendanceSession>();
    for (const date of dates) {
      await page.selectOption("#daySel", date).catch(() => undefined);
      await page.waitForTimeout(60);
      const rows = page.locator(`#dayPanel_${date} li`);
      const count = await rows.count();
      for (let index = 0; index < count; index += 1) {
        const text = (await rows.nth(index).innerText().catch(() => "")).replace(/\s+/g, " ").trim();
        const course = /\b([A-Z]{2,5}\d{3,4})\b/i.exec(text)?.[1];
        const session = /\b(workshop|tutorial|applied|pass|lab|laboratory|studio|seminar)\s*0?(\d{1,2})\b/i.exec(text);
        if (!course || !session) continue;
        const label = `${session[1][0].toUpperCase()}${session[1].slice(1).toLowerCase()} ${Number(session[2])}`;
        found.set(`${course.toUpperCase()}:${label}`, { course: course.toUpperCase(), session: label });
      }
    }
    return [...found.values()];
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function fillAttendance(candidate: AttendanceCandidate, credentials: AttendanceCredentials) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(credentials.cookies.map((cookie) => ({
      ...cookie,
      sameSite: cookie.sameSite === "None" ? "None" : cookie.sameSite === "Strict" ? "Strict" : "Lax",
    })));
    const page = await context.newPage();
    await page.goto(`${credentials.baseUrl}/student/Units.aspx`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const course = courseCode(candidate.course);
    const wantedLabel = sessionKey(candidate.session);
    // The portal exposes a direct Entry.aspx link only while a code window is open.
    // Prefer that link over the read-only day summary.
    const entryLinks = page.locator('a[href*="Entry.aspx"]');
    for (let index = 0; index < await entryLinks.count(); index += 1) {
      const link = entryLinks.nth(index);
      const label = (await link.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      if (!label.toUpperCase().includes(course) || !label.toLowerCase().includes(wantedLabel)) continue;
      const href = await link.getAttribute("href");
      if (!href) continue;
      await page.goto(new URL(href, page.url()).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
      const input = page.locator('input[type="text"], input:not([type]), input[type="tel"], input[placeholder*="code" i], input[name*="code" i]').first();
      if ((await input.count()) === 0) return { status: "inactive" as const, message: "找到 Entry 页面，但没有 active attendance code 输入框。" };
      await input.fill(candidate.code);
      return { status: "filled" as const, message: `已打开 ${candidate.session} 的 Entry 页面并填入 code；未自动提交。` };
    }
    const wantedSession = wantedLabel;
    const dates = await page.locator("#daySel option").evaluateAll((options) =>
      options.map((option) => (option as unknown as { value: string }).value),
    );
    for (const date of dates) {
      await page.selectOption("#daySel", date).catch(() => undefined);
      await page.waitForTimeout(80);
      const rows = page.locator(`#dayPanel_${date} li`);
      const count = await rows.count();
      for (let index = 0; index < count; index += 1) {
        const row = rows.nth(index);
        const text = await row.innerText().catch(() => "");
        if (!text.toUpperCase().includes(course) || sessionKey(text) !== wantedSession) continue;
        await row.click().catch(() => undefined);
        await page.waitForTimeout(250);
        const input = page.locator('input[type="text"], input:not([type]), input[placeholder*="code" i]').first();
        if ((await input.count()) === 0) {
          return { status: "inactive" as const, message: "找到对应活动，但当前没有 active attendance code 输入框；可能活动尚未开始或 code 窗口未开启。" };
        }
        await input.fill(candidate.code);
        return { status: "filled" as const, message: `已填入 ${candidate.session} 的 attendance code；未自动提交。` };
      }
    }
    return { status: "not_found" as const, message: `没有在 Attendance 页面找到 ${candidate.course} / ${candidate.session} 的活动。` };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
