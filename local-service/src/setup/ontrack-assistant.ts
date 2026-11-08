import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import type { CoveDatabase } from "../db.js";
import type { SecretStore } from "../secrets.js";

export type AssistantStatus = "idle" | "waiting_login" | "connected" | "error" | "cancelled";

export interface AssistantState {
  status: AssistantStatus;
  message: string;
  startedAt?: string;
}

const ORIGIN = "https://ontrack.infotech.monash.edu";
const API = `${ORIGIN}/api`;

/**
 * Opens Chrome on OnTrack, waits for the Monash SSO login to finish, then
 * stores the refresh cookie the session renews itself with.
 *
 * The page itself is never scraped for a token: the access token is minted
 * server-side from the refresh cookie, exactly like the signed-in web app does.
 */
export class OnTrackLoginAssistant {
  private context: BrowserContext | null = null;
  private state: AssistantState = { status: "idle", message: "未开始" };
  private lastProbe: { ok: boolean; status: number; url: string } | null = null;

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
    this.state = {
      status: "waiting_login",
      message: "请在打开的 Chrome 窗口完成 Monash 登录，登录成功后会自动连接",
      startedAt: new Date().toISOString(),
    };
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
      const message = error instanceof Error ? error.message : "";
      if (!/ProcessSingleton|SingletonLock|profile.*in use/i.test(message)) throw error;
      for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
        rmSync(path.join(profileDir, name), { force: true });
      }
      return chromium.launchPersistentContext(profileDir, options);
    }
  }

  private async credentials(): Promise<{ refreshToken: string; username: string; expiresAt: number | null } | null> {
    if (!this.context) return null;
    const cookies = await this.context.cookies(ORIGIN).catch(() => []);
    const find = (name: string) => cookies.find((cookie) => cookie.name === name);
    const refresh = find("refresh_token");
    const user = find("username");
    if (!refresh?.value || !user?.value) return null;
    return {
      refreshToken: refresh.value,
      username: user.value,
      // -1 means a session cookie: it dies with the browser, so no date.
      expiresAt: typeof refresh.expires === "number" && refresh.expires > 0 ? refresh.expires * 1000 : null,
    };
  }

  /** Mint an access token so an expired cookie is never reported as a success. */
  private async probe(credentials: { refreshToken: string; username: string }) {
    const response = await fetch(`${API}/auth/access-token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: `refresh_token=${credentials.refreshToken}; username=${credentials.username}`,
      },
    });
    if (!response.ok) return { ok: false, status: response.status, url: response.url, token: null as string | null };
    const body = (await response.json().catch(() => null)) as { auth_token?: string } | null;
    const token = body?.auth_token ?? null;
    if (!token) return { ok: false, status: response.status, url: response.url, token };
    const projects = await fetch(`${API}/projects`, {
      headers: { Accept: "application/json", "Auth-Token": token, Username: credentials.username },
    }).catch(() => null);
    return { ok: Boolean(projects?.ok), status: projects?.status ?? 0, url: projects?.url ?? "", token };
  }

  private async run() {
    try {
      const profileDir = path.join(this.dataDir(), "ontrack-login-profile");
      this.context = await this.launch(profileDir);
      const page = this.context.pages()[0] ?? (await this.context.newPage());
      await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);

      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        const credentials = await this.credentials();
        if (credentials) {
          const probe = await this.probe(credentials).catch(() => ({ ok: false, status: 0, url: "", token: null }));
          this.lastProbe = { ok: probe.ok, status: probe.status, url: probe.url };
          if (probe.ok) {
            await this.secrets.set(
              "ontrack-credentials",
              JSON.stringify({ baseUrl: API, refreshToken: credentials.refreshToken, username: credentials.username, expiresAt: credentials.expiresAt }),
            );
            this.db.setSourceStatus("ontrack", "connected", null, null);
            this.state = { status: "connected", message: `OnTrack 已连接（${credentials.username}），刷新凭据已保存到本机 Keychain` };
            await this.context.close().catch(() => undefined);
            this.context = null;
            return;
          }
        }
        if (this.context.pages().length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1_500));
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
    if (!this.lastProbe) return "等待登录超时：还没有在浏览器窗口里完成 OnTrack 登录";
    const { status, url } = this.lastProbe;
    const target = url ? `，当前请求 ${new URL(url).pathname}` : "";
    return `等待登录超时：OnTrack 返回 HTTP ${status}${target}。请确认已经进入任务列表页再等几秒`;
  }
}
