import assert from "node:assert/strict";
import { demoData } from "../data/items.js";
import {
  SECTION_META,
  escapeHtml,
  filterItems,
  formatAge,
  formatSince,
  groupBySection,
  highlightQuote,
  sectionFor,
  summarize,
} from "../js/core.js";

const items = demoData.items;
assert.equal(items.length, 55, "demo must load all 55 samples");
assert.equal(new Set(items.map((item) => item.id)).size, 55, "sample ids must be unique");

for (const item of items) {
  for (const field of ["id", "source", "title", "text", "evidenceQuote", "importance", "contentType", "actionRequired", "openOriginal"]) {
    assert.ok(item[field], `${item.id} missing ${field}`);
  }
  assert.ok(item.text.includes(item.evidenceQuote), `${item.id} quote is not a substring`);
  assert.ok(Number.isFinite(item.ageHours) && item.ageHours >= 0, `${item.id} has invalid age`);
  assert.ok(["gmail", "ed", "moodle"].includes(item.source), `${item.id} has unknown source`);
}

const summary = summarize(items);
assert.equal(summary.total, 55);
assert.equal(summary.action + summary.staff + summary.important + summary.material + summary.folded, 55);
assert.equal(Object.values(summary.sources).reduce((total, count) => total + count, 0), 55);
assert.deepEqual(summary.sources, { gmail: 25, ed: 25, moodle: 5 });

const sections = groupBySection(items);
assert.equal(sections.reduce((total, section) => total + section.items.length, 0), 55);
assert.deepEqual(sections.map((section) => section.id), SECTION_META.map((section) => section.id).filter((id) => sections.some((section) => section.id === id)));

const item = (patch = {}) => ({ importance: "important", contentType: "staff_announcement", actionRequired: "no", ...patch });
assert.equal(sectionFor(item({ importance: "critical" })), "action");
assert.equal(sectionFor(item({ actionRequired: "yes" })), "action");
assert.equal(sectionFor(item({ contentType: "staff_answer" })), "staff");
assert.equal(sectionFor(item()), "important");
assert.equal(sectionFor(item({ importance: "reference", contentType: "learning_material" })), "material");
assert.equal(sectionFor(item({ importance: "skip" })), "folded");
assert.equal(sectionFor(item(), { pinned: true }), "action");
assert.equal(sectionFor(item({ importance: "critical" }), { dismissed: true }), "folded");

assert.equal(filterItems(items, { sinceHours: 24 }).length, 14);
assert.equal(filterItems(items, { source: "gmail" }).length, 25);
assert.ok(filterItems(items, { query: "FIT1047" }).every((candidate) => candidate.course === "FIT1047" || candidate.text.includes("FIT1047")));
assert.ok(filterItems(items, { onlyAction: true }).every((candidate) => candidate.actionRequired === "yes" || candidate.importance === "critical"));

assert.equal(formatAge(0.5), "30 分钟前");
assert.equal(formatAge(3.2), "3 小时前");
assert.equal(formatAge(30), "昨天");
assert.equal(formatAge(80), "3 天前");
assert.equal(formatSince(24), "24 小时");
assert.equal(formatSince(72), "3 天");

assert.equal(highlightQuote("a < b and c", "b and c"), "a &lt; <mark>b and c</mark>");
assert.equal(highlightQuote("no match", "missing"), "no match");
assert.equal(escapeHtml("<script>"), "&lt;script&gt;");

console.log("demo core tests passed");
