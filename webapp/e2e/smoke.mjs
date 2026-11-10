import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
const artifactsDir = process.env.COVE_E2E_ARTIFACT_DIR;
if (artifactsDir) mkdirSync(artifactsDir, { recursive: true });
let base = "";
let freshBase = "";

// A temporary DB alone is insufficient: OnTrack can otherwise read the global
// CLI session, and credentials checks can call global fetch outside an adapter.
const serverCode = `
  globalThis.fetch = async () => { throw new Error("External network blocked in browser smoke"); };
  const { buildApp } = await import(${JSON.stringify(pathToFileURL(path.join(serviceDir, "dist", "app.js")).href)});
  const { MemorySecretStore } = await import(${JSON.stringify(pathToFileURL(path.join(serviceDir, "dist", "secrets.js")).href)});
  const app = buildApp({ dbPath: ${JSON.stringify(path.join(dataDir, "e2e.sqlite"))},
    staticDir: ${JSON.stringify(webDist)}, seed: true, autoSync: false,
    secretStore: new MemorySecretStore() });
  const freshApp = buildApp({ dbPath: ${JSON.stringify(path.join(dataDir, "fresh.sqlite"))},
    staticDir: ${JSON.stringify(webDist)}, seed: false, autoSync: false,
    secretStore: new MemorySecretStore() });
  const address = await app.listen({ host: "127.0.0.1", port: ${port} });
  const freshAddress = await freshApp.listen({ host: "127.0.0.1", port: 0 });
  console.log(${JSON.stringify(readyMarker)} + JSON.stringify({ address, freshAddress }));
  process.on("SIGTERM", () => { void Promise.all([app.close(), freshApp.close()]).then(() => process.exit(0)); });
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
  if (readyLine) {
    const addresses = JSON.parse(readyLine.slice(readyMarker.length));
    base = addresses.address;
    freshBase = addresses.freshAddress;
  }
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

async function capture(page, filename) {
  if (!artifactsDir) return;
  // Preserve the rendered end state rather than a fading route transition.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => undefined))));
  await page.screenshot({ path: path.join(artifactsDir, filename), fullPage: true });
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

  await page.getByRole("button", { name: "搜索或跳转", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "跳转", exact: true });
  await palette.waitFor();
  await palette.getByRole("button", { name: /页面 来源/ }).click();
  await page.getByRole("heading", { name: "来源", exact: true }).waitFor();
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("link", { name: /自上次查看/ }).click();

  const detailTrigger = await page.getByText(brief.items[0].title, { exact: true }).first().evaluateHandle((title) => title.closest('button'));
  await page.getByText(brief.items[0].title, { exact: true }).first().click();
  const drawer = page.getByRole("dialog", { name: "条目详情", exact: true });
  await drawer.waitFor();
  await page.waitForFunction((dialog) => dialog.contains(document.activeElement), await drawer.elementHandle());
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press(i % 2 ? "Tab" : "Shift+Tab");
    assert.ok(await drawer.evaluate((dialog) => dialog.contains(document.activeElement)), "keyboard focus must stay inside the detail dialog");
  }
  const read = drawer.getByRole("button", { name: "已读", exact: true });
  await read.click();
  assert.equal(await read.getAttribute("aria-pressed"), "true");
  await drawer.getByRole("button", { name: "关闭", exact: true }).click();
  await drawer.waitFor({ state: "hidden" });
  await page.waitForFunction((trigger) => trigger === document.activeElement, detailTrigger);

  await page.getByRole("button", { name: "标记本次已查看" }).click();
  await page.getByRole("button", { name: "标记本次已查看" }).waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "标记本次已查看" }).isDisabled(), true);
  await page.getByRole("radio", { name: "全部", exact: true }).click();
  await page.getByText(brief.items[0].title, { exact: true }).first().waitFor();

  for (const title of ["截止时间", "成绩", "每周资料", "Ed 学习内容", "作业资料包", "OnTrack 任务", "考勤", "来源", "设置"]) {
    await nav.getByRole("link", { name: title, exact: true }).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
  }

  // Test a real empty service and a fresh browser, separately from seeded data.
  const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await freshContext.newPage();
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  await fresh.route("**/*", (route) => new URL(route.request().url()).origin === freshBase ? route.continue() : route.abort());
  await fresh.goto(freshBase, { waitUntil: "domcontentloaded" });
  await fresh.getByRole("heading", { name: "首次设置", exact: true }).waitFor();
  assert.equal((await (await fetch(`${freshBase}/api/brief`)).json()).items.length, 0, "first run must not seed example content");
  await fresh.getByRole("button", { name: "连接 Ed", exact: true }).click();
  const edConnection = fresh.getByRole("dialog", { name: "连接 Ed", exact: true });
  await edConnection.getByLabel("Ed API token", { exact: true }).waitFor();
  await edConnection.getByRole("button", { name: "取消", exact: true }).click();
  await fresh.getByRole("button", { name: /完成设置|进入简报|暂时跳过/ }).first().click();
  await fresh.getByRole("heading", { name: "自上次查看", exact: true }).waitFor();
  await fresh.reload();
  await fresh.getByRole("heading", { name: "自上次查看", exact: true }).waitFor();
  await freshContext.close();

  // A newly discovered old article belongs in the current viewing window.
  const regressionContext = await browser.newContext({ timezoneId: "UTC", viewport: { width: 1280, height: 900 } });
  const regression = await regressionContext.newPage();
  regression.on("pageerror", (error) => pageErrors.push(error.message));
  await regression.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const now = Date.now();
  const discovered = {
    ...brief.items[0], id: "moodle:browser-new-discovery", source: "moodle",
    title: "Newly discovered old coursework", course: "FIT1001",
    publishedAt: new Date(now - 7 * 86400_000).toISOString(),
    firstSeenAt: new Date(now).toISOString(), updatedAt: new Date(now - 7 * 86400_000).toISOString(),
    dueAt: new Date(now + 86400_000).toISOString().slice(0, 10) + "T12:00:00.000Z", completedAt: null,
  };
  await regression.addInitScript(({ lastViewedAt }) => window.localStorage.setItem("cove_v3", JSON.stringify({
    setupDone: true, lastViewedAt, marks: {}, attendance: {},
    settings: { name: "", timezone: "Asia/Kuala_Lumpur", showLaunchSummary: false },
  })), { lastViewedAt: now - 3600_000 });
  await regression.route("**/api/brief*", (route) => route.fulfill({ json: { ...brief, items: [discovered] } }));
  await regression.route("**/api/changes*", (route) => route.fulfill({ json: { changes: [] } }));
  const fixtureSources = (await (await fetch(`${base}/api/sources`)).json()).sources;
  await regression.route("**/api/sources", (route) => route.fulfill({ json: {
    sources: fixtureSources.map((source) => ({ ...source, status: source.id === "moodle" ? "connected" : "disconnected", lastError: null })),
  } }));
  await regression.goto(base, { waitUntil: "domcontentloaded" });
  await regression.getByText(discovered.title, { exact: true }).first().waitFor();
  await regression.getByText(discovered.title, { exact: true }).first().click();
  const detail = regression.getByRole("dialog", { name: "条目详情", exact: true });
  await detail.waitFor();
  assert.match(await detail.innerText(), /20:00/, "a noon UTC deadline must display 20:00 in the selected Kuala Lumpur timezone");
  await regression.keyboard.press("Escape");
  await detail.waitFor({ state: "hidden" });

  await regression.route("**/api/sync", (route) => route.fulfill({ status: 503, json: { error: { message: "Simulated sync outage" } } }));
  await regression.getByRole("button", { name: "同步", exact: true }).click();
  await regression.getByText(/同步失败/).first().waitFor();
  assert.ok(await regression.getByText(/Simulated sync outage/).count(), "failed sync must keep its error visible after refreshing source data");

  for (const width of [390, 768, 1280]) {
    await regression.setViewportSize({ width, height: 900 });
    await regression.getByRole("heading", { name: "自上次查看", exact: true }).waitFor();
    assert.ok(await regression.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `the brief must fit viewport width ${width}`);
    const syncBounds = await regression.getByRole("button", { name: "同步", exact: true }).boundingBox();
    assert.ok(syncBounds && syncBounds.x >= 0 && syncBounds.x + syncBounds.width <= width + 1, `sync control must remain reachable at width ${width}`);
    for (const button of await regression.getByRole("button", { name: /^连接 (Ed|Gmail|OnTrack)$/ }).all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `source connection controls must remain reachable at width ${width}`);
    }
    const errorBounds = await regression.getByText(/Simulated sync outage/).first().boundingBox();
    assert.ok(errorBounds && errorBounds.width >= 150, `sync error text must retain readable width at ${width}`);
    const suggestionsBounds = await regression.getByRole("heading", { name: "建议先看", exact: true }).boundingBox();
    assert.ok(suggestionsBounds && suggestionsBounds.height < 40, "section titles must not collapse into vertical text");
    await capture(regression, `brief-${width}.png`);
    const responsiveNav = regression.getByRole("navigation", { name: "主导航" });
    for (const title of ["截止时间", "成绩", "每周资料", "Ed 学习内容", "作业资料包", "OnTrack 任务", "考勤", "来源", "设置"]) {
      await responsiveNav.getByRole("link", { name: title, exact: true }).click();
      const heading = regression.getByRole("heading", { name: title, exact: true });
      await heading.waitFor();
      const headingBounds = await heading.boundingBox();
      assert.ok(headingBounds && headingBounds.height < 72 && headingBounds.x + headingBounds.width <= width + 1, `${title} heading must fit viewport width ${width}`);
      assert.ok(await regression.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${title} must fit viewport width ${width}`);
      if (artifactsDir && width === 390 && ["截止时间", "来源", "设置"].includes(title)) {
        await capture(regression, `${title}-390.png`);
      }
    }
    await responsiveNav.getByRole("link", { name: "自上次查看", exact: true }).click();
  }
  await regression.getByRole("button", { name: "连接 Ed", exact: true }).click();
  await regression.getByRole("heading", { name: "来源", exact: true }).waitFor();
  await regression.getByRole("button", { name: "连接 Ed", exact: true }).click();
  const bannerConnection = regression.getByRole("dialog", { name: "连接 Ed", exact: true });
  await bannerConnection.getByLabel("Ed API token", { exact: true }).waitFor();
  await bannerConnection.getByRole("button", { name: "取消", exact: true }).click();
  await regression.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "设置", exact: true }).click();
  await regression.getByRole("button", { name: "开始全量同步", exact: true }).click();
  await regression.getByText("尚未配置支持全量同步的来源。", { exact: true }).waitFor();
  assert.equal((await (await fetch(`${base}/api/sync/status`)).json()).job.status, "skipped", "an empty full sync is skipped, not a completed import");
  await regression.getByRole("combobox", { name: "时区", exact: true }).selectOption("Australia/Melbourne");
  await regression.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "自上次查看", exact: true }).click();
  await regression.getByText(discovered.title, { exact: true }).first().click();
  await detail.waitFor();
  const melbourneTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(discovered.dueAt));
  assert.ok((await detail.innerText()).includes(melbourneTime), "changing timezone must update deadline rendering without a reload");
  await regression.keyboard.press("Escape");
  await regressionContext.close();
  assert.deepEqual(pageErrors, [], "browser must not throw uncaught JavaScript errors");

  console.log("webapp e2e smoke passed");
} catch (error) {
  if (artifactsDir && browser) {
    let index = 0;
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        await capture(page, `failure-${index++}.png`).catch(() => undefined);
      }
    }
  }
  throw error;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  if (service.exitCode === null && service.signalCode === null) await new Promise((resolve) => service.once("exit", resolve));
  rmSync(dataDir, { recursive: true, force: true });
}
