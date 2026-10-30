import { mkdirSync } from "node:fs";
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

export class MoodleLoginAssistant {
  private context: BrowserContext | null = null;
  private state: AssistantState = { status: "idle", message: "未开始" };
  private readonly baseUrl = "https://learning.monash.edu";

  constructor(
    private readonly secrets: SecretStore,
    private readonly db: CoveDatabase,
  ) {}

  get() {
    return this.state;
  }

  async start() {
    if (this.state.status === "waiting_login") return this.state;
    this.state = { status: "waiting_login", message: "请在打开的 Chrome 窗口完成 Monash 登录", startedAt: new Date().toISOString() };
    void this.run();
    return this.state;
  }

  async cancel() {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.state = { status: "cancelled", message: "已取消登录" };
    return this.state;
  }

  private async run() {
    try {
      const dataDir = process.env.COVE_DATA_DIR ?? path.join(os.homedir(), "Library", "Application Support", "Cove");
      const profileDir = path.join(dataDir, "moodle-login-profile");
      mkdirSync(profileDir, { recursive: true });
      this.context = await chromium.launchPersistentContext(profileDir, {
        channel: "chrome",
        headless: process.env.COVE_ASSISTANT_HEADLESS === "1",
        viewport: { width: 1180, height: 820 },
      });
      const page = this.context.pages()[0] ?? (await this.context.newPage());
      await page.goto(`${this.baseUrl}/my/`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);

      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        const cookies = await this.context.cookies(this.baseUrl).catch(() => []);
        const session = cookies.find((cookie) => cookie.name === "MoodleSession" && cookie.value);
        if (session) {
          // A profile can contain an expired MoodleSession before the user logs
          // in again. Only save a session that actually reaches the dashboard.
          const valid = await new MoodleClient(this.baseUrl, session.value)
            .validateSession()
            .catch(() => false);
          if (valid) {
            await this.secrets.set(
              "moodle-credentials",
              JSON.stringify({ baseUrl: this.baseUrl, session: session.value }),
            );
            this.db.setSourceStatus("moodle", "connected", null, null);
            this.state = { status: "connected", message: "Moodle session 已捕获并保存到本机 Keychain" };
            await this.context.close().catch(() => undefined);
            this.context = null;
            return;
          }
        }
        if (this.context.pages().length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      this.state = { status: "error", message: "等待登录超时，或浏览器窗口已关闭" };
      await this.context?.close().catch(() => undefined);
      this.context = null;
    } catch (error) {
      this.state = { status: "error", message: error instanceof Error ? error.message : "登录助手启动失败" };
      await this.context?.close().catch(() => undefined);
      this.context = null;
    }
  }
}
