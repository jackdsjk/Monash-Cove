// Adapted from Muster v0.5.1, commit ad2372683e0fbc4efb148af8b81840ae8dee5f39:
// scraper.rs::parse_submission_status_from_html, parse_quiz_grade_from_html,
// parse_quiz_submission_from_html and parse_grade_overview.
// Copyright 2026 Poetrynan. PolyForm Noncommercial 1.0.0; see LICENSE and NOTICE.
import { parse, type HTMLElement } from 'node-html-parser';

export interface MoodleGradeDetail {
  gradingState: 'graded' | 'submitted' | 'pending' | 'unknown';
  gradeText: string | null;
  feedback: string | null;
  gradedAt: string | null;
}

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const isPlaceholder = (value: string) => /^(?:[-–—]|not (?:yet )?(?:graded|marked)|no grade|ungraded|未评分)?$/i.test(value);
const noSubmission = (value: string) => /nothing has been submitted|no submissions?(?: have been made)?|no attempts?|never submitted|not submitted|\bdraft\b/i.test(value);

function rows(scope: HTMLElement): Array<{ label: string; cell: HTMLElement }> {
  return scope.querySelectorAll('tr').flatMap((row) => {
    const cells = row.querySelectorAll('th, td');
    if (cells.length < 2) return [];
    return [{ label: normalize(cells[0].textContent).replace(/:$/, '').toLowerCase(), cell: cells[cells.length - 1] }];
  });
}

function cleanedText(cell: HTMLElement): string | null {
  // textContent decodes entities once. Parse the resulting escaped feedback markup
  // again, as upstream does, so plugin buttons never become visible HTML text.
  const text = normalize(parse(cell.textContent).textContent);
  return text && !isPlaceholder(text) ? text : null;
}

function ratio(value: string): string | null {
  for (const match of value.matchAll(/(?:final grade|grade)\b.{0,120}?(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)/gi)) {
    // Moodle availability dates such as 30/08/26 are not scores.
    if (/^\s*\/\s*\d/.test(value.slice(match.index! + match[0].length))) continue;
    return `${match[1]} / ${match[2]}`;
  }
  return null;
}

function assignmentDetail(root: HTMLElement): MoodleGradeDetail {
  const scopes = root.querySelectorAll('div.submissionstatustable, div.submissionsummarytable, div.feedback');
  let submitted: boolean | null = null;
  let graded = false;
  let gradeText: string | null = null;
  let feedback: string | null = null;
  let gradedAt: string | null = null;
  for (const scope of scopes) {
    for (const { label, cell } of rows(scope)) {
      const value = normalize(cell.textContent);
      if (label === 'submission status') {
        if (noSubmission(value) || cell.classList.contains('submissionstatusdraft')) submitted = false;
        else if (/submitted/i.test(value) || cell.classList.contains('submissionstatussubmitted')) submitted = true;
      } else if (label === 'grading status') {
        if (/\b(?:graded|marked)\b/i.test(value) && !/not (?:yet )?(?:graded|marked)/i.test(value)) graded = true;
      } else if (label === 'grade') {
        if (!isPlaceholder(value)) gradeText ??= value;
      } else if (label === 'feedback comments') {
        feedback ??= cleanedText(cell);
      } else if (/^(?:graded on|grading date|marked on|评分时间)$/.test(label)) {
        gradedAt ??= cleanedText(cell);
      }
    }
    if (scope.querySelector('td.submissiongraded')) graded = true;
    if (submitted === null) {
      if (scope.querySelector('.submissionstatusdraft')) submitted = false;
      else if (scope.querySelector('.submissionstatussubmitted')) submitted = true;
    }
  }
  return {
    gradingState: gradeText || graded ? 'graded' : submitted === true ? 'submitted' : submitted === false ? 'pending' : 'unknown',
    gradeText, feedback, gradedAt,
  };
}

function quizDetail(root: HTMLElement): MoodleGradeDetail {
  // Limit inspection to activity content; a sidebar's grades/attempt links are not evidence.
  const main = root.querySelector('#region-main') ?? root.querySelector('[role="main"]') ?? root;
  for (const unrelated of main.querySelectorAll('nav, aside, script, style, .rubric, .gradingform_rubric')) unrelated.remove();
  const scopes = main.querySelectorAll('.quizinfo, .quizgrade, .quizattemptsummary, .quizreviewsummary, .quizattempt, .quizsummary, .generalbox');
  const candidates = scopes.length ? scopes : [main];
  let gradeText: string | null = null;
  let submitted = false;
  let pending = false;
  let graded = false;
  for (const scope of candidates) {
    const value = normalize(scope.textContent);
    gradeText ??= ratio(value);
    for (const { label, cell } of rows(scope)) {
      const text = normalize(cell.textContent);
      if (/^(?:final grade|grade)$/.test(label) && !isPlaceholder(text)) {
        // Preserve scale/letter displays while requiring an explicit grade row.
        gradeText ??= text;
      }
      if (/^(?:state|status)$/.test(label)) {
        if (/\bfinished\b/i.test(text)) submitted = true;
        else if (/in progress/i.test(text) || noSubmission(text)) pending = true;
      }
    }
    if (/\b(?:status|state)\s*:?\s*finished\b/i.test(value)) submitted = true;
    const neverSubmitted = noSubmission(value);
    if (!neverSubmitted && /\bfinal grade\b/i.test(value)) {
      submitted = true;
      graded = Boolean(gradeText);
    }
    if (/in progress/i.test(value) || neverSubmitted) pending = true;
    if (!neverSubmitted && /previous attempts/i.test(value)) submitted = true;
    if (!neverSubmitted && !/in progress/i.test(value) && /your attempts/i.test(value)) submitted = true;
  }
  return { gradingState: gradeText || graded ? 'graded' : submitted ? 'submitted' : pending ? 'pending' : 'unknown', gradeText, feedback: null, gradedAt: null };
}

/** Enrich only items already admitted by the course's Grades table. */
export function parseMoodleGradeDetail(html: string, type: 'assign' | 'quiz'): MoodleGradeDetail {
  const root = parse(html);
  return type === 'assign' ? assignmentDetail(root) : quizDetail(root);
}

/** Preserve official overview text; never assume a bare numeric grade is out of 100. */
export function parseMoodleGradeOverview(html: string, baseUrl: string): Array<{ courseId: string; gradeText: string }> {
  const root = parse(html);
  const base = new URL(baseUrl);
  const results = new Map<string, string>();
  for (const row of root.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;
    for (const link of cells[0].querySelectorAll('a[href]')) {
      let url: URL;
      try { url = new URL(link.getAttribute('href')!.replace(/&amp;/g, '&'), base); } catch { continue; }
      if (url.origin !== base.origin || url.pathname !== '/course/user.php' || url.searchParams.get('mode') !== 'grade') continue;
      const courseId = url.searchParams.get('id');
      if (!courseId || !/^[1-9]\d*$/.test(courseId)) continue;
      const gradeText = normalize(cells[cells.length - 1].textContent);
      if (!isPlaceholder(gradeText) && !results.has(courseId)) results.set(courseId, gradeText);
    }
  }
  return [...results].map(([courseId, gradeText]) => ({ courseId, gradeText }));
}
