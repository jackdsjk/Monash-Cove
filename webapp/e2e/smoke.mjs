import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serviceDir = path.join(root, "local-service");
const webDist = path.join(root, "webapp", "dist");
const dataDir = mkdtempSync(path.join(os.tmpdir(), "cove-e2e-"));
const port = 4318;
const base = `http://127.0.0.1:${port}`;

const service = spawn(process.execPath, [path.join(serviceDir, "dist", "index.js")], {
  cwd: serviceDir,
  env: {
    ...process.env,
    COVE_PORT: String(port),
    COVE_DB_PATH: path.join(dataDir, "e2e.sqlite"),
    COVE_STATIC_DIR: webDist,
    COVE_AUTO_SYNC: "0",
    COVE_SECRET_STORE: "memory",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local service did not start");
}

try {
  await waitForServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".item-card").first().waitFor();
  assert.ok((await page.locator(".item-card").count()) > 0, "brief should show items");

  await page.locator(".command-trigger").click();
  await page.locator(".command-palette").waitFor();
  await page.getByRole("option", { name: /数据源/ }).click();
  await page.getByRole("heading", { name: "数据源" }).waitFor();
  await page.getByRole("menuitem", { name: "简报" }).click();
  await page.locator(".item-card").first().waitFor();

  await page.locator(".item-title").first().click();
  await page.locator(".ant-drawer-open").waitFor();
  await page.getByRole("button", { name: "反馈判断" }).click();
  await page.locator(".ant-modal").waitFor();
  await page.getByRole("button", { name: "保存反馈" }).click();
  await page.locator(".ant-message").waitFor();
  await page.locator(".ant-drawer-close").click();

  await page.getByRole("button", { name: "标记本次已查看" }).click();
  await page.locator(".brief-empty").waitFor();
  await page.getByRole("button", { name: /过去的内容/ }).click();
  await page.locator(".item-card").first().waitFor();

  await page.getByRole("menuitem", { name: "倒计时" }).click();
  await page.getByRole("heading", { name: "截止倒计时" }).waitFor();
  await page.getByRole("menuitem", { name: "每周资料" }).click();
  await page.getByRole("heading", { name: "每周资料" }).waitFor();
  await page.getByRole("menuitem", { name: "数据源" }).click();
  await page.getByRole("heading", { name: "数据源" }).waitFor();
  await page.getByRole("menuitem", { name: "设置" }).click();
  await page.getByRole("heading", { name: "设置" }).waitFor();

  console.log("webapp e2e smoke passed");
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
}
