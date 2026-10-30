import { chromium } from "playwright";

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
    const wantedSession = sessionKey(candidate.session);
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
