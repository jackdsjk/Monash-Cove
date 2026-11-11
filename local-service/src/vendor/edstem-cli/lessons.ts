/**
 * Ported from edstem-cli@0.5.0 src/ed/{client,files}.ts.
 * Copyright (c) 2026 bunizao. MIT; see LICENSE and README.md beside this file.
 */
import { parse, type HTMLElement } from "node-html-parser";

export interface RawLessonSlide {
  id?: number;
  title?: string;
  type?: string;
  index?: number;
  content?: string;
  passage?: string;
  document?: string;
  file_url?: string;
  data?: { content?: string; passage?: string };
}

export interface LessonSlide {
  id: number;
  title: string;
  type: string;
  index: number;
  content: string;
  fileUrl: string;
}

export interface LessonFile {
  filename: string;
  url: string;
  lessonId: number;
  slideId?: number;
  source: "content" | "slide";
  mediaType?: string;
}

const asString = (value: unknown): string => typeof value === "string" ? value : "";

export function parseLessonSlide(data: RawLessonSlide): LessonSlide {
  const slideData = data.data ?? {};
  return {
    content: asString(data.content) || asString(data.passage) || asString(slideData.content) || asString(slideData.passage) || asString(data.document),
    fileUrl: asString(data.file_url),
    id: Number(data.id ?? 0),
    index: Number(data.index ?? 0),
    title: asString(data.title),
    type: asString(data.type),
  };
}

function isDownloadableLessonFileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "edusercontent.com" || url.hostname.endsWith(".edusercontent.com"));
  } catch { return false; }
}

export function listLessonFiles(lesson: { id: number; outline?: string; slides: LessonSlide[] }): LessonFile[] {
  const files: LessonFile[] = [];
  const seen = new Set<string>();
  const add = (file: LessonFile): void => {
    const key = `${file.slideId ?? "lesson"}\0${file.url}`;
    if (!isDownloadableLessonFileUrl(file.url) || seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };
  for (const file of filesFromContent(lesson.outline, lesson.id)) add(file);
  for (const slide of lesson.slides) {
    if (slide.fileUrl) {
      add({
        filename: suggestedSlideFilename(slide),
        lessonId: lesson.id,
        mediaType: slide.type.toLowerCase() === "pdf" ? "application/pdf" : undefined,
        slideId: slide.id,
        source: "slide",
        url: slide.fileUrl,
      });
    }
    for (const file of filesFromContent(slide.content, lesson.id, slide)) add(file);
  }
  return files;
}

function filesFromContent(source: string | undefined, lessonId: number, slide?: LessonSlide): LessonFile[] {
  if (!source || !/<file\b/i.test(source)) return [];
  return parse(source, { lowerCaseTagName: true }).querySelectorAll("file")
    .map((node) => fileFromNode(node, lessonId, slide)).filter((file): file is LessonFile => file !== null);
}

function fileFromNode(node: HTMLElement, lessonId: number, slide?: LessonSlide): LessonFile | null {
  const url = node.getAttribute("url")?.trim() ?? "";
  if (!url) return null;
  const filename = node.getAttribute("filename")?.trim() || node.getAttribute("name")?.trim() || filenameFromUrl(url) || "download";
  return { filename, lessonId, ...(slide ? { slideId: slide.id } : {}), source: "content", url };
}

function suggestedSlideFilename(slide: LessonSlide): string {
  const base = slide.title.trim() || `slide-${slide.id}`;
  const extension = slide.type.toLowerCase() === "pdf" ? ".pdf" : "";
  return extension && !base.toLowerCase().endsWith(extension) ? `${base}${extension}` : base;
}

function filenameFromUrl(value: string): string {
  try { return decodeURIComponent(new URL(value).pathname.split("/").filter(Boolean).at(-1) ?? ""); }
  catch { return ""; }
}
