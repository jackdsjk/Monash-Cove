/**
 * TypeScript port of Muster scraper.rs::parse_assessments_from_html (856–1125),
 * discover_assessments_section_from_html and parse_weight_percent, revision
 * ad2372683e0fbc4efb148af8b81840ae8dee5f39. Copyright 2026 Poetrynan.
 * PolyForm Noncommercial 1.0.0; preserve LICENSE/NOTICE in this directory.
 * Only the assessment structure is read here; scores must come from Grades.
 */
import { parse } from "node-html-parser";

export interface AssessmentStructureRow {
  name: string;
  url: string | null;
  isCategory: boolean;
  category: string | null;
  categoryId: number | null;
  weight: number | null;
  categoryWeight: number | null;
  gradeItemId: string | null;
}

function text(value: string): string { return value.trim().replace(/\s+/g, " "); }

export function parseAssessmentWeight(value: string): number | null {
  const match = /weight(?:ing)?\s*:\s*([\d.]+)\s*%/i.exec(value) ??
    /\(([\d.]+)\s*%\)/.exec(value) ?? /^([\d.]+)\s*%$/.exec(value.trim());
  const weight = match ? Number(match[1]) : NaN;
  return Number.isFinite(weight) && weight >= 0 ? weight : null;
}

export function discoverAssessmentsSection(html: string, courseId: number, baseUrl: string): number | null {
  const sections = new Map<number, string>();
  for (const anchor of parse(html).querySelectorAll("a[href]")) {
    try {
      const url = new URL(anchor.getAttribute("href")!, baseUrl);
      if (url.origin !== new URL(baseUrl).origin || url.pathname !== "/course/view.php" || url.searchParams.get("id") !== String(courseId)) continue;
      const section = url.searchParams.get("section");
      if (!section || !/^\d+$/.test(section)) continue;
      const number = Number(section);
      if (!sections.has(number)) sections.set(number, text(anchor.getAttribute("title") || anchor.text));
    } catch { /* Navigation noise is not a section. */ }
  }
  return [...sections].sort(([a], [b]) => a - b).find(([, title]) => /assess/i.test(title))?.[0] ?? null;
}

export function parseAssessmentStructure(html: string, baseUrl: string): AssessmentStructureRow[] {
  const root = parse(html);
  const rows: AssessmentStructureRow[] = [];
  const seen = new Set<string>();
  const activity = (href: string): { url: string; id: string } | null => {
    try {
      const url = new URL(href, baseUrl);
      const id = url.searchParams.get("id");
      if (url.origin !== new URL(baseUrl).origin || !/^\/mod\/[^/]+\/view\.php$/.test(url.pathname) || !id || !/^\d+$/.test(id)) return null;
      return { url: url.href, id };
    } catch { return null; }
  };

  // Type A: authoritative category headers and their separately linked children.
  for (const header of root.querySelectorAll(".assessment-item.summary-view-dropdown-header")) {
    const label = header.querySelector(".dropdown-name-text");
    const name = text(label?.text ?? "");
    if (!name) continue;
    const section = label?.getAttribute("data-section");
    const categoryId = section && /^\d+$/.test(section) ? Number(section) : null;
    const key = categoryId === null ? null : `category:${categoryId}`;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const category = name.replace(/^[\d.\s]+/, "").trim() || null;
    const weight = parseAssessmentWeight(header.querySelector(".weight-content")?.text ?? "");
    rows.push({ name, url: null, isCategory: true, category, categoryId, weight, categoryWeight: weight, gradeItemId: null });
    if (categoryId === null) continue;
    const list = root.querySelector(`#assessment-section-activity-list-${categoryId}`);
    for (const child of list?.querySelectorAll(".assessment-item") ?? []) {
      const link = child.querySelector("a.name-content-text[href]");
      const childName = text(link?.text ?? "");
      const target = link ? activity(link.getAttribute("href")!) : null;
      // Unlinked alternatives belong to other cohorts, just as in Muster.
      if (!childName || !target || seen.has(`activity:${target.id}`)) continue;
      seen.add(`activity:${target.id}`);
      rows.push({ name: childName, url: target.url, isCategory: false, category, categoryId, weight, categoryWeight: weight, gradeItemId: null });
    }
  }
  if (rows.length) return rows;

  // Type B: standard Moodle activities, only explicit item weights.
  let category: string | null = null;
  for (const element of root.querySelectorAll("h1, h2, li.activity")) {
    if (element.tagName === "H1" || element.tagName === "H2") {
      category = text(element.text).replace(/^[\d.\s]+/, "") || null;
      continue;
    }
    if (!/(?:^|\s)modtype_(?:assign|quiz)(?:\s|$)/.test(element.getAttribute("class") ?? "")) continue;
    const link = element.querySelector("a[href*='/mod/assign/view.php'], a[href*='/mod/quiz/view.php']");
    const target = link ? activity(link.getAttribute("href")!) : null;
    const name = text(element.querySelector(".displayname")?.text ?? element.querySelector(".instancename")?.text ?? element.getAttribute("data-activityname") ?? link?.text ?? "");
    if (!target || !name || seen.has(`activity:${target.id}`)) continue;
    seen.add(`activity:${target.id}`);
    rows.push({ name, url: target.url, isCategory: false, category, categoryId: null,
      weight: parseAssessmentWeight(element.text) ?? parseAssessmentWeight(name), categoryWeight: null, gradeItemId: null });
  }
  return rows;
}
