import { describe, expect, it, vi } from "vitest";
import { EdClient } from "../sources/ed.js";

describe("Ed lesson content", () => {
  it("parses videos, text, and downloadable files", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/lessons/1")) {
        return new Response(JSON.stringify({
          lesson: {
            id: 1,
            course_id: 9,
            title: "Week 1",
            slides: [{
              id: 2,
              title: "Networks",
              type: "document",
              content: '<document version="2.0"><paragraph>Intro text</paragraph><video src="https://video.example/1"></video><file filename="slides.pptx" url="https://files.example/slides.pptx"></file></document>',
            }],
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ lessons: [{ id: 1, title: "Week 1", slide_count: 1 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new EdClient("token", "au", fetcher);
    expect(await client.listLessons(9)).toEqual([{ id: 1, title: "Week 1", slideCount: 1 }]);
    const lesson = await client.getLesson(1);
    expect(lesson.slides[0].type).toBe("video");
    expect(lesson.slides[0].videoUrls).toEqual(["https://video.example/1"]);
    expect(lesson.slides[0].files[0]).toMatchObject({ name: "slides.pptx", kind: "slides" });
    expect(lesson.slides[0].markdown).toContain("Intro text");
  });
});
