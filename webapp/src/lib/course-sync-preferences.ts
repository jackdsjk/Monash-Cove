export interface MoodleCoursePreferences {
  activeSemester: string | null;
  hiddenCourseIds: string[];
  pinnedCourseIds: string[];
}

type CourseIdentity = { id: number; shortname: string };

/** Course names may use S1_2026 or 2026_S1. Unknown terms remain in scope. */
export function courseSemester(shortname: string): string | null {
  const match = /(?:^|[^A-Z0-9])(?:(S[12]|T[123]|SUMMER)[\s_.-]+(\d{4})|(\d{4})[\s_.-]+(S[12]|T[123]|SUMMER))(?=$|[^A-Z0-9])/
    .exec(shortname.toUpperCase());
  if (!match) return null;
  return match[1] ? `${match[2]}-${match[1]}` : `${match[3]}-${match[4]}`;
}

export function courseInSyncScope(course: CourseIdentity, preferences: MoodleCoursePreferences): boolean {
  const id = String(course.id);
  if (preferences.hiddenCourseIds.includes(id)) return false;
  if (preferences.pinnedCourseIds.includes(id)) return true;
  const semester = courseSemester(course.shortname);
  return !preferences.activeSemester || semester === null || semester === preferences.activeSemester;
}

export function availableSemesters(courses: CourseIdentity[], selected: string | null): string[] {
  const values = courses.map((course) => courseSemester(course.shortname)).filter((value): value is string => value !== null);
  if (selected) values.push(selected);
  return [...new Set(values)].sort().reverse();
}
