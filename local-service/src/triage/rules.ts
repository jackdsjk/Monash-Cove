import type { ActionRequired, ContentType, Importance, OpenOriginal, Source } from "../domain.js";

export interface TriageInput {
  source: Source;
  authorRole: string;
  title: string;
  text: string;
  kind?: "assessment" | "forum";
  publishedAt?: string;
}

export interface TriageResult {
  contentType: ContentType;
  importance: Importance;
  actionRequired: ActionRequired;
  openOriginal: OpenOriginal;
  evidenceQuote: string;
  triageVersion: string;
  model: string;
}

const NEGATED_BEFORE = /\b(no|not|never|without)\b[^.;]{0,60}$/i;
const CLAUSE_BOUNDARY = /[.;]|,?\s(?:and|but|yet)\s/gi;

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isNegatedAt(text: string, index: number) {
  CLAUSE_BOUNDARY.lastIndex = 0;
  let start = 0;
  let boundary = CLAUSE_BOUNDARY.exec(text);
  while (boundary && boundary.index < index) {
    start = boundary.index + boundary[0].length;
    boundary = CLAUSE_BOUNDARY.exec(text);
  }
  return NEGATED_BEFORE.test(text.slice(start, index));
}

function hasUnnegatedMatch(text: string, pattern: RegExp) {
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

function hasAnyUnnegated(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => hasUnnegatedMatch(text, pattern));
}

function evidenceFor(text: string, category: ContentType) {
  const patterns: Partial<Record<ContentType, RegExp>> = {
    requirement_change: /deadline|due|override|changed|updated|different room|replacement|extension|maximum|requirement/i,
    staff_answer: /staff (reply|response)|teacher|teaching team/i,
    peer_question: /asks|question|no (staff|official|teaching-team) answer|unresolved/i,
    assessment_fact: /deadline|closing time|assessment page|quiz page/i,
    administrative: /account|library|payment|appointment|exam timetable|security/i,
    promotion: /voluntary|survey|recruit|trip|election|gift-card/i,
    learning_material: /recording|slides|practice|reading|learning task|notes/i,
  };
  const parts = sentences(text);
  return parts.find((part) => patterns[category]?.test(part)) ?? parts[0] ?? text;
}

function classifyContent(item: TriageInput): ContentType {
  const text = item.text;
  if (item.source === "moodle" && item.kind !== "forum") {
    return /override|changes the submission deadline/i.test(text) ? "requirement_change" : "assessment_fact";
  }
  const noAuthoritativeAnswer = /no (staff|official|teaching-team) (answer|reply|response)/i.test(text);
  if (!noAuthoritativeAnswer && /staff (reply|response)|a staff reply|a staff response/i.test(text)) return "staff_answer";
  if (item.authorRole === "student" && (/asks|question|no (staff|official|teaching-team) answer|unresolved/i.test(text) || /\?/.test(text))) return "peer_question";
  if (hasAny(text, [/tuition|payment|finance|library|sign-in|account security|appointment|exam timetable/i, /extension (?:request|application)/i])) return "administrative";
  if (hasAnyUnnegated(text, [/deadline|due date|override|requirements? (?:has )?(?:changed|updated|clarified)|updated specification/i, /different room|replacement link/i, /extension.*approved/i, /maximum duration/i])) return "requirement_change";
  if (hasAny(text, [/survey|recruit|day trip|election|gift-card/i])) return "promotion";
  if (hasAny(text, [/recording|slides|practice questions|supplementary material|learning task|weekly task/i])) return "learning_material";
  if (item.authorRole === "staff") return "staff_announcement";
  return "noise";
}

function classifyImportance(item: TriageInput, contentType: ContentType): Importance {
  const text = item.text;
  const authoritative = item.authorRole === "staff" || item.authorRole === "system";
  if (contentType === "promotion") return "skip";
  if (authoritative && hasAny(text, [/unfamiliar.*sign-in|security steps|pass the unit|last sitting/i])) return "critical";
  if (contentType === "administrative" && /\bduplicate\b/i.test(text)) return "skip";
  if (contentType === "assessment_fact" && /submission deadline|due (?:date|time)/i.test(text)) return "critical";
  if (contentType === "assessment_fact") return "important";
  if (contentType === "requirement_change" && /deadline|due|override|must|different room|extension|maximum/i.test(text)) return "critical";
  if (contentType === "staff_answer" || contentType === "administrative") return "important";
  if (contentType === "peer_question" && /assignment|assessment|submission|deadline|hurdle|video/i.test(text)) return "important";
  return "reference";
}

function classifyAction(contentType: ContentType, text: string): ActionRequired {
  if (/optional|voluntary|not (a|the) course requirement|not.*graded|no completion action/i.test(text)) return "no";
  if (contentType === "peer_question") {
    return /no (staff|official|teaching-team) answer|unresolved|uncertain/i.test(text) ? "uncertain" : "no";
  }
  if (hasAnyUnnegated(text, [/must|should|need to|before|deadline|submit|register|reply|verify|use the new|pay/i, /required|reminds students|check-in|security review|replacement link/i])) return "yes";
  return "no";
}

const STALE_AFTER_HOURS = 7 * 24;

function isStale(item: TriageInput) {
  if (!item.publishedAt) return false;
  const published = Date.parse(item.publishedAt);
  if (!Number.isFinite(published)) return false;
  const ageHours = (Date.now() - published) / 3_600_000;
  if (ageHours <= STALE_AFTER_HOURS) return false;
  // A future ISO date (Moodle deadlines) keeps an older item actionable.
  const hasFutureDate = [...item.text.matchAll(/\b20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?/g)]
    .map((match) => Date.parse(match[0]))
    .some((date) => Number.isFinite(date) && date >= Date.now() - 86_400_000);
  return !hasFutureDate;
}

export function normalizeAction(importance: Importance, action: ActionRequired): ActionRequired {
  if ((importance === "reference" || importance === "skip") && action === "yes") return "no";
  return action;
}

export function applyFreshness(item: TriageInput, result: TriageResult): TriageResult {
  if (!isStale(item)) return result;
  const importance: Importance = result.importance === "critical" || result.importance === "important" ? "reference" : result.importance;
  const actionRequired: ActionRequired = result.actionRequired === "yes" ? "no" : result.actionRequired;
  return {
    ...result,
    importance,
    actionRequired,
    openOriginal: importance === "skip" ? "no" : "optional",
    triageVersion: `${result.triageVersion}-stale`,
  };
}

export function triage(item: TriageInput): TriageResult {
  const contentType = classifyContent(item);
  const importance = classifyImportance(item, contentType);
  const actionRequired = normalizeAction(importance, classifyAction(contentType, item.text));
  const evidenceQuote = evidenceFor(item.text, contentType);
  const openOriginal: OpenOriginal =
    importance === "critical" || actionRequired === "uncertain" ? "required" : importance === "skip" ? "no" : "optional";
  return applyFreshness(item, {
    contentType,
    importance,
    actionRequired,
    openOriginal,
    evidenceQuote: item.text.includes(evidenceQuote) ? evidenceQuote : item.text,
    triageVersion: "rules-v2",
    model: "deterministic-rules",
  });
}

export function assertEvidence(text: string, quote: string) {
  return Boolean(quote) && text.includes(quote);
}
