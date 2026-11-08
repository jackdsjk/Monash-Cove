# Cove — Product Plan

*Working draft · 24 October 2026 · thinking only, no implementation decisions*

---

## In one breath

Every Monash student has a friend who took that unit last semester and knows the traps. That friend is one person, gets busy, and forgets. We are building the version that never forgets: it watches your deadlines, knows the rules that cost people marks and money, and tells you before it is too late.

We are not building a chatbot that answers questions about Monash. We are building a **senior student** — perfect memory, infinite patience, always right about the boring things, and never more than one message away.

---

## The argument, in five steps

Each step is a premise, and each premise forces a design choice. If a premise is wrong, the choices built on it are wrong, so this is the part worth arguing about.

| # | Premise | Therefore |
|---|---|---|
| 1 | **The problem is decision latency, not information scarcity.** Students are not short of information; they are short of a decision in time. The census date, the special consideration window, the unit they should not take — these are decisions made alone, late, on rumour. | We optimise for *a decision in two seconds*, not for comprehensive information. |
| 2 | **Intelligence is becoming a commodity.** General agents (Claude, Codex, DeepSeek) already reason better than anything we could build, and users can bring their own keys. | We never compete on capability. Writing, coding, reasoning, summarising: theirs. Permanently. |
| 3 | **If intelligence is commodity, value moves to what surrounds it** — state (what is true about *you*), local truth (what is true about *this institution*), and timing (when to speak). | These three are the product. Everything else is plumbing. |
| 4 | **The failure mode of a personal agent is noise, not ignorance.** A reminder system that fires fourteen times gets muted in week two and never comes back. Being ignored is worse than being wrong. | Silence is a feature. Every unprompted message must earn its interruption. |
| 5 | **Trust comes from evidence, not fluency.** A confident wrong answer about a census date is worse than no answer. | No fact without a source. Conflicts are surfaced, never silently resolved. |

The chain terminates in one sentence: **build a quiet service that knows your semester, knows Monash's traps, and speaks only when it matters.**

---

## What we are building: three shapes

The mistake is treating everything as one kind of thing. Housing, a deadline, and "where's good food" have nothing in common except that they all reduce decisions. They need three different shapes.

| Shape | Time horizon | Mode | Example |
|---|---|---|---|
| **Commitment** | days | push, daily | "A2 due Thu 23:59, so it's not the Friday you think" |
| **Quest** | weeks to months | tracked checklist | student pass renewal, housing hunt, exchange application |
| **Question** | minutes | pull, on demand | "cheap halal food near campus?", "is this mark worth appealing?" |

Commitments are the MVP. Questions are cheap to add. Quests are the feature nobody else has, because a quest needs *your* state, a *process model*, and *weeks of tracking* — none of which a session-based agent holds.

The unifying idea: **we are the interpreter between a student and an institution that communicates in forms, dates, and portals.**

---

## Trust: the rules we will not break

1. **Evidence or silence.** Every fact carries a link to its source. The model classifies, summarises, ranks and drafts; it never invents facts.
2. **Tiers.** Authoritative sources (handbook, unit guides, policies, EMGS) answer questions. Community sources (Reddit, Xiaohongshu, group chats) tell us *what to ask* — never what to answer on high-stakes matters.
3. **Conflicts are shown, not resolved.** Moodle says Friday, the unit guide says Thursday: show both. Guessing burns trust, and trust is the only thing this product has.
4. **Never submits.** It will remind, plan, draft, pre-fill and checklist. It will not submit an assignment or email a tutor without a human tap. It handles logistics, not consequences.
5. **Facts expire.** Rent figures, visa rules and food places rot. A 2023 number is worse than no number, because it is confidently wrong.

---

## The MVP

> **It never lets you miss anything that costs you marks or money.**

That is the whole promise. Not housing, not food, not visa, not assignments. Your deadlines, your per-unit rules, your money cliffs, your grade maths — perfectly, for one semester, for one student.

**In**
- Two sources: course materials and timetable.
- A ledger of commitments: what, by when, how much it hurts, where the proof is.
- A morning brief.
- Deduped, escalating reminders. The same deadline is never mentioned twice.
- "Ask anything about my week," answered from the ledger in seconds.
- **Per-unit rule knowledge** — the late penalty on *this* assessment, the hurdle flag, the AI policy.
- **Consequence maths** — refund, W on transcript, scholarship threshold, "what do I need on the final."

**Out**
Email, OnTrack, Ed, housing, visa, retrieval over documents, calendar writes, weekly review, any interface that is not a chat window, any second user.

**Success criterion**
In the first month, it catches **one thing you would have missed**. One save. If it never happens, the product is wrong — not unfinished.

**Why this scope**
Because "complete" should mean *the loop closes*, not that the source list is long. A closed loop over two sources beats a half-open loop over seven. And the two features that make it feel like a senior student rather than a feed reader (per-unit rules, consequence maths) are cheap to build and impossible to fake.

**A candid note**
This MVP will not demo well in thirty seconds. Its value is cumulative and invisible, like insurance — you only feel it at the moment of the save, and saves are rare. **The proof is a backtest, not a demo:** replay last semester's real deadlines and emails and count how many things it would have caught that you actually got wrong. If that number is zero, the premise of this product is wrong and we should know it in a week rather than in month three.

---

## The vision

The vision is not a longer feature list. It is **coverage of what the friend knows.** Same product, larger circle.

**Stage 1 — Deadlines.** It holds your semester. It knows the rules of your units and the consequences of missing them. You stop keeping a mental calendar.

**Stage 2 — Decisions.** It knows how to answer the seven questions that currently get asked in a group chat at 11pm: which units to take, whether to withdraw, whether you have grounds for special consideration, where to live, whether a job is legal on your visa, whether a mark is worth appealing, whether you are on track to graduate.

**Stage 3 — Process.** It runs the multi-week things: the pass renewal with its documents and dates, the housing hunt with its shortlist and deposit deadline, the exchange application. It computes your start date backwards from a deadline and tells you when to begin.

**Stage 4 — Execution.** It drafts, pre-fills, and files — with your tap. You stop doing paper.

**The end state, described as a feeling:** you no longer carry your semester in your head. It carries it. You check your phone and it has already told you the thing that mattered. When you ask *"can I still drop this unit?"* it answers with the date, the refund, the transcript consequence and the effect on your scholarship, in two seconds, because it already knew all of it.

That is the product. It is unimpressive in a demo and indispensable in a term.

---

## Why this compounds

Three assets, all boring, all defensible, none of them a model:

1. **The rules library.** A verified, dated, expirable model of how this institution actually works — per-unit penalties, census dates, form windows, hurdle requirements. Authoritative and small beats plentiful and unverifiable. This is the asset nobody else is building, because it is local and unglamorous.
2. **The correction loop.** A student says "that changed" → it becomes a test → it is never wrong again. When Claude is wrong about Monash, nobody fixes Claude. When we are wrong, the error is retired permanently.
3. **The save log.** Every near-miss caught, recorded. That is the README, the demo, the resume, and the evidence that the product works.

The flywheel is *questions from the crowd, answers from the institution, corrections into tests.* Not data volume. Curation plus correction.

---

## Why not just use Claude or Codex

The honest version: **to make a general agent do this, you would have to build us first.** The Moodle connector, the typed model of your state, the verified rule library, the scheduler, the dedupe logic, the push channel — that work exists whether it ships as our app or as someone's skill. The question answers itself.

What a general agent structurally does not do:

- **Speak first.** Its unit of work is a request you open. Ours is a semester that runs.
- **Remember you.** Context resets; state accumulates.
- **Know one institution.** It reasons about the world in general. We are correct about Monash in particular.
- **Judge interruption.** A pull system is judged on answer quality. A push system is judged on whether it should have spoken at all. That is a different discipline, and nobody is optimising it.
- **Be zero-setup.** A chat window, not a terminal.

And what we concede, permanently: writing, coding, reasoning, summarising, planning. The user brings the brain. **They supply intelligence; we supply truth and cadence.**

---

## What we are deliberately not building

- An LLM wrapper. The model is replaceable and the user brings the key.
- An assignment writer. The value is in diagnosing the gap, not filling it — and competing with Anthropic on their strongest ground is a losing position.
- A dashboard, a web app, or a notification centre. One chat window.
- A multi-user product, until one person uses it daily.
- Custom scrapers for closed platforms. WeChat is a *capture* channel (you forward what matters), never an ingest channel.
- A workflow engine, an agent framework, or a DSL. Three primitives: ritual, watcher, skill. Boring on purpose.

---

## Implementation base and migration

The first implementation can use `unicorn` as the technical base while Cove validates the product loop. Cove is the product identity; `unicorn` remains an implementation dependency until the replacement work is ready.

The migration is deliberately staged:

1. Keep the current base stable while we validate sources, memory, evidence and cadence.
2. Add Cove-specific workflows, rules, evaluation cases and user-facing behavior instead of only changing labels.
3. Move the repository, package metadata, plugin identity and documentation ownership to Cove, while retaining the required upstream license and attribution.
4. Replace runtime identifiers such as database names, resource namespaces and connector names only with an explicit compatibility and migration path.
5. Retire the remaining `unicorn` dependency after Cove-owned tests cover the data model, sync behavior, MCP surface and deployment flow.

This keeps the early implementation reversible and makes “Cove is our own product” a verifiable engineering milestone rather than a branding-only change.

## Risks we should be honest about

1. **Access.** If Monash's systems cannot be read programmatically, the architecture changes and possibly the product does. This is the single riskiest assumption and it is worth one week to test before anything else.
2. **The backtest may say no.** It is possible that nothing was ever truly missed, and the pain is smaller than it feels. Test this early, with real data.
3. **We are the user and the builder.** Deeply convenient and quietly dangerous — a product that fits exactly one person is not a product. Watch for what only *we* find useful.
4. **Noise creep.** Every new source feels like value and is mostly dilution. The push budget is a promise, not a preference.
5. **Maintenance.** Scrapers break every semester. Budget for it, or the product quietly rots.
6. **Scope drift.** Housing, visa, food and social media are the vision, not the MVP. Breadth should arrive as *content we add*, not as *features we build*.

---

## Sequencing

Four phases, each shippable, each answering a question.

1. **Prove access.** Can we read the sources? One week. If not, rethink before building.
2. **Prove value.** Backtest last semester. Did anything actually get missed? If zero, stop and rescope.
3. **Build the loop.** Ledger, brief, reminders, ask, rules, maths. Small, closed, used daily by one person.
4. **Widen coverage.** Questions, then the first quest — chosen because *you personally face it next*, since a quest you do not need is a quest you will not finish.

Two things this project teaches that are worth more than the product: how to model a domain as state rather than messages, and how to prove a product works when the value is invisible.

---

## Decisions so far

- Positioning: a **personal secretary for Monash students**, specialised by context and cadence, not capability.
- Strategy: build the Monash toolkit as plumbing, position as the secretary.
- Shape: **commitment** (MVP), **question** (v1), **quest** (v2).
- Channel: one chat window; the channel is an adapter, so it can be swapped.
- Trust: evidence-bound, tiered, never submits.
- MVP promise: **never miss anything that costs marks or money.**

## Open questions

1. What is this actually called? The repo says *EdgeSdk*, the conversation says *Cove*, and the plan needs one name.
2. Which seven decisions have you or your friends actually faced in the last six months? That answer outranks this entire document.
3. Which source can we realistically read first, and what happens if we cannot?
4. Is the first quest visa renewal or housing — whichever you face next?
