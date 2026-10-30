import type { MoodleCourse } from "../types";

export type CampusRegion = "malaysia" | "australia" | "indonesia";
export type CourseRegion = CampusRegion | "shared";

export const REGION_OPTIONS: Array<{ value: CampusRegion; label: string }> = [
  { value: "malaysia", label: "马来西亚" },
  { value: "australia", label: "澳大利亚" },
  { value: "indonesia", label: "印度尼西亚" },
];

export const REGION_LABELS: Record<CampusRegion, string> = {
  malaysia: "马来西亚",
  australia: "澳大利亚",
  indonesia: "印度尼西亚",
};

const STORAGE_KEY = "cove-campus-region";

export function loadRegion(): CampusRegion | null {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "malaysia" || value === "australia" || value === "indonesia" ? value : null;
}

export function saveRegion(region: CampusRegion) {
  window.localStorage.setItem(STORAGE_KEY, region);
}

export function inferTextRegion(text: string): CourseRegion {
  const value = text.toLowerCase();
  if (/\bindonesia\b|indonesia campus/.test(value)) return "indonesia";
  if (/\bmalaysia\b|\bmum\b/.test(value)) return "malaysia";
  if (/australia|clayton|caulfield|peninsula/.test(value)) return "australia";
  return "shared";
}

export function textMatchesRegion(text: string, region: CampusRegion) {
  const value = inferTextRegion(text);
  return value === "shared" || value === region;
}

export function inferCourseRegion(course: MoodleCourse): CourseRegion {
  const name = `${course.shortname} ${course.fullname}`.toLowerCase();
  if (/\bmum\b|malaysia/.test(name)) return "malaysia";
  if (/indonesia|\bid\b/.test(name)) return "indonesia";
  if (/australia|clayton|caulfield|peninsula/.test(name)) return "australia";
  return "shared";
}

export function courseMatchesRegion(course: MoodleCourse, region: CampusRegion) {
  const campus = inferCourseRegion(course);
  return campus === "shared" || campus === region;
}

export function defaultRegionForCourses(courses: MoodleCourse[]): CampusRegion {
  if (courses.some((course) => inferCourseRegion(course) === "malaysia")) return "malaysia";
  if (courses.some((course) => inferCourseRegion(course) === "indonesia")) return "indonesia";
  return "australia";
}
