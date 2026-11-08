import assert from "node:assert/strict";
import { predict, renderBadCases, renderMarkdown, runEvaluation } from "./replay-triage.mjs";

const { report, samples, labels } = runEvaluation();

assert.equal(samples.length, 55);
assert.equal(labels.length, 55);
assert.equal(report.sample_count, 55);
assert.equal(report.duplicate_evaluation, "deferred");
assert.equal(report.evidence_support_rate, 1);
assert.equal(report.field_accuracy.authority, 1);
assert.deepEqual(
  samples.reduce((counts, sample) => ({ ...counts, [sample.source]: (counts[sample.source] ?? 0) + 1 }), {}),
  { gmail: 25, ed: 25, moodle: 5 },
);
assert.ok(report.importance_recall >= 0);
assert.ok(report.importance_recall <= 1);

// 分歧必须完整输出，不能截断到前 20 条
assert.ok(report.disagreement_count > 20);
assert.equal(report.disagreements.length, report.disagreement_count);
assert.equal(
  Object.values(report.failure_taxonomy.by_mode).reduce((total, entry) => total + entry.count, 0),
  report.disagreement_count,
);
assert.equal(
  Object.values(report.failure_taxonomy.by_severity).reduce((total, count) => total + count, 0),
  report.disagreement_count,
);
for (const item of report.disagreements) {
  assert.ok(item.differing_fields.length > 0, `${item.sample_id} 必须至少有一个差异字段`);
  assert.ok(item.differing_fields.every((field) => ["content_type", "importance", "action_required", "open_original"].includes(field)));
  assert.ok(["high", "medium", "low"].includes(item.severity));
  assert.ok(item.severity === report.failure_taxonomy.by_mode[item.failure_mode].severity);
}

const badCases = renderBadCases(report);
assert.equal(badCases.match(/^### /gm).length, report.disagreement_count);
for (const item of report.disagreements) assert.ok(badCases.includes(item.sample_id), `Bad Case 缺少 ${item.sample_id}`);

const markdown = renderMarkdown(report);
assert.ok(markdown.includes("失效模式"));
assert.ok(markdown.includes("指标口径"));
assert.equal(markdown.match(/^- \[[高中低]\] /gm).length, report.disagreement_count);

const sampleById = new Map(samples.map((sample) => [sample.sample_id, sample]));
assert.equal(predict(sampleById.get("gmail-001")).content_type, "requirement_change");
assert.equal(predict(sampleById.get("moodle-003")).content_type, "requirement_change");
assert.equal(predict(sampleById.get("ed-007")).action_required, "uncertain");

// 否定句里的 deadline / requirement 不应触发要求变更或行动要求
assert.equal(predict(sampleById.get("ed-003")).content_type, "learning_material");
assert.equal(predict(sampleById.get("ed-003")).action_required, "no");
assert.equal(predict(sampleById.get("ed-012")).importance, "reference");
assert.equal(predict(sampleById.get("gmail-014")).importance, "skip");
assert.equal(predict(sampleById.get("gmail-014")).action_required, "no");

// 财政/行政变更按 administrative 处理，重复通知降级
assert.equal(predict(sampleById.get("gmail-020")).content_type, "administrative");
assert.equal(predict(sampleById.get("gmail-020")).importance, "important");

// Moodle 的 closing time 按 important 处理，提交截止仍是 critical
assert.equal(predict(sampleById.get("moodle-005")).importance, "important");
assert.equal(predict(sampleById.get("moodle-001")).importance, "critical");

// 教师答复和考试通知中的行动要求要能识别
assert.equal(predict(sampleById.get("ed-008")).action_required, "yes");
assert.equal(predict(sampleById.get("gmail-012")).action_required, "yes");
assert.equal(predict(sampleById.get("gmail-022")).action_required, "yes");

console.log("replay-triage tests passed");
