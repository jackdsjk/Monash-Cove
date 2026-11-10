import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { MemorySecretStore } from "../secrets.js";
import type { AttendanceCredentials } from "../attendance/client.js";
import {
  AttendanceLoginRequiredError,
  submitAttendance,
  type AttendanceSubmitSummary,
  type PortalLocator,
  type PortalPage,
} from "../attendance/submit.js";

const credentials: AttendanceCredentials = { baseUrl: "https://attendance.monash.edu.my", cookies: [] };

type FakeMode = "normal" | "no-form" | "hang" | "expired" | "no-feedback";

/**
 * Minimal fake of the Attendance portal page. It implements only the
 * Page/Locator methods the submit flow uses, so the tests never launch Chrome
 * and never touch the real portal.
 */
class FakeLocator implements PortalLocator {
  constructor(
    private readonly page: FakePage,
    private readonly kind: FakeKind,
    private readonly index: number,
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.index === 0 && this.page.count(this.kind) > 0 ? 1 : 0);
  }

  first(): PortalLocator {
    return new FakeLocator(this.page, this.kind, 0);
  }

  nth(index: number): PortalLocator {
    return new FakeLocator(this.page, this.kind, index);
  }

  async innerText(): Promise<string> {
    return this.page.text(this.kind);
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.kind === "entry-link" && name === "href" ? "/student/Entry.aspx?id=1" : null;
  }

  async fill(value: string): Promise<void> {
    if (this.kind !== "input") throw new Error(`cannot fill ${this.kind}`);
    this.page.pendingCode = value;
  }

  async click(): Promise<void> {
    if (this.kind !== "submit") throw new Error(`cannot click ${this.kind}`);
    await this.page.clickSubmit();
  }
}

type FakeKind = "body" | "entry-link" | "input" | "submit" | "dates" | "message";

class FakePage implements PortalPage {
  body: string[] = ["Monash Attendance", "Enter attendance code", "2:00 pm FIT1047 Workshop 01"];
  current = "https://attendance.monash.edu.my/student/Units.aspx";
  pendingCode = "";
  submittedCode: string | null = null;
  submitClicks = 0;
  private readonly accepted: Set<string>;
  private readonly mode: FakeMode;

  constructor(options: { accepted?: string[]; mode?: FakeMode } = {}) {
    this.accepted = new Set(options.accepted ?? []);
    this.mode = options.mode ?? "normal";
  }

  async goto(url: string): Promise<unknown> {
    if (this.mode === "hang") return new Promise<never>(() => undefined);
    this.current = url;
    if (this.mode === "expired") {
      this.current = "https://monash.okta.com/login";
      this.body = ["Sign in to Monash"];
      return null;
    }
    if (url.includes("Entry.aspx")) {
      this.current = url;
      this.body = ["Monash Attendance", "Enter attendance code", "2:00 pm FIT1047 Workshop 01"];
    }
    return null;
  }

  url(): string {
    return this.current;
  }

  locator(selector: string): PortalLocator {
    return new FakeLocator(this, this.kindOf(selector), 0);
  }

  async selectOption(): Promise<unknown> {
    return null;
  }

  async waitForTimeout(): Promise<void> {
    return undefined;
  }

  async waitForLoadState(): Promise<unknown> {
    return null;
  }

  async clickSubmit(): Promise<void> {
    this.submitClicks += 1;
    this.submittedCode = this.pendingCode;
    if (this.mode === "no-feedback") {
      // A page that reloads without any result text: the flow must not guess.
      this.body = ["Monash Attendance", "Enter attendance code"];
      return;
    }
    this.body = this.accepted.has(this.pendingCode)
      ? ["Monash Attendance", "Attendance recorded successfully. Your code was accepted."]
      : ["Monash Attendance", "The attendance code you entered is invalid. Please check the code and try again."];
  }

  count(kind: FakeKind): number {
    if (kind === "body") return 1;
    if (kind === "entry-link") return this.current.includes("Units.aspx") ? 1 : 0;
    if (kind === "input" || kind === "submit") {
      if (this.mode === "no-form") return 0;
      return this.current.includes("Entry.aspx") ? 1 : 0;
    }
    return 0;
  }

  text(kind: FakeKind): string {
    if (kind === "body") return this.body.join("\n");
    if (kind === "entry-link") return "2:00 pm FIT1047 Workshop 01";
    if (kind === "submit") return "Submit";
    return "";
  }

  private kindOf(selector: string): FakeKind {
    if (selector === "body") return "body";
    if (selector.includes("Entry.aspx")) return "entry-link";
    if (/submit/i.test(selector)) return "submit";
    if (selector.includes("input")) return "input";
    if (selector === "#daySel option") return "dates";
    return "message";
  }
}

function submitWith(page: FakePage, items: Parameters<typeof submitAttendance>[1], timeoutMs = 5_000): Promise<AttendanceSubmitSummary> {
  return submitAttendance(credentials, items, { page, timeoutMs });
}

const workshop: { course: string; week: number; session: string; code: string } = {
  course: "FIT1047_S2_2026",
  week: 12,
  session: "Workshop 1",
  code: "HX42Q",
};

describe("attendance submit", () => {
  it("submits a code and reports the portal's success text", async () => {
    const page = new FakePage({ accepted: ["HX42Q"] });
    const summary = await submitWith(page, [workshop]);

    expect(summary).toMatchObject({ submitted: 1, failed: 0 });
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe("submitted");
    expect(summary.results[0].message).toContain("提交成功");
    expect(summary.results[0].feedback).toContain("recorded successfully");
    expect(page.pendingCode).toBe("HX42Q");
    expect(page.submittedCode).toBe("HX42Q");
    // Exactly one click: a success is not repeated.
    expect(page.submitClicks).toBe(1);
  });

  it("reports an invalid code without retrying and keeps the portal's words", async () => {
    const page = new FakePage({ accepted: [] });
    const summary = await submitWith(page, [{ ...workshop, code: "BAD99" }]);

    expect(summary).toMatchObject({ submitted: 0, failed: 1 });
    expect(summary.results[0].status).toBe("invalid_code");
    expect(summary.results[0].feedback).toContain("invalid");
    expect(summary.results[0].message).toContain("没有提交成功");
    expect(page.submitClicks).toBe(1);
  });

  it("stops at the deadline and marks the rest as not attempted instead of skipping them", async () => {
    const page = new FakePage({ mode: "hang" });
    const started = Date.now();
    const summary = await submitWith(page, [workshop, { ...workshop, code: "MXAUW" }], 40);

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].status).toBe("timeout");
    expect(summary.results[0].message).toContain("是否生效未知");
    expect(summary.results[1].status).toBe("not_attempted");
    expect(summary.submitted).toBe(0);
    expect(summary.failed).toBe(2);
  });

  it("processes items serially in order and keeps going after one failure", async () => {
    const page = new FakePage({ accepted: ["HX42Q"] });
    const summary = await submitWith(page, [{ ...workshop, code: "BAD99" }, workshop]);

    expect(summary.results.map((entry) => entry.status)).toEqual(["invalid_code", "submitted"]);
    expect(page.submitClicks).toBe(2);
  });

  it("does not submit when the portal has no open form", async () => {
    const page = new FakePage({ mode: "no-form" });
    const summary = await submitWith(page, [workshop]);

    expect(summary.results[0].status).toBe("not_open");
    expect(page.submitClicks).toBe(0);
  });

  it("returns unknown, never success, when the portal shows no result text", async () => {
    const page = new FakePage({ accepted: ["HX42Q"], mode: "no-feedback" });
    const summary = await submitWith(page, [workshop]);

    expect(summary.submitted).toBe(0);
    expect(summary.results[0].status).toBe("unknown");
    expect(summary.results[0].message).toContain("未知");
  });

  it("asks the user to reconnect when the portal redirects to Okta", async () => {
    const page = new FakePage({ mode: "expired" });
    await expect(submitWith(page, [workshop])).rejects.toBeInstanceOf(AttendanceLoginRequiredError);
    expect(page.submitClicks).toBe(0);
  });
});

describe("POST /api/attendance/submit", () => {
  async function app(): Promise<FastifyInstance> {
    return buildApp({ dbPath: ":memory:", seed: true, secretStore: new MemorySecretStore() });
  }

  it("rejects an empty batch before touching the portal", async () => {
    const service = await app();
    try {
      const response = await service.inject({ method: "POST", url: "/api/attendance/submit", payload: { items: [] } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("invalid_attendance");
    } finally {
      await service.close();
    }
  });

  it("reports a missing attendance login instead of submitting", async () => {
    const service = await app();
    try {
      const response = await service.inject({
        method: "POST",
        url: "/api/attendance/submit",
        payload: { items: [workshop] },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({ code: "attendance_not_connected", retryable: false });
    } finally {
      await service.close();
    }
  });
});
