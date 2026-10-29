import { z } from "zod";
import type { TriageInput, TriageResult } from "./rules.js";
import { applyFreshness, assertEvidence, normalizeAction, triage } from "./rules.js";

const modelSchema = z.object({
  content_type: z.enum([
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
  ]),
  importance: z.enum(["critical", "important", "reference", "skip"]),
  action_required: z.enum(["yes", "no", "uncertain"]),
  open_original: z.enum(["required", "optional", "no"]),
  evidence_quote: z.string().min(1),
});

type ModelOutput = z.infer<typeof modelSchema>;

export interface Classifier {
  classify(input: TriageInput): Promise<TriageResult>;
}

export class OpenAICompatibleClassifier implements Classifier {
  constructor(
    private readonly config: { baseUrl: string; model: string; apiKey: string },
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async classify(input: TriageInput): Promise<TriageResult> {
    const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Classify one anonymized campus item. Return only JSON with content_type, importance, action_required, open_original, evidence_quote. evidence_quote must be an exact substring of the supplied text.",
          },
          {
            role: "user",
            content: JSON.stringify({ source: input.source, author_role: input.authorRole, title: input.title, text: input.text }),
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Model returned HTTP ${response.status}.`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("Model did not return JSON.");
    const parsed = modelSchema.parse(JSON.parse(json));
    return toResult(parsed, input, this.config.model);
  }
}

function toResult(output: ModelOutput, input: TriageInput, model: string): TriageResult {
  if (!assertEvidence(input.text, output.evidence_quote)) {
    throw new Error("Model evidence is not a substring of the source text.");
  }
  return {
    contentType: output.content_type,
    importance: output.importance,
    actionRequired: output.action_required,
    openOriginal: output.open_original,
    evidenceQuote: output.evidence_quote,
    triageVersion: "model-v1",
    model,
  };
}

let cached: Classifier | null | undefined;

export function modelFromEnv(): Classifier | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.COVE_MODEL_API_KEY;
  const model = process.env.COVE_MODEL_NAME;
  const baseUrl = process.env.COVE_MODEL_BASE_URL;
  cached = apiKey && model && baseUrl ? new OpenAICompatibleClassifier({ apiKey, model, baseUrl }) : null;
  return cached;
}

export async function classify(input: TriageInput): Promise<TriageResult> {
  const rules = triage(input);
  const model = modelFromEnv();
  if (!model) return rules;
  try {
    const result = await model.classify(input);
    // Critical decisions require a valid evidence quote. Invalid model output
    // falls back to the deterministic baseline instead of entering the store.
    if (result.importance === "critical" && !assertEvidence(input.text, result.evidenceQuote)) return rules;
    return applyFreshness(input, { ...result, actionRequired: normalizeAction(result.importance, result.actionRequired) });
  } catch {
    return rules;
  }
}
