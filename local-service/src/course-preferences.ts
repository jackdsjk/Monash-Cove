import { z } from "zod";
import type { CoveDatabase } from "./db.js";

const courseIdsSchema = z.array(z.string().trim().min(1).max(32).regex(/^\d+$/)).max(500)
  .transform((ids) => [...new Set(ids)]);

export const coursePreferencesSchema = z.object({
  activeSemester: z.string().regex(/^\d{4}-(?:S[12]|T[123]|SUMMER)$/).nullable().default(null),
  hiddenCourseIds: courseIdsSchema.default([]),
  pinnedCourseIds: courseIdsSchema.default([]),
}).strict();

export type CoursePreferences = z.infer<typeof coursePreferencesSchema>;

/** Use explicit semester tokens only; unknown or annual course names stay visible. */
export function courseSemester(shortname: string): string | null {
  const match = /(?:^|[^A-Z0-9])(?:(S[12]|T[123]|SUMMER)[\s_.-]+(\d{4})|(\d{4})[\s_.-]+(S[12]|T[123]|SUMMER))(?=$|[^A-Z0-9])/
    .exec(shortname.toUpperCase());
  if (!match) return null;
  return match[1] ? `${match[2]}-${match[1]}` : `${match[3]}-${match[4]}`;
}

export function selectMoodleCourses<T extends { id: number; shortname: string; fullname?: string }>(
  courses: T[],
  preferences: CoursePreferences,
): T[] {
  const hidden = new Set(preferences.hiddenCourseIds);
  const pinned = new Set(preferences.pinnedCourseIds);
  return courses.filter((course) => {
    const id = String(course.id);
    if (hidden.has(id)) return false;
    if (!preferences.activeSemester || pinned.has(id)) return true;
    const semester = courseSemester(course.shortname);
    return semester === null || semester === preferences.activeSemester;
  });
}

/** Settings are scoped to the credential identity, never to a guessed course code. */
export function getMoodleCoursePreferences(db: CoveDatabase, identity: string): CoursePreferences {
  const raw = db.getSetting(`moodle_course_preferences:${identity}`);
  if (raw) {
    try {
      const parsed = coursePreferencesSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // A malformed local setting must not hide every course or block synchronization.
    }
  }
  return coursePreferencesSchema.parse({});
}

export function saveMoodleCoursePreferences(db: CoveDatabase, identity: string, preferences: CoursePreferences): void {
  const parsed = coursePreferencesSchema.parse(preferences);
  db.setSetting(`moodle_course_preferences:${identity}`, JSON.stringify(parsed));
}
