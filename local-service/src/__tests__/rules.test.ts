import { describe, expect, it } from "vitest";
import { triage } from "../triage/rules.js";

const now = Date.now();
const old = new Date(now - 90 * 24 * 3_600_000).toISOString();
const recent = new Date(now - 2 * 3_600_000).toISOString();

describe("calibrated triage rules", () => {
  it("does not make an old deadline critical or actionable", () => {
    const result = triage({
      source: "ed",
      authorRole: "staff",
      title: "Assignment 1 is available",
      text: "The submission deadline for Assignment 1 is 2nd October at 11:55pm.",
      publishedAt: old,
    });
    expect(result.importance).toBe("reference");
    expect(result.actionRequired).toBe("no");
    expect(result.triageVersion).toContain("stale");
  });

  it("does not make a student question critical just because it mentions passing", () => {
    const result = triage({
      source: "ed",
      authorRole: "student",
      title: "Unit Hurdle failed can I still pass the unit",
      text: "If I fail the hurdle, can I still pass the unit? I am asking the teaching team.",
      publishedAt: recent,
    });
    expect(result.contentType).toBe("peer_question");
    expect(result.importance).not.toBe("critical");
    expect(result.actionRequired).toBe("no");
  });

  it("keeps a future Moodle deadline critical even if the source item is old", () => {
    const future = new Date(now + 3 * 24 * 3_600_000).toISOString().slice(0, 10);
    const result = triage({
      source: "moodle",
      authorRole: "system",
      title: "Portfolio submission",
      text: `Portfolio submission deadline is ${future}T12:55:00.000Z.`,
      publishedAt: old,
      kind: "assessment",
    });
    expect(result.importance).toBe("critical");
    expect(result.actionRequired).toBe("yes");
  });

  it("does not mark a reference item as requiring action", () => {
    const result = triage({
      source: "ed",
      authorRole: "student",
      title: "Week 12 notes",
      text: "Here are the slides for week 12. Please read them before the next class.",
      publishedAt: recent,
    });
    expect(result.importance).toBe("reference");
    expect(result.actionRequired).toBe("no");
  });

  it("keeps a current staff deadline critical", () => {
    const result = triage({
      source: "ed",
      authorRole: "staff",
      title: "Deadline update",
      text: "The submission deadline has changed to Friday. You must submit before 5pm.",
      publishedAt: recent,
    });
    expect(result.importance).toBe("critical");
    expect(result.actionRequired).toBe("yes");
  });
});
