/**
 * Port of Muster scraper.rs::apply_gradebook / cmid_from_url matching.
 * Copyright 2026 Poetrynan. PolyForm Noncommercial 1.0.0; see LICENSE/NOTICE.
 * Local safeguards: scope by course in the caller; reject conflicting activity
 * IDs, foreign hosts and ambiguous names instead of guessing an association.
 */
export interface AssessmentIdentity {
  name: string;
  url: string | null;
}

/** Port of scraper.rs::is_portal_course_name at the pinned Muster revision. */
export function isPortalCourseName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("portal") || lower.includes("student hub") ||
    lower.includes("academic success") || lower.includes("graduate success") || lower.includes("school of it");
}

function activityId(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://moodle.example.invalid");
    const id = url.searchParams.get("id");
    return /^\/mod\/[^/]+\/view\.php$/.test(url.pathname) && id && /^\d+$/.test(id) ? id : null;
  } catch { return null; }
}

function normalizedName(value: string): string {
  return value.replace(/\(\s*\d+(?:\.\d+)?\s*%\s*\)/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The caller supplies only the current course's activities and grade items. */
export function matchGradebookItem<T extends AssessmentIdentity>(
  activity: AssessmentIdentity, gradebook: readonly T[], activities: readonly AssessmentIdentity[], baseUrl: string,
): T | null {
  const sameHost = (item: AssessmentIdentity): boolean => {
    if (!item.url) return true;
    try { return new URL(item.url, baseUrl).origin === new URL(baseUrl).origin; } catch { return false; }
  };
  if (!sameHost(activity)) return null;
  const candidates = gradebook.filter(sameHost);
  const id = activityId(activity.url);
  if (id) {
    const exact = candidates.filter((entry) => activityId(entry.url) === id);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
  }
  const name = normalizedName(activity.name);
  if (!name || activities.filter((entry) => normalizedName(entry.name) === name).length !== 1) return null;
  const byName = candidates.filter((entry) => normalizedName(entry.name) === name &&
    // An explicit different cmid cannot be repaired by a coincidental title.
    (!id || !activityId(entry.url)));
  return byName.length === 1 ? byName[0] : null;
}
