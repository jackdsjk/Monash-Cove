import { describe, expect, it } from 'vitest';
import { parseMoodleGradeDetail, parseMoodleGradeOverview } from '../vendor/muster/grade-details.js';

const row = (label: string, value: string) => `<tr><th>${label}</th><td>${value}</td></tr>`;
const assignment = (status: string, feedback = '') => `<div class="submissionstatustable"><table>${status}</table></div><div class="feedback"><table>${feedback}</table></div>`;

describe('Muster assignment detail adaptation', () => {
  it('retains an explicit graded state when the score is hidden', () => {
    expect(parseMoodleGradeDetail(assignment(row('Grading status', 'Graded'), row('Grade', '-')), 'assign')).toEqual({
      gradingState: 'graded', gradeText: null, feedback: null, gradedAt: null,
    });
  });

  it.each(['0.50 / 1.00', '76.00 (D)', '76.00', 'HD', 'Pass', '0'])('preserves the displayed grade %s', (gradeText) => {
    expect(parseMoodleGradeDetail(assignment('', row('Grade', gradeText)), 'assign')).toMatchObject({ gradingState: 'graded', gradeText });
  });

  it('distinguishes submitted work from ungraded scores', () => {
    expect(parseMoodleGradeDetail(assignment(row('Submission status', 'Submitted for grading') + row('Grading status', 'Not graded')), 'assign'))
      .toMatchObject({ gradingState: 'submitted', gradeText: null });
  });

  it.each(['Nothing has been submitted for this assignment', 'No submissions have been made', 'Not submitted', 'Draft'])('checks negative evidence first: %s', (status) => {
    expect(parseMoodleGradeDetail(assignment(row('Submission status', status)), 'assign').gradingState).toBe('pending');
  });

  it('supports explicit status classes and removes escaped feedback markup', () => {
    const html = '<div class="submissionstatustable"><table><tr><td class="submissiongraded">Marked</td></tr></table></div>'
      + `<div class="feedback"><table>${row('Feedback comments', 'Good &amp; clear. &lt;a href=&quot;/feedback&quot;&gt;View feedback&lt;/a&gt;')}${row('Graded on', 'Tuesday, 10 November 2026')}</table></div>`;
    expect(parseMoodleGradeDetail(html, 'assign')).toEqual({ gradingState: 'graded', gradeText: null, feedback: 'Good & clear. View feedback', gradedAt: 'Tuesday, 10 November 2026' });
  });

  it('does not turn rubric points, dates or unrelated page text into grades', () => {
    const html = '<nav>Grade 90 / 100</nav><div class="rubric">Grade 10 / 20. Available 30/08/26</div>'
      + assignment(row('Grading status', 'Not graded'), row('Grade', 'Not yet graded'));
    expect(parseMoodleGradeDetail(html, 'assign')).toMatchObject({ gradingState: 'unknown', gradeText: null });
  });
});

describe('Muster quiz detail adaptation', () => {
  it.each(['13.00 / 15.00', '13.00 out of 15.00', '0 / 15.00'])('retains numerator and denominator: %s', (score) => {
    expect(parseMoodleGradeDetail(`<main id="region-main"><div class="quizgrade">Final grade: ${score}</div></main>`, 'quiz'))
      .toMatchObject({ gradingState: 'graded', gradeText: score === '0 / 15.00' ? score : '13.00 / 15.00' });
  });

  it('uses quiz attempt completion without fabricating a score', () => {
    expect(parseMoodleGradeDetail('<div class="quizattemptsummary">Status: Finished</div>', 'quiz')).toMatchObject({ gradingState: 'submitted', gradeText: null });
  });

  it.each(['Your attempts: Status in progress', 'Previous attempts: Never submitted', 'No attempts'])('keeps incomplete attempts pending: %s', (status) => {
    expect(parseMoodleGradeDetail(`<div class="quizattemptsummary">${status}</div>`, 'quiz')).toMatchObject({ gradingState: 'pending', gradeText: null });
  });

  it('ignores date-shaped scores and navigation outside activity content', () => {
    expect(parseMoodleGradeDetail('<nav>Grade 90 / 100</nav><main id="region-main"><div class="quizinfo">Grade available 30/08/26</div></main>', 'quiz'))
      .toMatchObject({ gradingState: 'unknown', gradeText: null });
  });

  it('accepts an explicit scale grade row', () => {
    expect(parseMoodleGradeDetail(`<table class="quizreviewsummary">${row('Grade', 'Pass')}</table>`, 'quiz')).toMatchObject({ gradingState: 'graded', gradeText: 'Pass' });
  });

  it('keeps final-grade submission evidence when marks are hidden', () => {
    expect(parseMoodleGradeDetail('<div class="quizgrade">Final grade: -</div>', 'quiz')).toMatchObject({ gradingState: 'submitted', gradeText: null });
  });

  it('ignores rubric scores even inside the main activity region', () => {
    expect(parseMoodleGradeDetail('<main id="region-main"><div class="rubric">Grade: 10 / 20</div></main>', 'quiz'))
      .toMatchObject({ gradingState: 'unknown', gradeText: null });
  });
});

describe('Muster official grade overview adaptation', () => {
  const course = (id: string, grade: string, href = `/course/user.php?mode=grade&amp;id=${id}&amp;user=999`) => `<tr><td><a href="${href}">Example course</a></td><td>${grade}</td></tr>`;

  it('keeps official numeric, percentage and letter text without assuming a maximum', () => {
    const html = `<table><tr><th>Course</th><th>Grade</th></tr>${course('123', '76')}${course('124', '82.5 %')}${course('125', 'HD')}</table>`;
    expect(parseMoodleGradeOverview(html, 'https://moodle.example/grade/report/overview/index.php')).toEqual([
      { courseId: '123', gradeText: '76' }, { courseId: '124', gradeText: '82.5 %' }, { courseId: '125', gradeText: 'HD' },
    ]);
  });

  it('excludes empty grades, foreign origins and links without a course id', () => {
    const html = `<table>${course('123', '-')}${course('124', 'Not graded')}${course('125', '—')}${course('126', '')}`
      + `${course('127', '99', 'https://outside.example/course/user.php?mode=grade&id=127')}${course('', '99', '/course/user.php?mode=grade&user=999')}</table>`;
    expect(parseMoodleGradeOverview(html, 'https://moodle.example')).toEqual([]);
  });

  it('uses course id rather than user id and deduplicates valid rows', () => {
    const html = `<table>${course('123', '-')}${course('123', '0')}${course('123', '77')}${course('321', 'D', '/user/profile.php?id=321')}</table>`;
    expect(parseMoodleGradeOverview(html, 'https://moodle.example')).toEqual([{ courseId: '123', gradeText: '0' }]);
  });
});
