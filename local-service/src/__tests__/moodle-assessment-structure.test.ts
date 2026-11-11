import { describe, expect, it } from "vitest";
import { discoverAssessmentsSection, parseAssessmentStructure, parseAssessmentWeight } from "../vendor/muster/assessment-structure.js";

const base = "https://moodle.example.invalid";
const widget = `<div class="assessment-item summary-view-dropdown-header">
  <span class="dropdown-name-text" data-section="57">1. Quiz / Test</span><span class="weight-content">9%</span></div>
  <div id="assessment-section-activity-list-57">
  <div class="assessment-item"><a class="name-content-text" href="/mod/quiz/view.php?id=11">Quiz 1</a></div>
  <div class="assessment-item"><a class="name-content-text" href="/mod/quiz/view.php?id=12">Quiz 2</a></div>
  <div class="assessment-item"><span class="name-column">Quiz 2 - Alternative campus</span></div>
  <div class="assessment-item"><a class="name-content-text" href="https://foreign.invalid/mod/quiz/view.php?id=13">External</a></div></div>
  <div class="assessment-item summary-view-dropdown-header">
  <span class="dropdown-name-text" data-section="58">2. Artefact</span><span class="weight-content">31%</span></div>
  <div id="assessment-section-activity-list-58"><div class="assessment-item"><a class="name-content-text" href="/mod/assign/view.php?id=21">Essay</a></div></div>
  <div class="assessment-item summary-view-dropdown-header">
  <span class="dropdown-name-text" data-section="59">3. Artefact</span><span class="weight-content">60%</span></div>`;

describe("Muster assessment structure port", () => {
  it("preserves category weights and IDs, linked children and an unpublished category", () => {
    const rows = parseAssessmentStructure(widget, base);
    expect(rows.filter((row) => row.isCategory).map((row) => [row.categoryId, row.category, row.weight])).toEqual([
      [57, "Quiz / Test", 9], [58, "Artefact", 31], [59, "Artefact", 60],
    ]);
    expect(rows.filter((row) => !row.isCategory).map((row) => [row.name, row.categoryId, row.categoryWeight])).toEqual([
      ["Quiz 1", 57, 9], ["Quiz 2", 57, 9], ["Essay", 58, 31],
    ]);
    expect(rows.every((row) => row.gradeItemId === null)).toBe(true);
  });

  it("discovers the named section rather than assuming section 56", () => {
    expect(discoverAssessmentsSection(`<a href="/course/view.php?id=1&amp;section=9" title="Assessments">Open</a>
      <a href="/course/view.php?id=2&amp;section=4" title="Assessments">Other course</a>`, 1, base)).toBe(9);
  });

  it.each([["", 60], ["35%", 35], ["0%", 0]])("uses title weights only when the category cell omits one: %s", (cell, expected) => {
    const rows = parseAssessmentStructure(`<div class="assessment-item summary-view-dropdown-header">
      <span class="dropdown-name-text" data-section="9">Exam (60%)</span><span class="weight-content">${cell}</span></div>
      <div id="assessment-section-activity-list-9"><div class="assessment-item"><a class="name-content-text" href="/mod/quiz/view.php?id=7">Exam</a></div></div>`, base);
    expect(rows.map((row) => [row.weight, row.categoryWeight])).toEqual([[expected, expected], [expected, expected]]);
  });

  it("falls back to standard activities with explicit item weights, retaining zero", () => {
    const rows = parseAssessmentStructure(`<h2>Written</h2>
      <li class="activity modtype_assign"><a href="/mod/assign/view.php?id=1"><span class="instancename">Essay (Weight: 35%)</span></a></li>
      <li class="activity modtype_quiz"><a href="/mod/quiz/view.php?id=2"><span class="instancename">Practice (0%)</span></a></li>
      <li class="activity modtype_resource"><a href="/mod/resource/view.php?id=3">Notes (65%)</a></li>`, base);
    expect(rows.map((row) => [row.category, row.weight, row.isCategory])).toEqual([["Written", 35, false], ["Written", 0, false]]);
  });

  it.each([["Weighting: 9%", 9], ["Essay (35%)", 35], ["9%", 9], ["score 90% in week 2", null], ["", null]])(
    "uses Muster's explicit percentage patterns: %s", (value, weight) => {
      expect(parseAssessmentWeight(String(value))).toBe(weight);
    },
  );
});

