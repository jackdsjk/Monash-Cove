// Muster ships no dedicated test file for examSignature; its behaviour is exercised
// indirectly by `src/services/examSchedule.test.ts` ("keeps the cached array after HTTP 304
// and updates it only when the arrangement changes"). These cases are adapted from that
// scenario plus the function's own contract comment.
import { describe, expect, it } from "vitest";
import type { ExamSchedule } from "./types";
import { examSignature } from "./examSignature";

const exam = (overrides: Partial<ExamSchedule> = {}): ExamSchedule => ({
  id: "e1",
  courseCode: "FIT5201",
  courseName: "Machine learning",
  examType: "Final",
  date: "2026-11-16",
  startTime: "08:00",
  endTime: "10:10",
  location: "Room 1",
  ...overrides,
});

describe("examSignature", () => {
  it("ignores response order and regenerated IDs", () => {
    const a = exam();
    const b = exam({ id: "regenerated-id", courseCode: "FIT5122", courseName: "Another", location: "Room 2" });
    expect(examSignature([a, b])).toBe(examSignature([b, a]));
    expect(examSignature([exam()])).toBe(examSignature([exam({ id: "regenerated-id" })]));
  });

  it("changes when the actual arrangement changes", () => {
    expect(examSignature([exam({ startTime: "09:00" })])).not.toBe(examSignature([exam()]));
    expect(examSignature([exam({ location: "Room 2" })])).not.toBe(examSignature([exam()]));
    expect(examSignature([exam({ seatNumber: "A12" })])).not.toBe(examSignature([exam()]));
  });

  it("normalizes course code casing and location whitespace", () => {
    expect(examSignature([exam({ courseCode: " fit5201 " })])).toBe(examSignature([exam()]));
    expect(examSignature([exam({ location: " Room 1 " })])).toBe(examSignature([exam()]));
  });

  it("prefers ISO start/end instants over the split date and time fields", () => {
    const withInstants = exam({ startAt: "2026-11-16T08:00:00Z", endAt: "2026-11-16T10:10:00Z" });
    expect(examSignature([withInstants])).toBe(
      examSignature([exam({ date: "1999-01-01", startTime: "00:00", endTime: "00:00", startAt: "2026-11-16T08:00:00Z", endAt: "2026-11-16T10:10:00Z" })]),
    );
  });

  it("includes timezone, duration and instructions", () => {
    expect(examSignature([exam({ timezone: "Asia/Singapore" })])).not.toBe(examSignature([exam()]));
    expect(examSignature([exam({ durationMinutes: 130 })])).not.toBe(examSignature([exam()]));
    expect(examSignature([exam({ instructions: "Closed book" })])).not.toBe(examSignature([exam()]));
  });

  it("is stable for an empty timetable", () => {
    expect(examSignature([])).toBe("[]");
  });
});
