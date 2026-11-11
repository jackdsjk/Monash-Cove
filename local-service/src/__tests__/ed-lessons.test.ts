import { describe, expect, it, vi } from "vitest";
import { listLessonFiles, parseLessonSlide } from "../vendor/edstem-cli/lessons.js";
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
              content: '<document version="2.0"><paragraph>Intro text</paragraph><video src="https://video.example/1"></video><file filename="slides.pptx" url="https://static.edusercontent.com/slides.pptx"></file></document>',
            }],
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ lessons: [{ id: 1, title: "Week 1", slide_count: 1 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new EdClient("token", "au", fetcher);
    expect(await client.listLessons(9)).toEqual([{ id: 1, title: "Week 1", slideCount: 1, week: 1 }]);
    const lesson = await client.getLesson(1);
    expect(lesson.slides[0].type).toBe("video");
    expect(lesson.slides[0].videoUrls).toEqual(["https://video.example/1"]);
    expect(lesson.slides[0].files[0]).toMatchObject({ name: "slides.pptx", kind: "slides" });
    expect(lesson.slides[0].markdown).toContain("Intro text");
  });
});


describe("Ed lesson attachments copied from edstem-cli", () => {
  const url = "https://static.edusercontent.com/files/native";
  const client = (lesson: unknown) => new EdClient("fixture", "au", vi.fn(async () => Response.json({ lesson })));

  it("keeps a native PDF without content downloadable instead of inventing an empty quiz", async () => {
    const detail = await client({ id: 1, course_id: 9, slides: [{ id: 2, title: "Notes", type: "pdf", file_url: url }] }).getLesson(1);
    expect(detail.slides[0]).toMatchObject({ type: "file", text: "", files: [{ name: "Notes.pdf", url, kind: "pdf" }] });
    expect(detail.slides[0].markdown).toContain("Notes.pdf");
  });

  it.each([
    { content: "", passage: "Passage" },
    { data: { content: "Passage" } },
    { data: { passage: "Passage" } },
    { document: "Passage" },
  ])("uses upstream alternate slide content with the local document fallback", async (fields) => {
    const detail = await client({ id: 1, slides: [{ id: 2, type: "document", ...fields }] }).getLesson(1);
    expect(detail.slides[0]).toMatchObject({ text: "Passage", type: "text" });
  });

  it("keeps lesson-outline attachments separate, and deduplicates native and inline files per slide", async () => {
    const detail = await client({ id: 1, outline: `<file name="Course outline.pdf" url="${url}"></file>`, slides: [
      { id: 2, title: "Notes.PDF", type: "pdf", file_url: url, content: `<file filename="Duplicate.pdf" url="${url}"></file>` },
      { id: 3, type: "document", content: `<file url="https://static.edusercontent.com/files/Extra%20notes.pdf?version=1"></file>` },
    ] }).getLesson(1);
    expect(detail.files).toEqual([{ name: "Course outline.pdf", url, kind: "pdf" }]);
    expect(detail.slides[0].files).toEqual([{ name: "Notes.PDF", url, kind: "pdf" }]);
    expect(detail.slides[1].files[0].name).toBe("Extra notes.pdf");
  });

  it("ignores external file tags and direct unsafe file URLs while retaining genuine quizzes", async () => {
    const detail = await client({ id: 1, slides: [
      { id: 2, type: "pdf", file_url: "https://edusercontent.com.evil.invalid/notes.pdf" },
      { id: 3, type: "quiz" },
      { id: 4, type: "document", content: '<file filename="outside.pdf" url="https://outside.invalid/a.pdf"></file>' },
    ] }).getLesson(1);
    expect(detail.slides.flatMap((s) => s.files)).toEqual([]);
    expect(detail.slides[0].type).not.toBe("quiz");
    expect(detail.slides[1].type).toBe("quiz");
  });

  it("preserves empty document semantics and upstream filename fallback", () => {
    const slides = [parseLessonSlide({ id: 7, type: "pdf", file_url: url })];
    expect(listLessonFiles({ id: 1, slides })[0].filename).toBe("slide-7.pdf");
    expect(parseLessonSlide({ id: 1, content: "Main", passage: "Fallback" }).content).toBe("Main");
  });
});
