import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import type { CoveDatabase } from "../db.js";
import type { SecretStore } from "../secrets.js";
import { MoodleClient } from "../sources/moodle.js";

export type AssistantStatus = "idle" | "waiting_login" | "connected" | "error" | "cancelled";

export interface AssistantState {
  status: AssistantStatus;
  message: string;
  startedAt?: string;
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

  constructor(
    private readonly secrets: SecretStore,
    private readonly db: CoveDatabase,
  ) {}

  get() {
    return this.state;
  }

  async start() {
    if (this.state.status === "waiting_login") return this.state;
    this.lastProbe = null;
    this.state = { status: "waiting_login", message: "请在打开的 Chrome 窗口完成 Monash 登录，登录成功后会自动连接", startedAt: new Date().toISOString() };
    void this.run();
    return this.state;
  }

  async cancel() {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.state = { status: "cancelled", message: "已取消登录" };
    return this.state;
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

  private async cookieJar(): Promise<Array<{ name: string; value: string; expires?: number }>> {
    if (!this.context) return [];
    const cookies = await this.context.cookies(this.baseUrl).catch(() => []);
    return cookies
      .filter((cookie) => cookie.domain.replace(/^\./, "").endsWith("monash.edu") && cookie.value)
      .map((cookie) => ({ name: cookie.name, value: cookie.value, expires: cookie.expires }));
  }

  private async run() {
    try {
      const profileDir = path.join(this.dataDir(), "moodle-login-profile");
      this.context = await this.launch(profileDir);
      const page = this.context.pages()[0] ?? (await this.context.newPage());
      await page.goto(`${this.baseUrl}/my/`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);

      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        const jar = await this.cookieJar();
        const session = jar.find((cookie) => cookie.name === "MoodleSession")?.value;
        if (session) {
          const header = jar.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
          const probe = await new MoodleClient(this.baseUrl, header)
            .probeSession()
            .catch(() => ({ ok: false, status: 0, url: "" }));
          this.lastProbe = { status: probe.status, url: probe.url };
          // A profile can contain an expired session before the user logs in
          // again, so only save a jar that actually reaches the dashboard.
          if (probe.ok) {
            await this.secrets.set("moodle-credentials", JSON.stringify({ baseUrl: this.baseUrl, session, cookie: header }));
            this.db.setSourceStatus("moodle", "connected", null, null);
            this.state = { status: "connected", message: `Moodle 已连接，已保存 ${jar.length} 个登录 Cookie 到本机 Keychain` };
            await this.context.close().catch(() => undefined);
            this.context = null;
            return;
          }
        }
        if (this.context.pages().length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      this.state = { status: "error", message: this.failureMessage() };
      await this.context?.close().catch(() => undefined);
      this.context = null;
    } catch (error) {
      this.state = { status: "error", message: error instanceof Error ? error.message : "登录助手启动失败" };
      await this.context?.close().catch(() => undefined);
      this.context = null;
    }
  }

  private failureMessage() {
    if (!this.lastProbe) return "等待登录超时：还没有在浏览器窗口里完成登录";
    const { status, url } = this.lastProbe;
    const target = url ? `，当前跳转到 ${new URL(url).host}` : "";
    return `等待登录超时：Moodle 返回 HTTP ${status}${target}。请确认已出现课程仪表盘后再等待几秒`;
  }
}
