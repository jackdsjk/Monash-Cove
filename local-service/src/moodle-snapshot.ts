import { chromium } from "playwright";
import type { MoodleCredentials } from "./moodle-download.js";
import { assertMoodleBrowserPage, assertMoodleOrigin, moodleBrowserCookies } from "./moodle-browser-session.js";

export async function captureMoodlePage(credentials: MoodleCredentials, target: string): Promise<Buffer> {
  const url = new URL(target);
  assertMoodleOrigin(credentials.baseUrl, url.href);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      ...(credentials.userAgent ? { userAgent: credentials.userAgent } : {}),
    });
    await context.addCookies(moodleBrowserCookies(credentials));
    const page = await context.newPage();
    const response = await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 45_000 });
    assertMoodleBrowserPage(credentials.baseUrl, page.url(), await page.content());
    if (!response?.ok()) throw new Error("Moodle screenshot request failed.");
    return await page.screenshot({ fullPage: true, type: "png" });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
