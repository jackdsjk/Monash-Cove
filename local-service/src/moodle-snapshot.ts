import { chromium } from "playwright";
import { moodleCookieHeader, type MoodleCredentials } from "./moodle-download.js";

export async function captureMoodlePage(credentials: MoodleCredentials, target: string): Promise<Buffer> {
  const url = new URL(target);
  const base = new URL(credentials.baseUrl);
  if (url.hostname !== base.hostname) throw new Error("Snapshot target must be on the Moodle host.");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: { cookie: moodleCookieHeader(credentials) },
    });
    const page = await context.newPage();
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 45_000 });
    return await page.screenshot({ fullPage: true, type: "png" });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
