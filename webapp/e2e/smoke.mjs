import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serviceDir = path.join(root, "local-service");
const webDist = path.join(root, "webapp", "dist");
const dataDir = mkdtempSync(path.join(os.tmpdir(), "cove-e2e-"));
const port = Number(process.env.COVE_E2E_PORT ?? 0);
const readyMarker = `COVE_E2E_READY_${randomUUID()}:`;
let base = "";

// A temporary DB alone is insufficient: OnTrack can otherwise read the global
// CLI session, and credentials checks can call global fetch outside an adapter.
const serverCode = `
  globalThis.fetch = async () => { throw new Error("External network blocked in browser smoke"); };
  const { buildApp } = await import(${JSON.stringify(pathToFileURL(path.join(serviceDir, "dist", "app.js")).href)});
  const { MemorySecretStore } = await import(${JSON.stringify(pathToFileURL(path.join(serviceDir, "dist", "secrets.js")).href)});
  const app = buildApp({ dbPath: ${JSON.stringify(path.join(dataDir, "e2e.sqlite"))},
    staticDir: ${JSON.stringify(webDist)}, seed: true, autoSync: false,
    secretStore: new MemorySecretStore() });
  const address = await app.listen({ host: "127.0.0.1", port: ${port} });
  console.log(${JSON.stringify(readyMarker)} + address);
  process.on("SIGTERM", () => { void app.close().then(() => process.exit(0)); });
`;
const service = spawn(process.execPath, ["--input-type=module", "-e", serverCode], {
  cwd: serviceDir,
  env: {
    ...process.env,
    COVE_PORT: String(port),
    COVE_DB_PATH: path.join(dataDir, "e2e.sqlite"),
    COVE_STATIC_DIR: webDist,
    COVE_AUTO_SYNC: "0",
    COVE_SECRET_STORE: "memory",
    ONTRACK_CONFIG_DIR: path.join(dataDir, "empty-ontrack"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
const serviceOutput = [];
let stdout = "";
service.stdout.on("data", (chunk) => {
  stdout += String(chunk);
  serviceOutput.push(String(chunk));
  const readyLine = stdout.split("\n").find((line) => line.startsWith(readyMarker));
  if (readyLine) base = readyLine.slice(readyMarker.length).trim();
});
service.stderr.on("data", (chunk) => serviceOutput.push(String(chunk)));
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (service.exitCode !== null || service.signalCode !== null) break;
    try {
      if (base) {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`local service did not start: ${serviceOutput.join("").slice(-2000)}`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.addInitScript(() => window.localStorage.setItem("cove_v3", JSON.stringify({
    setupDone: true, lastViewedAt: 0, marks: {}, attendance: {},
    settings: { name: "Fixture user", timezone: "Asia/Kuala_Lumpur", showLaunchSummary: false },
  })));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "自上次查看", exact: true }).waitFor();
  const brief = await (await fetch(`${base}/api/brief`)).json();
  assert.ok(brief.items.length > 0, "seeded brief should contain fixture items");
  await page.getByText(brief.items[0].title, { exact: true }).first().waitFor();

  await page.getByRole("button", { name: /搜索课程、标题、发布者/ }).click();
  const palette = page.getByRole("dialog", { name: "跳转", exact: true });
  await palette.waitFor();
  await palette.getByRole("button", { name: /页面 来源/ }).click();
  await page.getByRole("heading", { name: "来源", exact: true }).waitFor();
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("link", { name: /自上次查看/ }).click();

  await page.getByText(brief.items[0].title, { exact: true }).first().click();
  const drawer = page.getByRole("dialog", { name: "条目详情", exact: true });
  await drawer.waitFor();
  const read = drawer.getByRole("button", { name: "已读", exact: true });
  await read.click();
  assert.equal(await read.getAttribute("aria-pressed"), "true");
  await drawer.getByRole("button", { name: "关闭", exact: true }).click();

  await page.getByRole("button", { name: "标记本次已查看" }).click();
  await page.getByRole("button", { name: "标记本次已查看" }).waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "标记本次已查看" }).isDisabled(), true);
  await page.getByRole("radio", { name: "全部", exact: true }).click();
  await page.getByText(brief.items[0].title, { exact: true }).first().waitFor();

  for (const title of ["截止时间", "成绩", "每周资料", "Ed 学习内容", "作业资料包", "OnTrack 任务", "考勤", "来源", "设置"]) {
    await nav.getByRole("link", { name: title, exact: true }).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
  }
  assert.deepEqual(pageErrors, [], "browser must not throw uncaught JavaScript errors");

  console.log("webapp e2e smoke passed");
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  if (service.exitCode === null && service.signalCode === null) await new Promise((resolve) => service.once("exit", resolve));
  rmSync(dataDir, { recursive: true, force: true });
}
