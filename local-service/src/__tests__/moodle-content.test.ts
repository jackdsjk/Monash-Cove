import { describe, expect, it, vi } from "vitest";
import { MoodleContentClient } from "../sources/moodle-content.js";

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
    expect(rows.some((row) => row.sectionTitle === "Week 2 - Next")).toBe(false);
  });
});
