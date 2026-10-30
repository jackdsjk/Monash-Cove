import { describe, expect, it } from "vitest";
import { parseAttendanceRows } from "../attendance/parser.js";

describe("attendance parser", () => {
  it("parses multiple session codes from a Gmail announcement", () => {
    const codes = parseAttendanceRows([
      {
        id: "1",
        source: "gmail",
        course: "",
        title: "FIT1047_S2_2026 - Announcements - [Malaysia Campus] Attendance Code (Week 12)",
        text: "Workshop 1: 3647G\nWorkshop 2: MXAUW\nApplied 3: PCYQ3",
        url: "https://mail.google.com/mail/u/0/#inbox/1",
        publishedAt: "2026-10-19T04:23:06.000Z",
      },
    ]);
    expect(codes).toHaveLength(3);
    expect(codes.find((item) => item.session === "Workshop 1")).toMatchObject({
      course: "FIT1047_S2_2026",
      week: 12,
      session: "Workshop 1",
      code: "3647G",
      source: "gmail",
    });
  });

  it("parses codes found in Moodle text and ignores unrelated attendance discussions", () => {
    const codes = parseAttendanceRows([
      {
        id: "moodle-1",
        source: "moodle",
        course: "FIT1047_S2_2026",
        title: "[Malaysia Campus] Attendance Code (Week 12)",
        text: "Workshop 1: 3647G Applied 3: PCYQ3",
        url: "https://learning.monash.edu/mod/forum/discuss.php?d=1",
        publishedAt: "2026-10-20T00:00:00.000Z",
      },
      {
        id: "ed-1",
        source: "ed",
        course: "FIT1047",
        title: "Attendance Code",
        text: "Where do I find the attendance code?",
        url: "https://edstem.org/au/courses/1/discussion/1",
        publishedAt: "2026-07-28T00:00:00.000Z",
      },
    ]);
    expect(codes).toHaveLength(2);
    expect(codes.every((item) => item.source === "moodle")).toBe(true);
  });
});
