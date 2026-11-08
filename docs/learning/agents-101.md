# Agents 101 — what to study, to what depth, and what it buys you

*A one-week study plan. Goal: enough mental model to judge what an AI builds for you — not to know more than the AI.*

---

## The four words

Everything in this space is one of these. Learn them and the landscape becomes legible.

| Word | What it is | Examples |
|---|---|---|
| **Model** | the brain. A function from tokens to tokens. | Claude, GPT, DeepSeek, Gemini |
| **Harness** | the code around the brain: the loop, the tools, context management, permissions, UI | Claude Code, Codex CLI, Gemini CLI, Aider, OpenHands, Cline |
| **Framework** | a library for *building* a harness | LangGraph, AutoGen, OpenAI Agents SDK, Pydantic AI, smolagents |
| **Agent** | a harness + a purpose + (usually) state | your Cove |

**The sentence that matters:** the gap between a model and a great agent is the harness, not the model. Same model, different harness, wildly different product. This is also the answer to "why is your project not just a Claude wrapper" — because you built the harness.

---

## Read these three, in this order

Only three. Not twenty. Reading twenty is how this week fails.

### 1. `smolagents` (HuggingFace) — the minimal loop
**Why:** it is small enough to finish. You will see the entire agent loop in a few thousand lines.
**Look for:** the loop, how a tool is declared, how the model's code/tool call is executed, how the result goes back into the message list.
**Time:** 2 hours. **Output:** 10 bullets in your own words.

### 2. Codex CLI (OpenAI) or Gemini CLI (Google) — the production harness
**Why:** this is what a *real* harness looks like: approvals, sandboxing, context compaction, patch application, cost control.
**Look for:** how it asks permission before acting; how it handles context overflow; how it recovers from a failed tool call; how it decides it's done.
**Time:** 3 hours. **Output:** a list of every safety mechanism you can find, and why each exists.

### 3. Aider — context management
**Why:** the hardest problem in real agents isn't reasoning, it's deciding what the model sees. Aider's repo-map is the canonical answer.
**Look for:** how it decides which parts of a large repo are relevant, and how it keeps that within budget.
**Time:** 2 hours. **Output:** one paragraph explaining repo-map to a friend.

**Optional, only if your appetite is still there:** OpenHands (event-stream architecture, sandboxed runtime — shows how these scale), Letta/MemGPT (memory hierarchy — closest to your "long-term memory" interest), SWE-agent (the idea that *the interface design is the agent*).

---

## How to read a harness — the five-things method

Do not read files top to bottom. That's how you spend a day and learn nothing. In any harness, find exactly five things:

1. **The loop.** Search for `while`, `loop`, `step`, `run`. Everything else is decoration.
2. **The tool registry.** Where tools are declared: name, description, schema. The *descriptions* are prompts — read them as prompts.
3. **Context assembly.** How conversation history is built, truncated, compacted, or retrieved.
4. **Error and retry handling.** What happens when a tool fails or returns garbage.
5. **The tests or evals.** How they know it works.

**Skip entirely:** UI, config plumbing, provider abstraction, telemetry, packaging. You are not learning their taste in decorators.

Two hours per repo maximum. Ten bullets. Then stop, even if you're curious — curiosity without a stopping rule is how a one-week plan becomes a lost month.

---

## To what extent — the depth boundary

The question you actually asked. Answer: **enough to catch the AI when it's wrong, and no further.**

**Must have this week**
- Can explain all seven questions below without notes.
- Have read two harnesses with the five-things method, and *run* one.
- Can say what a tool schema is and why descriptions are prompts.

**Should have by the end of the build**
- Can modify a harness rather than only prompting it.
- Can name the tradeoffs of one framework vs another.
- Can write an eval and explain why it's the hard part.

**Deliberately not now**
- Implementing your own harness from scratch.
- Learning five frameworks.
- Multi-agent systems, fine-tuning, vector-database internals, MCP ecosystem depth.
- Reading papers before code. Code first; papers explain what you already saw.

If you're unsure whether something is in scope, ask: *would this change a decision in our build?* If no, it's a hobby, not study.

---

## The seven questions — the actual bar

This list is the deliverable of the week. If you can answer all seven in your own words, with an example, you are ahead of most interns and ahead of most people shipping agents. These are also, almost verbatim, what interviewers ask.

1. **What is the loop, and what makes it stop?** Termination, step budgets, cost limits. Runaway loops are the number-one production failure.
2. **What does a tool look like, and who writes its description?** Schemas, naming, and the fact that tool errors are *prompts* — the error message is what the model reads next.
3. **What happens when context overflows?** Compaction, summarisation, retrieval, sub-agents. This is the real engineering.
4. **When should you *not* use an agent?** When a deterministic workflow is cheaper, faster, and correct. Interviewers love candidates who know when to say no.
5. **How do you stop it from lying?** Grounding, validation, citations, refusal, and the difference between "the model is wrong" and "the model was given nothing."
6. **How do you know it works?** Eval sets, regression cases, the limits of LLM-as-judge.
7. **Where does state live, and what is memory vs retrieval?** State is structured truth about the user; retrieval is documents. Conflating them is the most common design error.

Write your answers down. A vague sense of understanding is not understanding, and interviews expose that instantly.

---

## The week

| Day | Do | Output |
|---|---|---|
| 1–2 | smolagents: read with the method, then run it | 10 bullets |
| 3 | Codex CLI / Gemini CLI: read + actually use it | safety mechanisms list |
| 4 | Aider: context management only | one paragraph on repo-map |
| 5 | Write the landscape one-pager | 1 page comparing harness vs framework vs model |
| 6 | Answer the seven questions from memory | 7 short answers |
| 7 | Buffer, or one optional repo | — |

Roughly 2 hours a day. Running a CLI harness costs cents with your own key and teaches more than a day of reading — do it.

---

## Why this week pays for itself twice

Once, because you'll be able to tell when the AI's design is weak: it will propose a framework when a `while` loop would do, an agent when a cron job would do, a vector database when a dictionary would do. You'll recognise those as the smell of someone who hasn't read a harness.

Twice, because every one of the seven questions is also a design decision in your own product — termination budget on the brief, tool descriptions for Moodle, context limits on the ledger, evaluation for the backtest. **You are not studying a textbook. You are reading the blueprints of the thing you're about to build.**

---

## The honest caveat

Reading three harnesses makes you *literate*, not *capable*. The week after this one is the one that matters: build the week-1 module yourself, badly, without AI writing it for you. Two hours of broken code teaches more about agent loops than three harnesses read cover to cover.

Literacy is for judging. Building is for knowing.
