// Actual production UI with fixed anonymous demo DTOs. No account access.
// Rebuild local-service and webapp, then: node webapp/e2e/capture-readme.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serviceDir = path.join(root, 'local-service');
const outputDir = path.join(root, 'docs/assets/screenshots');
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'cove-readme-'));
const marker = `COVE_README_READY_${randomUUID()}:`;
const now = Date.parse('2026-11-11T09:00:00+08:00');
const hour = 3_600_000;
const at = (hours) => new Date(now + hours * hour).toISOString();
const cache = { fetchedAt: at(-0.1), checkedAt: at(-0.1), refreshing: false, stale: false, error: null, identity: 'anonymous-demo' };
const sources = ['gmail', 'ed', 'moodle', 'ontrack'].map((id) => ({
  id, label: { gmail: 'Gmail', ed: 'Ed', moodle: 'Moodle', ontrack: 'OnTrack' }[id],
  status: 'connected', lastSyncAt: at(-0.1), lastError: null, itemCount: 2, account: '',
}));
const item = (id, source, course, title, hours, dueHours = null) => ({
  id, source, sourceItemId: id, course, title, authorRole: 'staff',
  publishedAt: at(hours), firstSeenAt: at(hours), updatedAt: at(hours),
  dueAt: dueHours === null ? null : at(dueHours), completedAt: null,
  deadlineKind: dueHours === null ? null : 'submission',
  contentType: dueHours === null ? 'announcement' : 'assessment',
  importance: 'high', actionRequired: dueHours !== null, openOriginal: false,
  evidenceQuote: '课程团队已更新相关安排，请查看完整说明。',
  text: '这是用于产品展示的匿名演示内容。请以课程原始页面的实际说明为准。',
  url: `https://${source}.example.invalid/${id}`, ageHours: -hours, read: false,
});
const items = [
  item('demo-1', 'moodle', 'CS1001', '数据建模作业将在明晚截止', -2, 36),
  item('demo-2', 'moodle', 'CS2002', '项目报告截止时间已调整', -4, 120),
  item('demo-3', 'ed', 'CS1001', 'Week 6：讲义与练习说明已发布', -1),
  item('demo-4', 'ontrack', 'CS2002', '2.1P 已收到新的任务反馈', -5),
  item('demo-5', 'gmail', 'CS1001', '本周实验课安排与准备事项', -7),
  item('demo-6', 'ed', 'CS2002', '项目答疑与常见问题汇总', -9),
];
const changes = [{ id: 1, itemId: 'demo-2', field: 'due_at', before: at(72), after: at(120), changedAt: at(-4), source: 'moodle', course: 'CS2002', title: items[1].title }];
const gradeItem = (id, name, grade, gradeMax, weight, feedback) => ({
  id, name, grade, gradeMax, weight, feedback, gradedAt: '10 November 2026, 13:00',
  gradeRange: `0–${gradeMax}`, gradingState: grade === null ? 'pending' : 'graded', gradeSource: 'gradebook',
});
const courses = [
  { courseId: '101', courseName: 'CS1001 Introduction to Computing', courseShortName: 'CS1001_S2_2026',
    total: { earned: null, max: null }, items: [
      gradeItem('g1', '每周测验 1', 9, 10, 10, '基础概念掌握扎实，解答清晰。下一步可多练习边界情况的分析。'),
      gradeItem('g2', '编程实践', 17, 20, 20, '功能实现完整，测试说明清楚。'),
      gradeItem('g3', '数据建模报告', 25, 30, 30, '模型选择合理，论证充分。'),
      gradeItem('g4', '期末考核', null, 100, 40, ''),
    ] },
  { courseId: '102', courseName: 'CS2002 Software Design', courseShortName: 'CS2002_S2_2026',
    total: { earned: null, max: null }, items: [
      gradeItem('g5', '设计工作坊', 16, 20, 20, '设计思路清晰，团队记录完整。'),
      gradeItem('g6', '项目里程碑', 26, 30, 30, '各模块职责明确。'),
      gradeItem('g7', '项目展示', null, 100, 50, ''),
    ] },
];
const lessons = [
  { id: 201, title: 'Week 1 — 计算思维与问题分解', slideCount: 3 },
  { id: 202, title: 'Week 2 — 数据与表达', slideCount: 3 },
  { id: 203, title: 'Week 3 — 算法与设计', slideCount: 3 },
];
const attachment = (name, kind = 'pdf') => ({ name, kind, url: `https://ed.example.invalid/files/${encodeURIComponent(name)}` });
const details = lessons.map((lesson) => ({
  ...lesson, courseId: 201, files: [attachment('课程学习指南.pdf')],
  slides: [
    { id: lesson.id * 10, title: '从问题到解决方案', type: 'video',
      text: '学习如何拆解问题、表达思路，并用简单的例子验证解决方案。',
      markdown: '学习如何拆解问题、表达思路，并用简单的例子验证解决方案。',
      url: 'https://ed.example.invalid/lesson', videoUrls: ['https://ed.example.invalid/video'],
      files: [attachment('Week-01-讲义.pdf'), attachment('Week-01-课堂幻灯片.pptx', 'slides')] },
    { id: lesson.id * 10 + 1, title: '课堂练习：问题分解', type: 'text', text: '将一个熟悉的任务拆成可以验证的小步骤。', markdown: '', videoUrls: [], files: [] },
    { id: lesson.id * 10 + 2, title: '本周回顾与延伸阅读', type: 'text', text: '回顾本周的关键概念，并完成课后阅读。', markdown: '', videoUrls: [], files: [] },
  ], cache,
}));
const projects = [{ id: 301, unitId: 101, unitCode: 'CS1001', unitName: 'Introduction to Computing' }];
const task = { projectId: 301, unitCode: 'CS1001', unitName: projects[0].unitName,
  isInstantiated: true, visibility: 'within_target', description: '', dueDate: '2026-11-15',
  targetDueDate: '2026-11-13', submissionDate: at(-48), completionDate: null,
  weighting: null, timesAssessed: 1, numNewComments: 0 };
const tasks = [
  { ...task, id: 501, taskDefinitionId: 401, abbreviation: '1.1P', name: '问题分解与流程设计', status: 'fix_and_resubmit', numNewComments: 1 },
  { ...task, id: 502, taskDefinitionId: 402, abbreviation: '1.2P', name: '数据表示与基础练习', status: 'ready_for_feedback' },
  { ...task, id: 503, taskDefinitionId: 403, abbreviation: '2.1C', name: '算法设计与测试说明', status: 'complete', completionDate: at(-24) },
];
const responses = new Map([
  ['/api/brief', { items, sources, syncedAt: at(-0.1), lastCheckedAt: at(-0.1) }],
  ['/api/sources', { sources }], ['/api/changes', { changes }],
  ['/api/moodle/grades', { courses, cache }],
  ['/api/moodle/course-preferences', { activeSemester: null, hiddenCourseIds: [], pinnedCourseIds: [] }],
  ['/api/ed/courses', { courses: [{ id: 201, code: 'CS1001', name: 'Introduction to Computing' }], cache }],
  ['/api/ed/lessons', { lessons, cache }],
  ['/api/ontrack/overview', { connected: true, account: null, projects, cache }],
  ['/api/ontrack/tasks', { projects, tasks, cache }],
  ['/api/ontrack/comments', { viewerId: 7, comments: [
    { id: '1', type: 'comment', comment: '建模思路清晰，请补充边界情况的说明，并在流程图中标出判断条件。', createdAt: at(-6), authorId: 8, authorName: '演示助教' },
    { id: '2', type: 'comment', comment: '已补充测试说明和流程图，谢谢。', createdAt: at(-3), authorId: 7, authorName: '演示用户' },
  ] }],
]);

const serverCode = `
  globalThis.fetch = async () => { throw new Error('External network blocked in README capture'); };
  const { buildApp } = await import(${JSON.stringify(pathToFileURL(path.join(serviceDir, 'dist/app.js')).href)});
  const { MemorySecretStore } = await import(${JSON.stringify(pathToFileURL(path.join(serviceDir, 'dist/secrets.js')).href)});
  const app = buildApp({ dbPath: ${JSON.stringify(path.join(dataDir, 'capture.sqlite'))},
    staticDir: ${JSON.stringify(path.join(root, 'webapp/dist'))}, seed: false, autoSync: false,
    moodleSessionCheck: false, secretStore: new MemorySecretStore() });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  console.log(${JSON.stringify(marker)} + address);
  process.on('SIGTERM', () => { void app.close().then(() => process.exit(0)); });
`;
const service = spawn(process.execPath, ['--input-type=module', '-e', serverCode], {
  cwd: serviceDir,
  env: { ...process.env, COVE_AUTO_SYNC: '0', COVE_SECRET_STORE: 'memory', ONTRACK_CONFIG_DIR: path.join(dataDir, 'empty-ontrack') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let output = '';
const failures = [];
try {
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Capture service not ready: ${output.slice(-2000)}`)), 15_000);
    service.stdout.on('data', (chunk) => {
      output += String(chunk);
      const ready = output.split('\n').find((line) => line.startsWith(marker));
      if (ready) { clearTimeout(timeout); resolve(ready.slice(marker.length)); }
    });
    service.stderr.on('data', (chunk) => { output += String(chunk); });
    service.once('error', (error) => { clearTimeout(timeout); reject(error); });
    service.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Capture service exited (${code}): ${output.slice(-2000)}`)); });
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, locale: 'zh-CN', timezoneId: 'Asia/Kuala_Lumpur', reducedMotion: 'reduce' });
  await context.addInitScript(({ now }) => localStorage.setItem('cove_v3', JSON.stringify({
    setupDone: true, lastViewedAt: now - 24 * 3_600_000, lastOpenedAt: now - 24 * 3_600_000,
    marks: {}, attendance: {}, settings: { name: '演示用户', timezone: 'Asia/Kuala_Lumpur', showLaunchSummary: false },
  })), { now });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { failures.push(`External request: ${url.origin}`); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() !== 'GET') { failures.push(`Unexpected write: ${url.pathname}`); return route.abort(); }
    const body = url.pathname === '/api/ed/lesson'
      ? details.find((detail) => detail.id === Number(url.searchParams.get('lessonId')))
      : responses.get(url.pathname);
    if (!body) { failures.push(`Unexpected API: ${url.pathname}`); return route.abort(); }
    return route.fulfill({ json: body });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  mkdirSync(outputDir, { recursive: true });
  const capture = async (route, name, ready) => {
    await page.goto(`${base}/#${route}`);
    await ready();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(document.getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)));
    });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false, animations: 'disabled' });
    console.log(`${name}.png — 1440×1080`);
  };
  await capture('/', 'brief', async () => {
    await page.getByRole('heading', { name: '成绩概览', exact: true }).waitFor();
    await page.getByText(items[0].title, { exact: true }).first().waitFor();
    await page.getByRole('list', { name: '首页成绩摘要' }).waitFor();
  });
  await capture('/grades', 'grades', async () => {
    await page.getByText('每周测验 1', { exact: true }).first().waitFor();
    await page.getByText(courses[0].items[0].feedback, { exact: true }).waitFor();
  });
  await capture('/ed', 'ed', async () => {
    await page.getByText('Week-01-讲义.pdf', { exact: true }).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('下载整门课') && !button.disabled));
  });
  await capture('/ontrack', 'ontrack', async () => {
    await page.getByRole('button', { name: /^查看反馈/ }).first().click();
    await page.getByText('建模思路清晰，请补充边界情况的说明，并在流程图中标出判断条件。', { exact: true }).waitFor();
  });
  assert.deepEqual(failures, [], 'Capture must not contain page errors, external access or unexpected API calls');
  await context.close();
  console.log('Four anonymous production-UI captures verified; no external requests.');
} finally {
  await browser?.close();
  service.kill('SIGTERM');
  if (service.exitCode === null && service.signalCode === null) await new Promise((resolve) => service.once('exit', resolve));
  rmSync(dataDir, { recursive: true, force: true });
}
