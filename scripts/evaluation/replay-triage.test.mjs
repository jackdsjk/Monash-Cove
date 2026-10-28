import assert from "node:assert/strict";
import { predict, runEvaluation } from "./replay-triage.mjs";

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
assert.ok(report.disagreements.length <= 20);

const sampleById = new Map(samples.map((sample) => [sample.sample_id, sample]));
assert.equal(predict(sampleById.get("gmail-001")).content_type, "requirement_change");
assert.equal(predict(sampleById.get("moodle-003")).content_type, "requirement_change");
assert.equal(predict(sampleById.get("ed-007")).action_required, "uncertain");

console.log("replay-triage tests passed");
