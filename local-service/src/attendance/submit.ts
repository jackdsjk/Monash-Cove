import { chromium, type Browser } from "playwright";
import type { AttendanceCredentials } from "./client.js";
import { courseCode, normalizePortalText, sessionKey } from "./portal.js";

/**
 * Submit attendance codes to the Monash Attendance portal.
 *
 * This is the only operation in Cove that writes to the university system, so
 * the rules are deliberately strict:
 * - `submitted` is only returned when the portal itself says the code was
 *   accepted. "No error message" is never treated as success.
 * - Nothing is retried. A failure is reported with the portal's own words.
 * - The whole request shares one browser session and one 90 s deadline; items
 *   are processed serially because the portal is a single-session app.
 */
export const ATTENDANCE_SUBMIT_TIMEOUT_MS = 90_000;

export type AttendanceSubmitStatus =
  | "submitted"
  | "invalid_code"
  | "not_open"
  | "not_found"
  | "timeout"
  | "error"
  | "unknown"
  | "not_attempted";

export interface AttendanceSubmitInput {
  course?: string;
  week?: number;
  session?: string;
  code: string;
}

export interface AttendanceSubmitResult extends AttendanceSubmitInput {
  status: AttendanceSubmitStatus;
  message: string;
  /** 门户原话（已修剪），前端原样展示；没有可读反馈时为空。 */
  feedback?: string;
}

export interface AttendanceSubmitSummary {
  submitted: number;
  failed: number;
  results: AttendanceSubmitResult[];
}

/** 未登录 / session 过期：整批都不能提交，路由返回 409。 */
export class AttendanceLoginRequiredError extends Error {
  constructor(message = "Attendance 登录已过期，需要重新连接后再提交。") {
    super(message);
    this.name = "AttendanceLoginRequiredError";
  }
}

/** 同一时间只允许一个提交会话，避免两个浏览器会话写同一门户。 */
export class AttendanceSubmitBusyError extends Error {
  constructor(message = "已有一次提交正在进行，等它结束后再操作。") {
    super(message);
    this.name = "AttendanceSubmitBusyError";
  }
}

/**
 * The subset of the Playwright `Page` / `Locator` API this flow needs.
 * Tests pass a plain object with the same shape, so no browser is launched.
 */
export interface PortalLocator {
  count(): Promise<number>;
  first(): PortalLocator;
  nth(index: number): PortalLocator;
  innerText(options?: { timeout?: number }): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  fill(value: string): Promise<void>;
  click(options?: { timeout?: number }): Promise<void>;
}

export interface PortalPage {
  goto(url: string, options?: { waitUntil?: "domcontentloaded"; timeout?: number }): Promise<unknown>;
  url(): string;
  locator(selector: string): PortalLocator;
  selectOption(selector: string, value: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForLoadState(state?: "domcontentloaded"): Promise<unknown>;
}

const UNITS_PATH = "/student/Units.aspx";
const ENTRY_SELECTOR = 'a[href*="Entry.aspx"]';
const INPUT_SELECTOR =
  'input[type="text"], input:not([type]), input[type="tel"], input[placeholder*="code" i], input[name*="code" i]';
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Submit")',
  'input[value*="Submit" i]',
  '[id*="Submit" i]',
];
const MESSAGE_SELECTOR = '#lblMessage, #lblError, #lblSuccess, [role="alert"], [id*="message" i], [class*="alert" i]';
const FEEDBACK_LIMIT = 600;

const INVALID_CODE = /invalid|incorrect|not valid|not a valid|does not match|wrong (attendance )?code|unknown code|code is not/i;
const NOT_OPEN = /not (yet )?open|closed|expired|no active|not available|not currently|has not started|not started|no longer/i;
const SUCCESS =
  /success|successful|recorded|accepted|thank|submitted|marked (as )?present|attendance (has been |was )?(recorded|saved|submitted)|code (has been )?accepted/i;

class DeadlineExceededError extends Error {
  constructor() {
    super("deadline exceeded");
    this.name = "DeadlineExceededError";
  }
}

let submitInFlight = false;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function budgetLabel(timeoutMs: number): string {
  return timeoutMs >= 1_000 ? `${Math.round(timeoutMs / 1_000)} 秒` : `${timeoutMs} 毫秒`;
}

function result(
  item: AttendanceSubmitInput,
  status: AttendanceSubmitStatus,
  message: string,
  feedback?: string,
): AttendanceSubmitResult {
  return {
    course: item.course,
    week: item.week,
    session: item.session,
    code: item.code,
    status,
    message,
    ...(feedback ? { feedback } : {}),
  };
}

function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineExceededError()), Math.max(1, timeoutMs));
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 门户把成功/失败放在消息容器里；读不到就退回“提交后新增的文字”。 */
export function classifySubmitFeedback(feedback: string): { status: AttendanceSubmitStatus; message: string } {
  if (INVALID_CODE.test(feedback)) {
    return {
      status: "invalid_code",
      message: "门户判定这个代码无效。这一项没有提交成功；请核对代码来源，必要时在门户手动提交。",
    };
  }
  if (NOT_OPEN.test(feedback)) {
    return {
      status: "not_open",
      message: "门户说这一场目前不能提交（未开放、已关闭或不是当前班次），没有提交任何内容。若你认为窗口应该开着，请到门户手动确认。",
    };
  }
  if (SUCCESS.test(feedback)) {
    return { status: "submitted", message: "门户确认提交成功。" };
  }
  return {
    status: "unknown",
    message: "门户返回了无法识别的内容，是否提交成功未知。请到门户核对，不要直接重复提交。",
  };
}

async function bodyText(page: PortalPage): Promise<string> {
  return normalizePortalText(await page.locator("body").innerText().catch(() => ""));
}

async function readMessage(page: PortalPage): Promise<string> {
  const nodes = page.locator(MESSAGE_SELECTOR);
  const count = Math.min(await nodes.count().catch(() => 0), 5);
  const texts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const text = normalizePortalText(await nodes.nth(index).innerText({ timeout: 1_000 }).catch(() => ""));
    if (text && !texts.includes(text)) texts.push(text);
  }
  return texts.join("\n");
}

function addedText(before: string, after: string): string {
  const known = new Set(before.split("\n").map((line) => line.trim()).filter(Boolean));
  return normalizePortalText(
    after
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !known.has(line))
      .join("\n"),
  );
}

function assertLoggedIn(page: PortalPage): void {
  if (/okta\.com/i.test(page.url())) throw new AttendanceLoginRequiredError();
}

/**
 * Open the Entry form for one course/session.
 * The portal only exposes `Entry.aspx` while the code window is open, so a
 * missing link or a missing input means "not open" — never "create one".
 */
async function openEntryForm(
  page: PortalPage,
  item: AttendanceSubmitInput,
  baseUrl: string,
  budgetMs: number,
): Promise<{ status: "form"; input: PortalLocator } | { status: "inactive" | "not_found"; message: string }> {
  await page.goto(`${baseUrl}${UNITS_PATH}`, { waitUntil: "domcontentloaded", timeout: Math.max(1_000, budgetMs) });
  assertLoggedIn(page);

  const course = courseCode(item.course ?? "");
  const wanted = sessionKey(item.session ?? "");
  const links = page.locator(ENTRY_SELECTOR);
  const linkCount = await links.count();
  for (let index = 0; index < linkCount; index += 1) {
    const link = links.nth(index);
    const label = normalizePortalText(await link.innerText().catch(() => ""));
    if (!label.toUpperCase().includes(course) || sessionKey(label) !== wanted) continue;
    const href = await link.getAttribute("href");
    if (!href) continue;
    await page.goto(new URL(href, page.url()).toString(), {
      waitUntil: "domcontentloaded",
      timeout: Math.max(1_000, budgetMs),
    });
    assertLoggedIn(page);
    const input = page.locator(INPUT_SELECTOR).first();
    if ((await input.count()) === 0) {
      return {
        status: "inactive",
        message: "找到 Entry 页面，但没有 active attendance code 输入框；窗口可能尚未开放，没有提交。",
      };
    }
    return { status: "form", input };
  }

  // Older portal layouts embed the form in the day panel instead of a link.
  const dateOptions = page.locator("#daySel option");
  const dateCount = await dateOptions.count();
  for (let option = 0; option < dateCount; option += 1) {
    const date = await dateOptions.nth(option).getAttribute("value");
    if (!date) continue;
    await page.selectOption("#daySel", date).catch(() => undefined);
    await page.waitForTimeout(80);
    const rows = page.locator(`#dayPanel_${date} li`);
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const text = normalizePortalText(await row.innerText().catch(() => ""));
      if (!text.toUpperCase().includes(course) || sessionKey(text) !== wanted) continue;
      await row.click().catch(() => undefined);
      await page.waitForTimeout(250);
      const input = page.locator(INPUT_SELECTOR).first();
      if ((await input.count()) === 0) {
        return {
          status: "inactive",
          message: "找到对应活动，但当前没有 active attendance code 输入框；活动可能尚未开始或 code 窗口未开启，没有提交。",
        };
      }
      return { status: "form", input };
    }
  }

  return {
    status: "not_found",
    message: `没有在 Attendance 页面找到 ${item.course ?? "这门课"} / ${item.session ?? "这个班次"} 的入口，没有提交。请到门户手动核对班级与周次。`,
  };
}

async function findSubmitButton(page: PortalPage): Promise<PortalLocator | null> {
  for (const selector of SUBMIT_SELECTORS) {
    const locator = page.locator(selector);
    if ((await locator.count().catch(() => 0)) > 0) return locator.first();
  }
  return null;
}

async function submitEntry(page: PortalPage, input: PortalLocator, item: AttendanceSubmitInput, budgetMs: number): Promise<AttendanceSubmitResult> {
  try {
    await input.fill(item.code);
  } catch (error) {
    return result(item, "error", `无法把代码填进门户表单：${errorText(error)}。没有提交。`);
  }

  const button = await findSubmitButton(page);
  if (!button) {
    return result(
      item,
      "unknown",
      "已把代码填入表单，但页面没有找到提交按钮，因此没有提交。请到门户手动提交。",
    );
  }

  const before = await bodyText(page);
  try {
    await button.click({ timeout: Math.max(1_000, budgetMs) });
  } catch (error) {
    const text = errorText(error);
    const status = /timeout/i.test(text) ? "timeout" : "error";
    return result(
      item,
      status,
      status === "timeout"
        ? "点击提交后等待门户响应超时，已中止。这次提交是否生效未知——请立刻到门户核对，不要直接重复提交。"
        : `点击提交按钮失败：${text}。这次提交是否生效未知，请到门户核对。`,
    );
  }

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(300);

  const explicit = await readMessage(page);
  const after = await bodyText(page);
  const feedback = normalizePortalText(explicit || addedText(before, after)).slice(0, FEEDBACK_LIMIT);
  if (!feedback) {
    return result(
      item,
      "unknown",
      "提交后门户没有显示任何可读反馈，是否提交成功未知。请到门户核对，不要直接重复提交。",
    );
  }

  const verdict = classifySubmitFeedback(feedback);
  return result(item, verdict.status, verdict.message, feedback);
}

async function runItem(
  page: PortalPage,
  item: AttendanceSubmitInput,
  baseUrl: string,
  budgetMs: number,
): Promise<AttendanceSubmitResult> {
  const course = courseCode(item.course ?? "");
  const wanted = sessionKey(item.session ?? "");
  if (!course || !wanted) {
    return result(item, "not_found", "这一条缺少课程或班次，无法在门户定位表单，没有提交。");
  }

  const target = await openEntryForm(page, item, baseUrl, budgetMs);
  if (target.status !== "form") return result(item, target.status === "inactive" ? "not_open" : "not_found", target.message);
  return submitEntry(page, target.input, item, budgetMs);
}

export interface SubmitAttendanceOptions {
  timeoutMs?: number;
  /** Test seam: drive the flow with a fake page instead of launching Chrome. */
  page?: PortalPage;
}

export async function submitAttendance(
  credentials: AttendanceCredentials,
  items: AttendanceSubmitInput[],
  options: SubmitAttendanceOptions = {},
): Promise<AttendanceSubmitSummary> {
  if (submitInFlight) throw new AttendanceSubmitBusyError();

  const timeoutMs = options.timeoutMs ?? ATTENDANCE_SUBMIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let browser: Browser | null = null;
  submitInFlight = true;

  try {
    let page = options.page;
    if (!page) {
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const context = await browser.newContext();
      await context.addCookies(
        credentials.cookies.map((cookie) => ({
          ...cookie,
          sameSite: cookie.sameSite === "None" ? "None" : cookie.sameSite === "Strict" ? "Strict" : "Lax",
        })),
      );
      page = (await context.newPage()) as unknown as PortalPage;
    }

    const results: AttendanceSubmitResult[] = [];
    const pending = items.map<AttendanceSubmitInput>((raw) => ({
      course: raw.course,
      week: raw.week,
      session: raw.session,
      code: raw.code.trim(),
    }));
    let aborted = false;
    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      const remaining = deadline - Date.now();
      if (aborted || remaining <= 0) {
        results.push(
          result(
            item,
            "not_attempted",
            `这一项没有提交：上一项已中止或整批 ${budgetLabel(timeoutMs)} 已用完。门户是单会话，Cove 不会继续尝试。`,
          ),
        );
        continue;
      }
      try {
        results.push(await withDeadline(runItem(page, item, credentials.baseUrl, remaining), remaining));
      } catch (error) {
        if (error instanceof DeadlineExceededError) {
          results.push(
            result(
              item,
              "timeout",
              `超过 ${budgetLabel(timeoutMs)} 没有拿到门户反馈，已中止。这次提交是否生效未知——请立刻到门户核对，不要直接重复提交。`,
            ),
          );
          aborted = true;
          continue;
        }
        if (error instanceof AttendanceLoginRequiredError) {
          // 前面的条目可能已经真的提交了；409 只在整个批次都没提交时返回，
          // 否则这些结果会被丢掉，用户就不知道哪些已经写进门户。
          if (results.length === 0) throw error;
          results.push(result(item, "error", `${error.message} 这一项没有提交。`));
          aborted = true;
          continue;
        }
        results.push(
          result(item, "error", `提交过程中出错：${errorText(error)}。这次提交是否生效未知，请到门户核对。`),
        );
      }
    }

    const submitted = results.filter((entry) => entry.status === "submitted").length;
    return { submitted, failed: results.length - submitted, results };
  } finally {
    submitInFlight = false;
    if (browser) await browser.close().catch(() => undefined);
  }
}
