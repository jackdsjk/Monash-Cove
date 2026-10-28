#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SAMPLE_FILE = path.join(ROOT, "docs/gold-set-samples-2026-10-28.json");
const LABEL_FILE = path.join(ROOT, "docs/gold-set-adjudication-2026-10-28.json");

const CATEGORIES = new Set([
  "required_action",
  "requirement_change",
  "staff_announcement",
  "staff_answer",
  "peer_question",
  "learning_material",
  "assessment_fact",
  "administrative",
  "promotion",
  "noise",
]);
const IMPORTANCE = new Set(["critical", "important", "reference", "skip"]);
const ACTION = new Set(["yes", "no", "uncertain"]);
const OPEN_ORIGINAL = new Set(["required", "optional", "no"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function evidenceFor(sample, category) {
  const parts = sentences(sample.text);
  const categoryPatterns = {
    requirement_change: /deadline|due|override|changed|updated|different room|replacement|extension|maximum|requirement/i,
    staff_answer: /staff (reply|response)|teacher|teaching team/i,
    peer_question: /asks|question|no (staff|official|teaching-team) answer|unresolved/i,
    assessment_fact: /deadline|closing time|assessment page|quiz page/i,
    administrative: /account|library|payment|appointment|exam timetable|security/i,
    promotion: /voluntary|survey|recruit|trip|election|gift-card/i,
    learning_material: /recording|slides|practice|reading|learning task|notes/i,
  };
  return parts.find((part) => categoryPatterns[category]?.test(part)) ?? parts[0] ?? sample.text;
}

function classifyContent(sample) {
  const text = sample.text;
  if (sample.source === "moodle") {
    return /override|changes the submission deadline/i.test(text)
      ? "requirement_change"
      : "assessment_fact";
  }
  const noAuthoritativeAnswer = /no (staff|official|teaching-team) (answer|reply|response)/i.test(text);
  if (!noAuthoritativeAnswer && /staff (reply|response)|a staff reply|a staff response/i.test(text)) return "staff_answer";
  if (sample.author_role === "student" && /asks|question|no (staff|official|teaching-team) answer|unresolved/i.test(text)) {
    return "peer_question";
  }
  if (hasAny(text, [/deadline|due date|override|requirements? (?:has )?(?:changed|updated|clarified)|updated specification/i, /different room|replacement link/i, /extension.*approved/i, /maximum duration/i])) {
    return "requirement_change";
  }
  if (hasAny(text, [/tuition|library|sign-in|account security|appointment|exam timetable/i])) return "administrative";
  if (hasAny(text, [/survey|recruit|day trip|election|gift-card/i])) return "promotion";
  if (hasAny(text, [/recording|slides|practice questions|supplementary material/i])) return "learning_material";
  if (sample.author_role === "staff") return "staff_announcement";
  return "noise";
}

function classifyImportance(sample, contentType) {
  const text = sample.text;
  if (contentType === "promotion") return "skip";
  if (hasAny(text, [/unfamiliar.*sign-in|security steps|pass the unit|last sitting/i])) return "critical";
  if (contentType === "assessment_fact" && /deadline|closing time/i.test(text)) return "critical";
  if (contentType === "requirement_change" && /deadline|due|override|must|different room|extension|maximum/i.test(text)) {
    return "critical";
  }
  if (contentType === "staff_answer" || contentType === "administrative") return "important";
  if (contentType === "peer_question" && /assignment|assessment|submission|deadline|hurdle|video/i.test(text)) {
    return "important";
  }
  return "reference";
}

function classifyAction(sample, contentType) {
  const text = sample.text;
  if (/optional|voluntary|not (a|the) course requirement|not.*graded|no completion action/i.test(text)) return "no";
  if (contentType === "peer_question" && /no (staff|official|teaching-team) answer|unresolved|uncertain/i.test(text)) {
    return "uncertain";
  }
  if (hasAny(text, [/must|should|need to|before|deadline|submit|register|reply|verify|use the new|pay/i])) return "yes";
  return "no";
}

export function predict(sample) {
  const contentType = classifyContent(sample);
  const importance = classifyImportance(sample, contentType);
  const actionRequired = classifyAction(sample, contentType);
  const evidenceQuote = evidenceFor(sample, contentType);
  return {
    sample_id: sample.sample_id,
    source: sample.source,
    course: sample.course,
    authority: contentType === "staff_answer" ? "staff" : sample.author_role,
    content_type: contentType,
    importance,
    action_required: actionRequired,
    open_original: importance === "critical" || actionRequired === "uncertain"
      ? "required"
      : importance === "skip"
        ? "no"
        : "optional",
    summary: `${sample.title}：${evidenceQuote}`,
    evidence_quote: evidenceQuote,
    duplicate_group: null,
  };
}

function validate(samples, labels) {
  if (!Array.isArray(samples) || samples.length !== 55) throw new Error("样本必须正好有 55 条");
  if (!Array.isArray(labels)) throw new Error("标签必须是数组");
  const sampleIds = new Set(samples.map((sample) => sample.sample_id));
  const labelIds = new Set(labels.map((label) => label.sample_id));
  if (sampleIds.size !== samples.length || labelIds.size !== labels.length) throw new Error("sample_id 不能重复");
  if (labels.length !== samples.length || [...sampleIds].some((id) => !labelIds.has(id))) {
    throw new Error("样本与标签的 sample_id 不完整匹配");
  }
  for (const label of labels) {
    if (!CATEGORIES.has(label.content_type)) throw new Error(`未知 content_type: ${label.sample_id}`);
    if (!IMPORTANCE.has(label.importance)) throw new Error(`未知 importance: ${label.sample_id}`);
    if (!ACTION.has(label.action_required)) throw new Error(`未知 action_required: ${label.sample_id}`);
    if (!OPEN_ORIGINAL.has(label.open_original)) throw new Error(`未知 open_original: ${label.sample_id}`);
  }
}

function accuracy(predictions, labels, field) {
  let correct = 0;
  for (const label of labels) if (predictions.get(label.sample_id)[field] === label[field]) correct += 1;
  return correct / labels.length;
}

function evaluate(samples, labels) {
  validate(samples, labels);
  const labelById = new Map(labels.map((label) => [label.sample_id, label]));
  const predictions = new Map(samples.map((sample) => [sample.sample_id, predict(sample)]));
  const highValue = (value) => value === "critical" || value === "important";
  const lowValue = (value) => value === "reference" || value === "skip";
  const goldHigh = labels.filter((label) => highValue(label.importance));
  const predictedHigh = samples.filter((sample) => highValue(predictions.get(sample.sample_id).importance));
  const goldLow = labels.filter((label) => lowValue(label.importance));
  const importantTruePositives = goldHigh.filter((label) => highValue(predictions.get(label.sample_id).importance)).length;
  const predictedCritical = samples.filter((sample) => predictions.get(sample.sample_id).importance === "critical");
  const criticalFalsePositives = predictedCritical.filter((sample) => labelById.get(sample.sample_id).importance !== "critical").length;
  const lowValueCompressed = goldLow.filter((label) => lowValue(predictions.get(label.sample_id).importance)).length;
  const evidenceSupported = samples.filter((sample) => sample.text.includes(predictions.get(sample.sample_id).evidence_quote)).length;
  const bySource = {};
  for (const source of ["gmail", "ed", "moodle"]) {
    const sourceSamples = samples.filter((sample) => sample.source === source);
    bySource[source] = {
      count: sourceSamples.length,
      importance_accuracy: accuracy(new Map(sourceSamples.map((sample) => [sample.sample_id, predictions.get(sample.sample_id)])), labels.filter((label) => label.source === source), "importance"),
    };
  }
  return {
    sample_count: samples.length,
    field_accuracy: Object.fromEntries(["authority", "content_type", "importance", "action_required", "open_original"].map((field) => [field, accuracy(predictions, labels, field)])),
    importance_recall: importantTruePositives / goldHigh.length,
    importance_precision: importantTruePositives / predictedHigh.length,
    critical_false_positive_rate: predictedCritical.length === 0 ? 0 : criticalFalsePositives / predictedCritical.length,
    low_value_compression_rate: lowValueCompressed / goldLow.length,
    evidence_support_rate: evidenceSupported / samples.length,
    duplicate_evaluation: "deferred",
    by_source: bySource,
    disagreements: samples
      .filter((sample) => ["content_type", "importance", "action_required", "open_original"].some((field) => predictions.get(sample.sample_id)[field] !== labelById.get(sample.sample_id)[field]))
      .slice(0, 20)
      .map((sample) => ({
        sample_id: sample.sample_id,
        prediction: predictions.get(sample.sample_id),
        gold: labelById.get(sample.sample_id),
      })),
  };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(report) {
  const rows = Object.entries(report.field_accuracy)
    .map(([field, value]) => `| ${field} | ${percent(value)} |`)
    .join("\n");
  const sources = Object.entries(report.by_source)
    .map(([source, value]) => `| ${source} | ${value.count} | ${percent(value.importance_accuracy)} |`)
    .join("\n");
  const disagreements = report.disagreements.length === 0
    ? "无"
    : report.disagreements.map((item) => `- ${item.sample_id}`).join("\n");
  return `# Cove 最小分诊回放报告\n\n- 样本数：${report.sample_count}\n- 语义重复评测：${report.duplicate_evaluation}\n\n## 核心指标\n\n| 指标 | 结果 |\n|---|---:|\n| 重要信息召回率 | ${percent(report.importance_recall)} |\n| 重要信息精确率 | ${percent(report.importance_precision)} |\n| 关键误报率 | ${percent(report.critical_false_positive_rate)} |\n| 低价值压缩率 | ${percent(report.low_value_compression_rate)} |\n| 证据支持率 | ${percent(report.evidence_support_rate)} |\n\n## 字段准确率\n\n| 字段 | 准确率 |\n|---|---:|\n${rows}\n\n## 按来源\n\n| 来源 | 样本数 | importance 准确率 |\n|---|---:|---:|\n${sources}\n\n## 需要查看的分歧\n\n${disagreements}\n\n> 这是匿名改写 prototype 集上的确定性规则 baseline，不代表真实用户效果，也不代表生产系统质量。\n`;
}

export function runEvaluation() {
  const samples = readJson(SAMPLE_FILE).samples;
  const adjudication = readJson(LABEL_FILE);
  const labels = adjudication.overrides ? applyAdjudication(samples, adjudication) : adjudication.annotations;
  return { report: evaluate(samples, labels), samples, labels };
}

function applyAdjudication(samples, adjudication) {
  const labels = readJson(path.join(ROOT, "docs/gold-set-round1-2026-10-28.json")).annotations.map((label) => ({ ...label }));
  const byId = new Map(labels.map((label) => [label.sample_id, label]));
  for (const [id, override] of Object.entries(adjudication.overrides ?? {})) Object.assign(byId.get(id), override);
  for (const [id, group] of Object.entries(adjudication.duplicate_group_overrides ?? {})) byId.get(id).duplicate_group = group;
  if (labels.length !== samples.length) throw new Error("裁决标签与样本数量不一致");
  return [...byId.values()];
}

export function main() {
  const { report } = runEvaluation();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
