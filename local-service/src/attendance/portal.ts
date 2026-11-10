/**
 * Selector-independent matching rules shared by the attendance flows.
 *
 * `client.ts` (fill only) and `submit.ts` (fill + submit) must agree on what
 * "the same course" and "the same session" mean; keeping them here avoids the
 * two paths drifting apart and submitting a code to the wrong class.
 */

/** `FIT1047_S2_2026` → `FIT1047`; unknown shapes fall back to the first token. */
export function courseCode(course: string): string {
  return (/^[A-Z]{2,5}\d{3,4}/i.exec(course)?.[0] ?? course.split(/[_ -]/)[0]).toUpperCase();
}

/** `Workshop 01` → `workshop 1`; free-text names are lower-cased and trimmed. */
export function sessionKey(value: string): string {
  const match = /\b(workshop|applied|tutorial|pass)\s*0?(\d{1,2})\b/i.exec(value);
  return match ? `${match[1].toLowerCase()} ${Number(match[2])}` : value.trim().toLowerCase();
}

/** Collapse portal whitespace without losing paragraph breaks. */
export function normalizePortalText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
