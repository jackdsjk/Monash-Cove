import type { CoveDatabase } from "../db.js";
import type { MoodleContentRow } from "../domain.js";
import { MoodleClient } from "../sources/moodle.js";
import { MoodleContentClient } from "../sources/moodle-content.js";

export interface MoodleContentSyncResult {
  courseId: string;
  courseName: string;
  sections: number;
  items: number;
}

export async function syncMoodleContent(
  db: CoveDatabase,
  baseUrl: string,
  session: string,
  courseId: number,
  fetcher?: typeof fetch,
): Promise<MoodleContentSyncResult> {
  const moodle = new MoodleClient(baseUrl, session, fetcher ?? fetch);
  const courses = await moodle.listCourses();
  const course = courses.find((entry) => entry.id === courseId);
  if (!course) throw new Error(`Moodle course ${courseId} was not found.`);
  const scraper = new MoodleContentClient(baseUrl, session, fetcher ?? fetch);
  const rows: MoodleContentRow[] = await scraper.scrapeCourse(courseId, course.shortname || course.fullname);
  db.replaceMoodleContent(String(courseId), rows);
  const sections = new Set(rows.map((row) => row.sectionNumber)).size;
  return { courseId: String(courseId), courseName: course.shortname || course.fullname, sections, items: rows.length };
}

export async function syncAllMoodleContent(
  db: CoveDatabase,
  baseUrl: string,
  session: string,
  fetcher?: typeof fetch,
  onProgress?: (processed: number, total: number | null) => void,
): Promise<{ courses: number; items: number }> {
  const moodle = new MoodleClient(baseUrl, session, fetcher ?? fetch);
  const courses = await moodle.listCourses();
  const scraper = new MoodleContentClient(baseUrl, session, fetcher ?? fetch);
  let items = 0;
  for (const [index, course] of courses.entries()) {
    const rows = await scraper.scrapeCourse(course.id, course.shortname || course.fullname);
    db.replaceMoodleContent(String(course.id), rows);
    items += rows.length;
    onProgress?.(index + 1, courses.length);
  }
  return { courses: courses.length, items };
}
