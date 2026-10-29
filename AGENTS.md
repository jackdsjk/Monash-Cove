# Repository Guidelines

## Project Purpose

Five artefacts live in this repo, at different stages:

- **`stack/unicorn` — shipped system.** A self-hosted campus memory layer (product name Cove) that ingests Ed, Moodle, Canvas, Gmail, and feeds, then serves the resulting state through MCP to the model client the student already uses. It is a separate git repository ignored by this one. Start with `stack/unicorn/README.md`; current behavior is authoritative in `stack/unicorn/docs/ARCHITECTURE.md`, decisions in `stack/unicorn/docs/ADR.md`, and deployment/onboarding in `stack/unicorn/docs/setup/README.md`.
- **Root `docs/` — current product direction, not yet built.** The information-triage product defined in `docs/PRD-Monash-Agent.md`, with its roadmap, gold set, and offline evaluation harness; `docs/README.md` is the authoritative document map.
- **Root `demo/` — anonymous browser prototype.** A zero-dependency static prototype of the triage experience backed by the 55 anonymized samples and a recorded model snapshot. It is not a desktop shell and has no real login, sync, or source links.
- **Root `webapp/` — active local Web App.** Vite + React + Ant Design implementation of the brief, detail, correction, sources, and settings screens. It reads the local API; it does not own credentials or SQLite.
- **Root `local-service/` — local backend.** Node 26 + Fastify + `node:sqlite`; owns sources, credentials, sync, triage, and the production static server. Run it before the Web App in development.

Do not describe the triage direction as shipped, and do not treat the memory layer as the current MVP scope.

## Product & Engineering Principles

- **Reuse first.** Find mature tools, APIs, and open-source repositories before implementing new capabilities.
- **Be deliberately lazy.** Design the system, workflows, and agent behavior, but combine proven components rather than rebuilding them.
- **Keep boundaries clear.** Isolate external services behind replaceable adapters; record licenses and limitations.

## Product Skill Workflow

Use the smallest set of skills required for the current stage. Read each selected skill's complete `SKILL.md` before applying it. Skills support product judgment; they do not turn assumptions, planned metrics, third-party work, or unverified user claims into facts.

### Installed skills for the current stage

- **`create-prd`** — use when creating or revising the MVP PRD. Keep the PRD lean, distinguish evidence from assumptions, define target segments and alternatives, and state non-goals.
- **`prioritize-features`** — use when selecting MVP scope or changing the backlog. Rank problems and features by user impact, effort, uncertainty, and alignment; record what was deferred and why.
- **`ai-product-strategy`** — use when deciding where AI belongs, where deterministic rules are preferable, how much autonomy is safe, and where human confirmation or source evidence is required.
- **`ai-evals`** — use when defining the gold set, failure taxonomy, quality metrics, human/code/LLM evaluation split, or regression process for extraction, classification, deduplication, and risk judgment.

For substantial product decisions, preserve the output or decision record under `docs/`. Do not invoke all four skills automatically for every task.

### Skills to install at later stages

- **UI direction or first interactive prototype:** install and use `anthropics/skills@frontend-design` to establish an intentional visual and interaction direction.
- **UI implementation review:** install and use `vercel-labs/agent-skills@web-design-guidelines` after usable screens exist; use it to audit accessibility, interaction, forms, loading, empty, and error states. It complements rather than replaces `frontend-design`.
- **End-to-end product testing:** install and use `currents-dev/playwright-best-practices-skill@playwright-best-practices` once the core flow can run. Cover onboarding/authentication, synchronization, confirmation and correction, reminders, failure states, accessibility, and Electron behavior when applicable.
- **Real-user research:** only when interviews, surveys, or usability studies are actually approved, install `phuryn/pm-skills@interview-script`. Add `alirezarezvani/claude-skills@ux-researcher-designer` only if deeper journey mapping, persona synthesis, or formal usability research is needed.
- **Desktop framework:** do not install an Electron-specific skill until Electron is confirmed as the product shell. Re-evaluate the available Electron skills at that point rather than locking an implementation prematurely.

### Skills deliberately deferred

- Do not install growth, marketing, social-media, monetization, or community-operation skills while the project is focused on the product itself.
- Do not add Dify or Coze skills merely to match job-description keywords; use them only if a confirmed product requirement makes them the right implementation choice.
- Avoid all-in-one PM frameworks when the focused skills above cover the task; keep the workflow lightweight and artifact-driven.

## Project Structure & Module Organization

The implemented Worker application lives in `stack/unicorn`:

- `src/` — production modules grouped by feature or API surface.
- `tests/` — automated tests mirroring `src/`.
- `docs/` — public usage, API, and architecture notes.
- `migrations/` — ordered Cloudflare D1 migrations.
- `scripts/` — setup, upgrade, generated-artifact, and credential-push helpers.

Keep generated output in `build/` or `dist/` and out of commits unless a release workflow requires it.

## Root Web App

`webapp/` is the active local Web App: Vite, React, TypeScript, and Ant Design. `local-service/` is the Node/Fastify/SQLite backend; run it first, then `npm run dev` in `webapp`. `webapp` fetches `/api` (Vite proxy in dev, same origin in production). `npm run check` in each package covers types/tests/build. Real credentials are owned by `local-service` and never by the browser.

## Real-Data Execution

When the user says to start the real-data work, read `docs/plan/real-path/next.md` first and follow its `current_stage`. Execute `plan.md` stages S1–S8 continuously. After each stage: run its verification commands, append `execution-log.md`, advance `next.md`, and continue without asking for stage-by-stage approval. Stop only for user-only credentials, irreversible operations, or a repeated hard blocker; when blocked, continue independent stages and report the exact user action at the end. Never describe mock or fixture results as verified real-account data.

## Build, Test, and Development Commands

Run project commands from `stack/unicorn`. Before changes, inspect the worktree; before delivery, run the full check and whitespace validation:

```text
git status --short
npm run check
git diff --check
```

`npm run upgrade` applies remote D1 migrations and deploys the Worker. Treat it as a production operation; do not run it during local verification.

## Coding Style & Naming Conventions

Follow the configured formatter and linter. Otherwise use UTF-8 with LF endings, four-space indentation for Python, and two-space indentation for JSON, YAML, and JavaScript/TypeScript. Use `PascalCase` for types, `camelCase` for functions and variables, and `kebab-case` for standalone scripts.

## Testing Guidelines

Tests use Vitest and mirror production behavior under `tests/`; `npm run check` runs TypeScript validation followed by the full suite. Name tests for behavior and expected result, such as `refreshes_expired_token` or `handles_invalid_endpoint`.

## Commit & Pull Request Guidelines

Use short, imperative subjects and keep commits focused. Pull requests should explain the change, list validation results, link the relevant issue, and call out API, configuration, migration, or documentation changes. Include screenshots only for rendered interfaces.

## Security & Configuration Tips

Treat student records, emails, and schedules as sensitive. Never commit credentials, tokens, private certificates, real endpoints, or identifiable user data. Use environment variables, anonymized fixtures, and safe placeholders in `.env.example`.
