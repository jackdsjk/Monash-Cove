import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RuntimeCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface RuntimeStatus {
  platform: string;
  arch: string;
  node: string;
  desktop: boolean;
  dataDir: string;
  checks: RuntimeCheck[];
}

function chromeCandidates() {
  if (process.platform === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  if (process.platform === "win32") {
    return [
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    ];
  }
  return ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

async function chromeAvailable() {
  if (chromeCandidates().some((candidate) => candidate && existsSync(candidate))) return true;
  if (process.platform !== "linux") return false;
  try {
    await execFileAsync("sh", ["-c", "command -v google-chrome || command -v chromium || command -v chromium-browser"]);
    return true;
  } catch {
    return false;
  }
}

export async function getRuntimeStatus(options: { dataDir: string; oauthConfigured: boolean }): Promise<RuntimeStatus> {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const electronRuntime = process.env.COVE_DESKTOP === "1" || Boolean(process.versions.electron);
  const chrome = await chromeAvailable();
  const checks: RuntimeCheck[] = [
    {
      id: "node",
      label: "Node.js",
      status: nodeMajor >= 26 || electronRuntime ? "ok" : "warn",
      detail: `${process.version}${electronRuntime ? "（Electron 内置 Node）" : nodeMajor >= 26 ? "" : "；建议 Node 26+"}`,
    },
    {
      id: "chrome",
      label: "Google Chrome",
      status: chrome ? "ok" : "fail",
      detail: chrome ? "已检测到 Chrome，可用于 Moodle 登录助手" : "未检测到 Google Chrome；Moodle 登录助手不可用",
    },
    {
      id: "oauth",
      label: "Google OAuth",
      status: options.oauthConfigured ? "ok" : "warn",
      detail: options.oauthConfigured ? "本地 OAuth client 已配置" : "未配置 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET；Gmail 连接会不可用",
    },
    {
      id: "secrets",
      label: "凭据存储",
      status: process.platform === "darwin" ? "ok" : "warn",
      detail: process.platform === "darwin" ? "macOS Keychain" : "文件凭据存储（非系统 Keychain）；仅用于本机测试",
    },
  ];
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    desktop: process.env.COVE_DESKTOP === "1",
    dataDir: options.dataDir,
    checks,
  };
}
