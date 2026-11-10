import { afterEach, describe, expect, it, vi } from "vitest";
import { MoodleContentClient } from "../sources/moodle-content.js";
import { MoodleClient } from "../sources/moodle.js";
import { createDatabase } from "../db.js";
import type { MoodleContentRow } from "../domain.js";
import { coursePreferencesSchema } from "../course-preferences.js";
import { syncAllMoodleContent, syncMoodleContent } from "../sync/moodle-content.js";

afterEach(() => vi.restoreAllMocks());

const courseHtml = `
<html><body>
<a href="https://learning.monash.edu/course/view.php?id=1&amp;section=7" title="Week 1 - Intro">Week 1</a>
<a href="https://learning.monash.edu/course/view.php?id=1&amp;section=8" title="Week 2 - Next">Week 2</a>
</body></html>`;

const weekHtml = `
<html><body>
<a href="https://learning.monash.edu/mod/forum/discuss.php?d=9">Week 1 announcement</a>
<li class="activity activity-wrapper resource modtype_resource">
  <a href="https://learning.monash.edu/mod/resource/view.php?id=2">Week 1 slides File</a>
</li>
<li class="activity activity-wrapper assign modtype_assign">
  <a href="https://learning.monash.edu/mod/assign/view.php?id=3">Week 1 assignment</a>
</li>
<li class="activity activity-wrapper label modtype_label">
  <div>Select activity Read this before class</div>
</li>
<li class="activity activity-wrapper label modtype_label">
  <div>Select activity [Malaysia Campus] Resources</div>
  <a href="https://learning.monash.edu/mod/resource/view.php?id=10">[pdf] Malaysia Week 1</a>
</li>
</body></html>`;

describe("Moodle weekly content", () => {
  it("groups sections, resources, work, labels, and forum links", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      return new Response(url.includes("section=7") ? weekHtml : courseHtml, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new MoodleContentClient("https://learning.monash.edu", "session", fetcher);
    const rows = await client.scrapeCourse(1, "FIT1047");
    expect(rows.some((row) => row.sectionTitle === "Week 1 - Intro" && row.module === "resource")).toBe(true);
    expect(rows.some((row) => row.module === "assign")).toBe(true);
    expect(rows.some((row) => row.module === "forum" && row.title.includes("announcement"))).toBe(true);
    expect(rows.some((row) => row.module === "label" && row.text.includes("before class"))).toBe(true);
    expect(rows.some((row) => row.title === "[pdf] Malaysia Week 1" && row.campus === "malaysia")).toBe(true);
    expect(rows.some((row) => row.module === "resource" && row.campus === "australia")).toBe(true);
    expect(rows.some((row) => row.sectionTitle === "Week 2 - Next")).toBe(false);
  });
});

describe("Moodle content synchronization range", () => {
  const courses = [
    { id: 1, shortname: "UNIT_S1_2026", fullname: "Course 1" },
    { id: 2, shortname: "UNIT_S2_2026", fullname: "Course 2" },
    { id: 3, shortname: "UNIT_UNKNOWN", fullname: "Course 3" },
  ];
  const row = (courseId: number, title: string): MoodleContentRow => ({
    id: `resource-${courseId}`, courseId: String(courseId), courseName: `Course ${courseId}`,
    sectionNumber: 1, sectionTitle: "Week 1", module: "resource", title,
    url: `https://moodle.example.invalid/mod/resource/view.php?id=${courseId}`, text: "",
    updatedAt: "2026-11-10T00:00:00.000Z",
  });

  it("scrapes only selected courses without deleting hidden or historical cached materials", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    try {
      db.replaceMoodleContent("1", [row(1, "Cached historical course")]);
      db.replaceMoodleContent("2", [row(2, "Cached hidden course")]);
      vi.spyOn(MoodleClient.prototype, "listCourses").mockResolvedValue(courses);
      const scrape = vi.spyOn(MoodleContentClient.prototype, "scrapeCourse").mockImplementation(async (id) => [row(id, "Fresh")]);
      const progress = vi.fn();
      const preferences = coursePreferencesSchema.parse({ activeSemester: "2026-S2", hiddenCourseIds: ["2"] });
      expect(await syncAllMoodleContent(db, "https://moodle.example.invalid", "fixture-only", fetch, progress, preferences)).toEqual({ courses: 1, items: 1 });
      expect(scrape.mock.calls.map(([id]) => id)).toEqual([3]);
      expect(progress).toHaveBeenCalledWith(1, 1);
      expect(db.listMoodleContent("1")[0]?.title).toBe("Cached historical course");
      expect(db.listMoodleContent("2")[0]?.title).toBe("Cached hidden course");
      expect(db.listMoodleContent("3")[0]?.title).toBe("Fresh");
      // An explicit single-course refresh remains available outside the background range.
      await syncMoodleContent(db, "https://moodle.example.invalid", "fixture-only", 2, fetch);
      expect(db.listMoodleContent("2")[0]?.title).toBe("Fresh");
    } finally {
      db.close();
    }
  });

  it("retains each successful course transaction and the failed course's previous materials", async () => {
    const db = createDatabase({ dbPath: ":memory:", seed: false });
    try {
      db.replaceMoodleContent("2", [row(2, "Previous materials")]);
      vi.spyOn(MoodleClient.prototype, "listCourses").mockResolvedValue(courses);
      vi.spyOn(MoodleContentClient.prototype, "scrapeCourse").mockImplementation(async (id) => {
        if (id === 2) throw new Error("Fixture scrape failed");
        return [row(id, "Fresh")];
      });
      await expect(syncAllMoodleContent(db, "https://moodle.example.invalid", "fixture-only", fetch)).rejects.toThrow("Fixture scrape failed");
      expect(db.listMoodleContent("1")[0]?.title).toBe("Fresh");
      expect(db.listMoodleContent("2")[0]?.title).toBe("Previous materials");
    } finally {
      db.close();
    }
  });
});
