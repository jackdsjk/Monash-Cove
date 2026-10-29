import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleClassifier } from "../triage/model.js";
import { triage } from "../triage/rules.js";

const input = {
  source: "gmail" as const,
  authorRole: "staff" as const,
  title: "Deadline updated",
  text: "The submission deadline has changed to Friday.",
};

function completion(payload: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("model classifier", () => {
  it("accepts a valid structured result with exact evidence", async () => {
    const fetcher = vi.fn(async () =>
      completion({
        content_type: "requirement_change",
        importance: "critical",
        action_required: "yes",
        open_original: "required",
        evidence_quote: "submission deadline has changed to Friday",
      }),
    ) as unknown as typeof fetch;
    const classifier = new OpenAICompatibleClassifier({ baseUrl: "https://model.example/v1", model: "test-model", apiKey: "key" }, fetcher);
    const result = await classifier.classify(input);
    expect(result.importance).toBe("critical");
    expect(result.triageVersion).toBe("model-v1");
    expect(result.evidenceQuote).toContain("deadline");
  });

  it("rejects evidence that is not an exact substring", async () => {
    const fetcher = vi.fn(async () =>
      completion({
        content_type: "requirement_change",
        importance: "critical",
        action_required: "yes",
        open_original: "required",
        evidence_quote: "a sentence that does not exist",
      }),
    ) as unknown as typeof fetch;
    const classifier = new OpenAICompatibleClassifier({ baseUrl: "https://model.example/v1", model: "test-model", apiKey: "key" }, fetcher);
    await expect(classifier.classify(input)).rejects.toThrow("not a substring");
  });

  it("keeps deterministic rules available without a model key", () => {
    const result = triage(input);
    expect(result.model).toBe("deterministic-rules");
    expect(result.importance).toBe("critical");
  });
});
