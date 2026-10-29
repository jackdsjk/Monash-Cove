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

const HIGH_VALUE = new Set(["critical", "important"]);
const LOW_VALUE = new Set(["reference", "skip"]);
const EVALUATED_FIELDS = ["content_type", "importance", "action_required", "open_original"];
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABELS = { high: "高", medium: "中", low: "低" };
const FAILURE_MODE_LABELS = {
  missed_critical: "漏判 critical",
  false_critical: "误报 critical",
  missed_high_value: "漏判高价值",
  missed_action: "漏判行动要求",
  false_high_value: "误报高价值",
  false_action: "误报行动要求",
  importance_adjacent: "重要性相邻档混淆",
  action_uncertainty: "行动确定性不符",
  open_original_only: "原文跳转不符",
  content_type_only: "内容类型不符",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

const NEGATED_BEFORE = /\b(no|not|never|without)\b[^.;]{0,60}$/i;
const CLAUSE_BOUNDARY = /[.;]|,?\s(?:and|but|yet)\s/gi;

function isNegatedAt(text, index) {
  CLAUSE_BOUNDARY.lastIndex = 0;
  let start = 0;
  let boundary = CLAUSE_BOUNDARY.exec(text);
  while (boundary && boundary.index < index) {
    start = boundary.index + boundary[0].length;
    boundary = CLAUSE_BOUNDARY.exec(text);
  }
  return NEGATED_BEFORE.test(text.slice(start, index));
}

function hasUnnegatedMatch(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let match = regex.exec(text);
  while (match) {
    if (!isNegatedAt(text, match.index)) return true;
    if (regex.lastIndex === match.index) regex.lastIndex += 1;
    match = regex.exec(text);
  }
  return false;
}

function hasAnyUnnegated(text, patterns) {
  return patterns.some((pattern) => hasUnnegatedMatch(text, pattern));
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
  if (hasAny(text, [/tuition|payment|finance|library|sign-in|account security|appointment|exam timetable/i, /extension (?:request|application)/i])) return "administrative";
  if (hasAnyUnnegated(text, [/deadline|due date|override|requirements? (?:has )?(?:changed|updated|clarified)|updated specification/i, /different room|replacement link/i, /extension.*approved/i, /maximum duration/i])) {
    return "requirement_change";
  }
  if (hasAny(text, [/survey|recruit|day trip|election|gift-card/i])) return "promotion";
  if (hasAny(text, [/recording|slides|practice questions|supplementary material|learning task|weekly task/i])) return "learning_material";
  if (sample.author_role === "staff") return "staff_announcement";
  return "noise";
}

function classifyImportance(sample, contentType) {
  const text = sample.text;
  if (contentType === "promotion") return "skip";
  if (hasAny(text, [/unfamiliar.*sign-in|security steps|pass the unit|last sitting/i])) return "critical";
  if (contentType === "administrative" && /\bduplicate\b/i.test(text)) return "skip";
  if (contentType === "assessment_fact" && /submission deadline|due (?:date|time)/i.test(text)) return "critical";
  if (contentType === "assessment_fact") return "important";
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
  if (hasAnyUnnegated(text, [/must|should|need to|before|deadline|submit|register|reply|verify|use the new|pay/i, /required|reminds students|check-in|security review|replacement link/i])) return "yes";
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

function differingFields(prediction, label) {
  return EVALUATED_FIELDS.filter((field) => prediction[field] !== label[field]);
}

function classifyFailure(prediction, label) {
  if (label.importance === "critical" && LOW_VALUE.has(prediction.importance)) return "missed_critical";
  if (prediction.importance === "critical" && label.importance !== "critical") return "false_critical";
  if (HIGH_VALUE.has(label.importance) && LOW_VALUE.has(prediction.importance)) return "missed_high_value";
  if (label.action_required === "yes" && prediction.action_required === "no") return "missed_action";
  if (HIGH_VALUE.has(prediction.importance) && LOW_VALUE.has(label.importance)) return "false_high_value";
  if (label.action_required === "no" && prediction.action_required === "yes") return "false_action";
  if (prediction.importance !== label.importance) return "importance_adjacent";
  if (prediction.action_required !== label.action_required) return "action_uncertainty";
  return prediction.open_original !== label.open_original ? "open_original_only" : "content_type_only";
}

const FAILURE_SEVERITY = {
  missed_critical: "high",
  false_critical: "high",
  missed_high_value: "high",
  missed_action: "high",
  false_high_value: "medium",
  false_action: "medium",
  importance_adjacent: "medium",
  action_uncertainty: "low",
  open_original_only: "low",
  content_type_only: "low",
};

function buildDisagreement(sample, prediction, label) {
  const failureMode = classifyFailure(prediction, label);
  const pick = (source) => Object.fromEntries(EVALUATED_FIELDS.map((field) => [field, source[field]]));
  return {
    sample_id: sample.sample_id,
    source: sample.source,
    course: sample.course,
    severity: FAILURE_SEVERITY[failureMode],
    failure_mode: failureMode,
    differing_fields: differingFields(prediction, label),
    predicted: pick(prediction),
    gold: pick(label),
    evidence_quote: prediction.evidence_quote,
    gold_summary: label.summary_gold ?? label.summary ?? "",
    gold_action_text: label.action_text ?? "",
  };
}

function summarizeFailures(disagreements) {
  const byMode = {};
  const bySource = {};
  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const item of disagreements) {
    byMode[item.failure_mode] ??= { count: 0, severity: item.severity, sample_ids: [] };
    byMode[item.failure_mode].count += 1;
    byMode[item.failure_mode].sample_ids.push(item.sample_id);
    bySource[item.source] ??= { count: 0, high: 0 };
    bySource[item.source].count += 1;
    if (item.severity === "high") bySource[item.source].high += 1;
    bySeverity[item.severity] += 1;
  }
  return { by_mode: byMode, by_source: bySource, by_severity: bySeverity };
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
  const disagreements = samples
    .filter((sample) => differingFields(predictions.get(sample.sample_id), labelById.get(sample.sample_id)).length > 0)
    .map((sample) => buildDisagreement(sample, predictions.get(sample.sample_id), labelById.get(sample.sample_id)))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.sample_id.localeCompare(b.sample_id));
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
    disagreement_count: disagreements.length,
    disagreements,
    failure_taxonomy: summarizeFailures(disagreements),
    metric_notes: [
      "authority 直接沿用样本的 author_role（staff_answer 例外），100% 不代表识别能力。",
      "evidence_quote 由样本文本切句得到，summary 是 title + evidence_quote，证据支持率 100% 是构造结果。",
      "open_original 由 importance 与 action_required 推导，其准确率反映上游误差传导，不是独立能力。",
      "只有 content_type、importance 和 action_required 是从文本判断的字段；后两者以 content_type 为中间结果，误差会向下传导。",
    ],
  };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export function renderMarkdown(report) {
  const rows = Object.entries(report.field_accuracy)
    .map(([field, value]) => `| ${field} | ${percent(value)} |`)
    .join("\n");
  const sources = Object.entries(report.by_source)
    .map(([source, value]) => `| ${source} | ${value.count} | ${percent(value.importance_accuracy)} |`)
    .join("\n");
  const taxonomy = renderTaxonomy(report.failure_taxonomy);
  const disagreements = renderDisagreements(report.disagreements);
  const notes = report.metric_notes.map((note) => `- ${note}`).join("\n");
  return `# Cove 最小分诊回放报告\n\n- 样本数：${report.sample_count}\n- 语义重复评测：${report.duplicate_evaluation}\n- 分歧样本：${report.disagreement_count} 条（高 ${report.failure_taxonomy.by_severity.high} / 中 ${report.failure_taxonomy.by_severity.medium} / 低 ${report.failure_taxonomy.by_severity.low}）\n\n## 核心指标\n\n| 指标 | 结果 |\n|---|---:|\n| 重要信息召回率 | ${percent(report.importance_recall)} |\n| 重要信息精确率 | ${percent(report.importance_precision)} |\n| 关键误报率 | ${percent(report.critical_false_positive_rate)} |\n| 低价值压缩率 | ${percent(report.low_value_compression_rate)} |\n| 证据支持率 | ${percent(report.evidence_support_rate)} |\n\n## 指标口径\n\n${notes}\n\n## 字段准确率\n\n| 字段 | 准确率 |\n|---|---:|\n${rows}\n\n## 按来源\n\n| 来源 | 样本数 | importance 准确率 |\n|---|---:|---:|\n${sources}\n\n## 失效模式\n\n${taxonomy}\n\n## 全部分歧\n\n格式：\`字段: 预测 → gold\`。\n\n${disagreements}\n\n> 这是匿名改写 prototype 集上的确定性规则 baseline，不代表真实用户效果，也不代表生产系统质量。\n`;
}

export function renderBadCases(report) {
  const severities = ["high", "medium", "low"];
  const sections = severities
    .map((severity) => {
      const items = report.disagreements.filter((item) => item.severity === severity);
      if (items.length === 0) return null;
      return `## ${SEVERITY_LABELS[severity]}优先级（${items.length} 条）\n\n${items.map(renderCaseBlock).join("\n\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
  const { high, medium, low } = report.failure_taxonomy.by_severity;
  return `# Cove 分诊 Bad Case 清单\n\n- 样本：${report.sample_count} 条匿名改写 prototype 集\n- 分歧：${report.disagreement_count} 条（高 ${high} / 中 ${medium} / 低 ${low}）\n- 用途：优先修复高风险漏判和关键误报；不代表真实用户效果或生产质量\n\n${sections}\n`;
}

function renderCaseBlock(item) {
  const diffs = item.differing_fields
    .map((field) => `${field}: ${item.predicted[field]} → ${item.gold[field]}`)
    .join("；");
  const goldAction = item.differing_fields.includes("action_required") && item.gold_action_text
    ? `\n- gold 行动：${item.gold.action_required}（${item.gold_action_text}）`
    : "";
  return `### ${item.sample_id} · ${FAILURE_MODE_LABELS[item.failure_mode]}\n- 来源：${item.source}｜课程：${item.course ?? "未标注"}\n- 差异：${diffs}${goldAction}\n- gold 摘要：${item.gold_summary || "未标注"}\n- 证据句：${item.evidence_quote}`;
}

function renderTaxonomy(taxonomy) {
  const rows = Object.entries(taxonomy.by_mode)
    .sort((a, b) => SEVERITY_ORDER[a[1].severity] - SEVERITY_ORDER[b[1].severity] || b[1].count - a[1].count)
    .map(([mode, value]) => `| ${FAILURE_MODE_LABELS[mode]} | ${SEVERITY_LABELS[value.severity]} | ${value.count} |`)
    .join("\n");
  return `| 失效模式 | 严重度 | 条数 |\n|---|---|---:|\n${rows}`;
}

function renderDisagreements(disagreements) {
  if (disagreements.length === 0) return "无";
  return disagreements
    .map((item) => {
      const diffs = item.differing_fields
        .map((field) => `${field}: ${item.predicted[field]} → ${item.gold[field]}`)
        .join("；");
      return `- [${SEVERITY_LABELS[item.severity]}] ${item.sample_id} · ${FAILURE_MODE_LABELS[item.failure_mode]} · ${diffs}`;
    })
    .join("\n");
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
  } else if (process.argv.includes("--badcases")) {
    process.stdout.write(renderBadCases(report));
  } else {
    process.stdout.write(renderMarkdown(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
