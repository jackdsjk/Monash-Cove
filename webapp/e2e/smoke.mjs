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

async function readDownload(download) {
  const stream = await download.createReadStream();
  assert.ok(stream, "fixture download should have a readable body");
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function learningRegressions(browser, brief, fixtureSources, pageErrors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const externalRequests = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(() => window.localStorage.setItem("cove_v3", JSON.stringify({
    setupDone: true, lastViewedAt: 0, marks: {}, attendance: {},
    settings: { name: "Fixture user", timezone: "Asia/Kuala_Lumpur", showLaunchSummary: false },
  })));
  const courses = Array.from({ length: 9 }, (_, index) => ({
    id: 101 + index,
    shortname: `TEST${index < 2 ? '1001' : 1000 + index}_S${index === 0 ? 1 : 2}_2026 — A very long fixture course name with many words ${index + 1}`,
    fullname: `Fixture course ${index + 1}`,
  }));
  const materials = [
    { id: "read-1", sectionNumber: 1, sectionTitle: "Week 1", title: "Reading One", module: "resource" },
    { id: "read-2", sectionNumber: 2, sectionTitle: "Week 2", title: "Reading Two", module: "resource" },
    { id: "quiz-2", sectionNumber: 2, sectionTitle: "Week 2", title: "Quiz Two", module: "quiz" },
    { id: "read-10", sectionNumber: 10, sectionTitle: "Week 10", title: "Reading Ten", module: "resource" },
  ].map((item) => ({ ...item, courseId: "101", courseName: courses[0].shortname, text: "Anonymous fixture", updatedAt: "2026-11-01T00:00:00Z", campus: "shared", url: `https://moodle.example.invalid/mod/resource/view.php?id=${item.id}` }));
  const summaries = [
    { id: 210, title: "Week 10 — Last lesson", slideCount: 1 },
    { id: 202, title: "Week 2 — Middle lesson", slideCount: 1 },
    { id: 201, title: "Week 1 — First lesson", slideCount: 1 },
    { id: 204, title: "Week 4 — Empty lesson", slideCount: 0 },
    { id: 299, title: "Reference guide", slideCount: 1 },
  ];
  const details = summaries.map((summary) => ({ id: summary.id, title: summary.title, courseId: 201,
    slides: summary.slideCount === 0 ? [] : [{ id: summary.id * 10, title: `Content ${summary.id}`, type: "text", text: "Anonymous learning fixture", markdown: "Anonymous learning fixture", url: "https://ed.example.invalid/lesson", videoUrls: [], files: [] }],
  }));
  const now = Date.now();
  const assignments = Array.from({ length: 12 }, (_, index) => ({
    id: `moodle:fixture-assignment-${index + 1}`, courseId: index < 6 ? "101" : "102", course: "TEST1001",
    courseName: courses[index < 6 ? 0 : 1].shortname, title: `Fixture Assignment ${String(index + 1).padStart(2, "0")}`,
    url: `https://moodle.example.invalid/mod/assign/view.php?id=${index + 1}`, text: `Moodle-only content ${index + 1}`,
    dueAt: index % 4 === 0 ? null : new Date(now + (index % 3 === 0 ? -1 : 1) * 86400_000).toISOString(),
    completedAt: index === 1 ? new Date(now - 3600_000).toISOString() : null, changes: [],
  }));
  const task = { id: null, isInstantiated: false, visibility: "within_target", projectId: 301, taskDefinitionId: 401,
    unitCode: "TEST1001", unitName: "Fixture unit", abbreviation: "1.1P", name: "Unstarted fixture worksheet", description: "",
    status: "not_instantiated", dueDate: null, targetDueDate: null, submissionDate: null, completionDate: null,
    weighting: null, timesAssessed: 0, numNewComments: 0 };
  const tasks = [task, { ...task, id: 502, isInstantiated: true, taskDefinitionId: 402, abbreviation: "2.1P", name: "Submitted fixture worksheet", status: "complete" }];
  let preferences = { activeSemester: null, hiddenCourseIds: [], pinnedCourseIds: [] };
  let oldPreferencesService = false;
  const batchRequests = [];
  const artifacts = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname === "/api/sources") return route.fulfill({ json: { sources: fixtureSources.map((source) => ({ ...source, status: "connected", lastError: null })) } });
    if (pathname === "/api/brief") return route.fulfill({ json: { ...brief, items: [] } });
    if (pathname === "/api/changes") return route.fulfill({ json: { changes: [] } });
    if (pathname === "/api/moodle/courses") return route.fulfill({ json: { courses } });
    if (pathname === "/api/moodle/grades") return route.fulfill({ json: { courses: [
      { courseId: "known", courseName: "TEST2001 Known weights", total: { earned: null, max: null }, items: [
        { id: "known-graded", name: "Known weighted quiz", grade: 8, gradeMax: 10, weight: 20, feedback: "", gradedAt: null },
        { id: "known-pending", name: "Pending final", grade: null, gradeMax: 100, weight: 80, feedback: "", gradedAt: null },
      ] },
      { courseId: "unknown", courseName: "TEST2002 Unknown weights", total: { earned: 80, max: 100 }, items: [
        { id: "unknown-weight", name: "Unweighted published mark", grade: 8, gradeMax: 10, weight: null, feedback: "", gradedAt: null },
      ] },
    ] } });
    if (pathname === "/api/moodle/content") return route.fulfill({ json: { items: url.searchParams.get("courseId") === "101" ? materials : [] } });
    if (pathname === "/api/moodle/course-preferences") {
      if (oldPreferencesService) return route.fulfill({ status: 404, json: { error: { message: "Not found" } } });
      if (route.request().method() === "PATCH") preferences = route.request().postDataJSON();
      return route.fulfill({ json: preferences });
    }
    if (pathname === "/api/moodle/download-batch") {
      batchRequests.push(route.request().postDataJSON());
      return route.fulfill({ contentType: "application/zip", body: Buffer.from("PK fixture archive"), headers: { "x-cove-batch-count": "1", "x-cove-batch-skipped": "0" } });
    }
    if (pathname === "/api/ed/courses") return route.fulfill({ json: { courses: [{ id: 201, code: "TEST1001", name: "Fixture Ed course" }] } });
    if (pathname === "/api/ed/lessons") return route.fulfill({ json: { lessons: summaries } });
    if (pathname === "/api/ed/lesson") return route.fulfill({ json: details.find((detail) => detail.id === Number(url.searchParams.get("lessonId"))) });
    if (pathname === "/api/pack") return route.fulfill({ json: { rubric: null, assignments: [...assignments,
      { ...assignments[0], id: "ontrack:sentinel", title: "Excluded OnTrack task", url: "https://ontrack.example.invalid/tasks/1" }],
      posts: [{ title: "Excluded Ed sentinel", text: "This must not appear in Moodle exports" }],
    } });
    if (pathname === "/api/ontrack/overview") return route.fulfill({ json: { connected: true, account: null, projects: [] } });
    if (pathname === "/api/ontrack/tasks") return route.fulfill({ json: { projects: [], tasks } });
    if (pathname === "/api/ontrack/artifact") {
      artifacts.push({ project: url.searchParams.get("project"), task: url.searchParams.get("task"), kind: url.searchParams.get("kind") });
      if (url.searchParams.get("kind") === "resources") return route.fulfill({ status: 404, json: { error: { message: "Fixture task has no resource archive" } } });
      return route.fulfill({ contentType: "application/pdf", body: Buffer.from("%PDF-1.7\nAnonymous fixture"), headers: { "content-disposition": 'attachment; filename="fixture-worksheet.pdf"' } });
    }
    return route.fallback();
  });

  try {
    await page.goto(`${base}/#/materials`, { waitUntil: "domcontentloaded" });
    await page.getByRole("checkbox", { name: "选择 Reading One", exact: true }).waitFor();
    for (const width of [390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      // Recreate the document after resizing: Chromium can reuse stale screenshot
      // compositor tiles when a tall internal scroller grows across breakpoints.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("checkbox", { name: "选择 Reading One", exact: true }).waitFor();
      assert.equal(await page.getByRole("navigation", { name: "主导航", exact: true }).count(), 1, "materials must mount one shell");
      assert.equal(await page.getByRole("button", { name: "搜索或跳转", exact: true }).count(), 1, "materials must mount one topbar");
      const heading = await page.getByRole("heading", { name: "每周资料", exact: true }).boundingBox();
      const description = await page.getByText("按 Moodle 板块列出资料、作业和公告。资料文件可以批量下载到本机。", { exact: true }).boundingBox();
      assert.ok(heading && heading.height < 45 && heading.width >= 110, `materials heading must remain horizontal at ${width}`);
      assert.ok(description && description.width >= 170, `materials description must retain readable width at ${width}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `long course selector must fit ${width}`);
      await capture(page, `materials-fixture-${width}.png`);
    }
    await page.getByRole("checkbox", { name: "选择 Reading One", exact: true }).check();
    await page.getByRole("combobox", { name: "周 / 板块", exact: true }).selectOption("2");
    await page.getByRole("checkbox", { name: "选择 Reading One", exact: true }).waitFor({ state: "hidden" });
    await page.getByText("已选 0 个文件", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "下载所选", exact: true }).isDisabled(), true, "changing week must discard hidden selections");
    await page.getByRole("combobox", { name: "类型", exact: true }).selectOption("作业");
    await page.getByRole("checkbox", { name: "选择 Quiz Two", exact: true }).waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "选择 Reading Two", exact: true }).count(), 0);
    await page.getByRole("combobox", { name: "类型", exact: true }).selectOption("资料");
    await page.getByRole("searchbox", { name: "搜索", exact: true }).fill("Reading Two");
    await page.getByRole("checkbox", { name: "选择 Reading Two", exact: true }).check();
    const materialDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载所选", exact: true }).click();
    await (await materialDownload).path();
    assert.deepEqual(batchRequests.at(-1).items.map((item) => item.name), ["Reading Two"], "download must contain only current visible selection");

    await page.getByText("同步范围", { exact: true }).click();
    await page.getByRole("combobox", { name: "学期", exact: true }).selectOption("2026-S2");
    await page.getByRole("button", { name: "保存同步范围", exact: true }).click();
    await page.getByText("同步范围已保存", { exact: true }).waitFor();
    assert.equal(preferences.activeSemester, "2026-S2");
    oldPreferencesService = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("同步范围", { exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "本地服务版本较旧" }).waitFor();
    assert.ok((await page.getByRole("alert").innerText()).includes("请重启本地服务"));
    assert.ok((await page.getByRole("alert").innerText()).includes("无需重新连接 Moodle"));
    oldPreferencesService = false;
    await page.getByRole("button", { name: "重新读取", exact: true }).click();
    await page.getByRole("button", { name: "保存同步范围", exact: true }).waitFor();

    await page.goto(`${base}/#/ed`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Content 210 文字", exact: true }).waitFor();
    const lessonTitles = await page.locator('p').filter({ hasText: /^Week \d+ — / }).allTextContents();
    assert.deepEqual(lessonTitles, ["Week 1 — First lesson", "Week 2 — Middle lesson", "Week 4 — Empty lesson", "Week 10 — Last lesson"], "Ed weeks must be chronological despite reversed API order");
    await page.getByRole("combobox", { name: "周", exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Content 202 文字", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Content 201 文字", exact: true }).count(), 0);
    await page.getByRole("combobox", { name: "周", exact: true }).selectOption("all");
    await page.getByRole("searchbox", { name: "搜索", exact: true }).fill("Content 210");
    await page.getByRole("button", { name: "Content 210 文字", exact: true }).waitFor();
    await page.getByRole("button", { name: "Content 202 文字", exact: true }).waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "Content 202 文字", exact: true }).count(), 0);
    await page.getByRole("searchbox", { name: "搜索", exact: true }).fill("");
    await page.getByRole("combobox", { name: "周", exact: true }).selectOption("4");
    await page.getByText("Week 4 — Empty lesson", { exact: true }).waitFor();
    assert.equal(await page.getByText(/内容读取失败|没有匹配的内容/).count(), 0, "successful empty lesson must remain visible");
    await page.getByRole("combobox", { name: "周", exact: true }).selectOption("other");
    await page.getByText("Reference guide", { exact: true }).first().waitFor();
    await capture(page, "ed-filtered-fixture.png");

    await page.goto(`${base}/#/pack`, { waitUntil: "domcontentloaded" });
    const packList = page.getByRole("list", { name: "Moodle 作业列表", exact: true });
    await packList.getByRole("button").last().waitFor();
    assert.equal(await packList.getByRole("button").count(), 12, "Moodle list must exclude OnTrack activities");
    for (const width of [390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok((await packList.boundingBox()).height >= 420, `assignment selector needs at least 420px height at ${width}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `assignment page must fit ${width}`);
      await capture(page, `pack-fixture-${width}.png`);
    }
    await page.getByRole("combobox", { name: "课程", exact: true }).selectOption("102");
    await packList.getByRole("button", { name: /Fixture Assignment 12/ }).click();
    await page.getByRole("radio", { name: "TEST1001 筛选结果", exact: true }).click();
    await page.getByRole("radio", { name: "JSON", exact: true }).click();
    await page.waitForFunction(() => { try { return JSON.parse(document.querySelector("pre")?.textContent ?? "").assignments.length === 6; } catch { return false; } });
    const exportJSON = JSON.parse(await page.locator("pre").innerText());
    assert.equal(exportJSON.assignments.length, 6, "course scope must use courseId even when both semesters share the code");
    assert.ok(exportJSON.assignments.every((entry) => entry.courseName === courses[1].shortname));
    await page.getByRole("searchbox", { name: "搜索作业", exact: true }).fill("Assignment 12");
    await packList.getByRole("button", { name: /Fixture Assignment 12/ }).waitFor();
    assert.equal(await packList.getByRole("button").count(), 1);
    await page.getByRole("radio", { name: "全部筛选结果", exact: true }).click();
    const packDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 .json", exact: true }).click();
    const exported = await readDownload(await packDownload);
    const exportResult = JSON.parse(exported);
    assert.equal(exportResult.assignments.length, 1);
    assert.equal(exportResult.assignments[0].title, "Fixture Assignment 12");
    assert.ok(!exported.includes("Excluded Ed sentinel") && !exported.includes("Excluded OnTrack task"), "Moodle export must not mix other sources");

    await page.goto(`${base}/#/ontrack`, { waitUntil: "domcontentloaded" });
    const unstarted = page.getByRole("listitem").filter({ hasText: "Unstarted fixture worksheet" });
    const submitted = page.getByRole("listitem").filter({ hasText: "Submitted fixture worksheet" });
    await unstarted.getByRole("button", { name: "任务书 / Worksheet", exact: true }).waitFor();
    assert.equal(await unstarted.getByRole("button", { name: "已提交文件", exact: true }).isDisabled(), true);
    const worksheetDownload = page.waitForEvent("download");
    await unstarted.getByRole("button", { name: "任务书 / Worksheet", exact: true }).click();
    assert.equal((await worksheetDownload).suggestedFilename(), "fixture-worksheet.pdf");
    await unstarted.getByRole("button", { name: "任务资料", exact: true }).click();
    await unstarted.getByRole("alert").filter({ hasText: "Fixture task has no resource archive" }).waitFor();
    const submissionDownload = page.waitForEvent("download");
    await submitted.getByRole("button", { name: "已提交文件", exact: true }).click();
    await (await submissionDownload).path();
    assert.deepEqual(artifacts, [{ project: "301", task: "401", kind: "task" }, { project: "301", task: "401", kind: "resources" }, { project: "301", task: "402", kind: "submission" }]);
    assert.equal(new URL(page.url()).origin, base, "artifact error must not navigate to the external source");
    assert.deepEqual(externalRequests, [], "fixture interactions must never send an external request");
    await capture(page, "ontrack-materials-fixture.png");

    await page.goto(`${base}/#/grades`, { waitUntil: "domcontentloaded" });
    await page.getByText("16.0 / 100", { exact: true }).waitFor();
    await page.getByText(/剩余 80% 中需拿到 42\.5%/).waitFor();
    await page.getByRole("button", { name: /TEST2002.*Unknown weights/ }).click();
    await page.getByText(/本课程已得\s*—/).waitFor();
    await page.getByText("Moodle 公布总评：80.0%（以原成绩册为准）", { exact: true }).waitFor();
    assert.equal(await page.getByText("本课程已得 80.0 / 100", { exact: true }).count(), 0, "an unweighted Moodle total must not be reinterpreted as earned weighted marks");
    await capture(page, "grades-fixture.png");
  } catch (error) {
    await capture(page, "learning-failure.png").catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
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

  for (const title of ["截止时间", "成绩", "每周资料", "Ed 学习内容", "Moodle 作业资料", "OnTrack 任务", "考勤", "来源", "设置"]) {
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
    for (const title of ["截止时间", "成绩", "每周资料", "Ed 学习内容", "Moodle 作业资料", "OnTrack 任务", "考勤", "来源", "设置"]) {
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
  await learningRegressions(browser, brief, fixtureSources, pageErrors);
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
