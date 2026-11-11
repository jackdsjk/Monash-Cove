import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Cookie } from "playwright";
import type { CoveDatabase } from "../db.js";
import type { SecretStore } from "../secrets.js";
import { parse } from "node-html-parser";

export type AssistantStatus = "idle" | "waiting_login" | "connected" | "error" | "cancelled";

export interface AssistantState {
  status: AssistantStatus;
  message: string;
  startedAt?: string;
}

/** A 200 response at /my/ can still be a login page or an SSO interstitial. */
export function isAuthenticatedMoodleDashboard(baseUrl: string, status: number, url: string, html: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
    if (target.origin !== new URL(baseUrl).origin) return false;
  } catch {
    return false;
  }
  if (status < 200 || status >= 300 || !/^\/my(?:\/|\/index\.php)?$/.test(target.pathname)) return false;
  const root = parse(html);
  if (root.querySelector("form#login, form[action*='/login/index.php'], input[name='password']")) return false;
  const hasSesskey = /["']sesskey["']\s*:\s*["'][^"']+["']/.test(html) ||
    root.querySelector("input[name='sesskey'][value]") !== null;
  return root.querySelector("a[href*='/login/logout.php']") !== null ||
    hasSesskey && root.querySelector("body#page-my-index, [data-region='myoverview']") !== null;
}

/**
 * Opens Chrome on the Monash Moodle dashboard, waits for the user to finish the
 * SSO login, then stores the whole cookie jar for learning.monash.edu.
 *
 * The jar matters: Moodle keeps `MDL_SSP_SessID` next to `MoodleSession`, and a
 * logout-free session check that sends only the latter can bounce back to Okta.
 */
export class MoodleLoginAssistant {
  private context: BrowserContext | null = null;
  private state: AssistantState = { status: "idle", message: "未开始" };
  private readonly baseUrl = "https://learning.monash.edu";
  private lastProbe: { status: number; url: string } | null = null;
  private generation = 0;
  private controller: AbortController | null = null;

  constructor(
    private readonly secrets: SecretStore,
    private readonly db: CoveDatabase,
    private readonly persistCredentials?: (value: string, signal: AbortSignal) => Promise<void>,
  ) {}

  get() {
    return this.state;
  }

  async start() {
    if (this.state.status === "waiting_login") return this.state;
    this.lastProbe = null;
    this.state = { status: "waiting_login", message: "请在打开的 Chrome 窗口完成 Monash 登录，登录成功后会自动连接", startedAt: new Date().toISOString() };
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    void this.run(++this.generation, controller);
    return this.state;
  }

  async cancel() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
    const context = this.context;
    this.context = null;
    const state: AssistantState = { status: "cancelled", message: "已取消登录" };
    this.state = state;
    await context?.close().catch(() => undefined);
    return state;
  }

  private dataDir() {
    return process.env.COVE_DATA_DIR ?? path.join(os.homedir(), "Library", "Application Support", "Cove");
  }

  private async launch(profileDir: string): Promise<BrowserContext> {
    mkdirSync(profileDir, { recursive: true });
    const options = {
      channel: "chrome",
      headless: process.env.COVE_ASSISTANT_HEADLESS === "1",
      viewport: { width: 1180, height: 820 },
    };
    try {
      return await chromium.launchPersistentContext(profileDir, options);
    } catch (error) {
      // A crashed previous run can leave Chrome's profile lock behind.
      const message = error instanceof Error ? error.message : "";
      if (!/ProcessSingleton|SingletonLock|profile.*in use/i.test(message)) throw error;
      for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
        rmSync(path.join(profileDir, name), { force: true });
      }
      return chromium.launchPersistentContext(profileDir, options);
    }
  }

  private async cookieJar(context: BrowserContext): Promise<Cookie[]> {
    const host = new URL(this.baseUrl).hostname;
    const cookies = await context.cookies().catch(() => []);
    return cookies.filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, "").toLowerCase();
      return (host === domain || host.endsWith(`.${domain}`)) && cookie.value &&
        (cookie.expires <= 0 || cookie.expires > Date.now() / 1000);
    }).map(({ name, value, domain, path, expires, secure, httpOnly, sameSite }) =>
      ({ name, value, domain, path, expires, secure, httpOnly, sameSite }));
  }

  private async run(generation: number, controller: AbortController): Promise<void> {
    let context: BrowserContext | null = null;
    const current = () => generation === this.generation && !controller.signal.aborted;
    try {
      const profileDir = path.join(this.dataDir(), "moodle-login-profile");
      context = await this.launch(profileDir);
      if (!current()) return;
      this.context = context;
      const page = context.pages()[0] ?? (await context.newPage());
      if (!current()) return;
      await page.goto(`${this.baseUrl}/my/`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);
      if (!current()) return;

      const deadline = Date.now() + 10 * 60_000;
      while (current() && Date.now() < deadline) {
        const jar = await this.cookieJar(context);
        if (!current()) return;
        if (jar.some((cookie) => cookie.name === "MoodleSession")) {
          // APIRequestContext shares the browser cookie store and consumes
          // Set-Cookie across redirects; an independent fetch would lose them.
          const response = await context.request.get(`${this.baseUrl}/my/`, { timeout: 15_000 }).catch(() => null);
          if (!current()) {
            await response?.dispose().catch(() => undefined);
            return;
          }
          const status = response?.status() ?? 0;
          const url = response?.url() ?? "";
          const html = await response?.text().catch(() => "") ?? "";
          await response?.dispose().catch(() => undefined);
          if (!current()) return;
          this.lastProbe = { status, url };
          if (isAuthenticatedMoodleDashboard(this.baseUrl, status, url, html)) {
            // Verification may rotate MoodleSession or SSP cookies. Capture
            // after it completes, and preserve path/domain/expiry for the jar.
            const cookies = await this.cookieJar(context);
            const dashboardCookies = await context.cookies(`${this.baseUrl}/my/`);
            const session = dashboardCookies.find((cookie) => cookie.name === "MoodleSession")?.value;
            const userAgent = await page.evaluate<string>("navigator.userAgent");
            if (!current()) return;
            if (!session || !userAgent.trim()) throw new Error("Moodle 登录验证后缺少会话或浏览器信息，请重试。");
            const cookie = dashboardCookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
            const value = JSON.stringify({ baseUrl: this.baseUrl, session, cookie, cookies, userAgent });
            // Production injects the session transport's serialized, abortable
            // writer so cancellation during persistence cannot revive a login.
            if (this.persistCredentials) await this.persistCredentials(value, controller.signal);
            else await this.secrets.set("moodle-credentials", value);
            if (!current()) return;
            this.db.setSourceStatus("moodle", "connected", null, null);
            this.state = { status: "connected", message: `Moodle 已连接，已保存 ${cookies.length} 个登录 Cookie 到本机 Keychain` };
            return;
          }
        }
        if (context.pages().length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      if (current()) this.state = { status: "error", message: this.failureMessage() };
    } catch (error) {
      if (current()) this.state = { status: "error", message: error instanceof Error ? error.message : "登录助手启动失败" };
    } finally {
      await context?.close().catch(() => undefined);
      if (this.context === context) this.context = null;
      if (this.controller === controller) this.controller = null;
    }
  }

  private failureMessage() {
    if (!this.lastProbe) return "等待登录超时：还没有在浏览器窗口里完成登录";
    const { status, url } = this.lastProbe;
    const target = url ? `，当前跳转到 ${new URL(url).host}` : "";
    return `等待登录超时：Moodle 返回 HTTP ${status}${target}。请确认已出现课程仪表盘后再等待几秒`;
  }
}
