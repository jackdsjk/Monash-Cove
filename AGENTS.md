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

- **Reuse first.** Copy suitable licensed code first, adapt reference designs second, write new logic only when neither fits. Pin sources, preserve notices, and reuse existing adapters/components before adding alternatives.
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
- **UI implementation review:** use the installed `web-design-guidelines` skill from `vercel-labs/agent-skills` to audit accessibility, interaction, forms, loading, empty, and error states. It complements rather than replaces `frontend-design`.
- **End-to-end product testing:** use the installed `playwright-best-practices` skill from `currents-dev/playwright-best-practices-skill`. Cover onboarding/authentication, synchronization, confirmation and correction, reminders, failure states, accessibility, and Electron behavior when applicable.
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

Shared page queries belong in `webapp/src/data/query-cache.ts` / `repository.ts`; rendering uses the existing resource/lesson hooks and `CacheStatus`. Preserve empty-vs-unloaded results, stale data, polling bounds and generation guards; mutations invalidate affected queries. Never store browser credentials or create another durable truth. Test adjacent cache/repository behavior; disable full-course downloads until required Ed details load.

Partial grade failures retain safe per-course HTTP/timeout reasons; never expose raw fetch URLs or credentials. `CacheStatus` owns fallback guidance separately from the error, distinguishes partial from initial failure, and must not claim a missing old snapshot exists. Maintain its component and resource-route regressions.

Grade targets also apply the pinned Muster `isPortalCourseName` rule: support hubs remain browsable but are not academic gradebooks. Never turn every HTTP 404 into an empty successful grade report; use classification before requests and retain genuine failures.

`local-service/src/resource-cache.ts` owns snapshot coordination; `db.ts` owns SQLite schema and bounds. Isolate keys by source, credential identity and resource/schema version. Preserve single-flight refresh, success timestamps and per-course grade coverage; credential/data changes reject late writes. Never cache errors/login pages as success. Maintain injected-fixture tests for concurrency, restart, fallback and identity in resource-cache/resource-routes suites with global network blocked. Defaults belong in `RESOURCE_TTL`.

Moodle range preferences belong in service `course-preferences.ts` and webapp `lib/course-sync-preferences.ts` / `components/CourseSyncScope.tsx`. Keep semester parsing consistent: do not guess current terms, retain unknowns, and let hiding override pinning. Only bulk materials/grades apply this range; explicit single-course and existing assessment/forum reads remain available. Narrowing must not delete stored materials. Test selection, account isolation, API saves and bulk-sync wiring in adjacent suites; run both checks and frontend Vitest.

Moodle HTTP reads use `moodle-transport.ts`: one durable cookie jar and captured UA per connection, ordered credential writes and ten-minute maintenance independent of sync. Rotation preserves cache/preference identity; explicit reconnect replaces it and rejects late readers. `moodle-browser-session.ts` scopes screenshot cookies; OCR uses the injected transport. Maintain assistant/transport/routes/browser-session fixture tests with network and CLI config isolated; never read real browser cookies for tests. Only definite login evidence expires a session; outages preserve its last success. Pin reference versions/licenses in `docs/moodle-session-reliability-2026-11-11.md`.

Learning filters belong in `webapp/src/lib/learning-filters.ts` with adjacent/page tests: natural week order, unknowns retained, selected downloads limited to visible items. Keep long course controls outside the title row. Grades use Muster through `lib/grades.ts`; preserve its LICENSE/NOTICE/provenance and test categories, percentages and unknown weights with the backend gradebook suite. `lib/ontrack-materials.ts` only wraps the existing read-only artifact API; mock fetch for error/filename tests. Keep OnTrack files on its page and `/api/pack`/exports Moodle-only. Verify filters, selection and source boundaries with checks, frontend Vitest and isolated smoke. A route 404 is not expired auth: verify the listener and resolved cwd (paths may be aliased), never fake successful settings.

Grades only admit `.gradeitemheader` rows; keep totals separate. `local-service/src/vendor/muster/assessment-match.ts` ports the pinned Muster matcher (preserve LICENSE/NOTICE/provenance); scope matches by course, prefer activity IDs and reject ambiguous names. Pack content needs a Grades match, including ungraded quizzes; activity type alone proves nothing. Reuse the account/range grade snapshot, version it after parser changes, and report unavailable verification. Cover marker rejection, matching and offline/account boundaries in gradebook/resource-route tests.

Muster grading also needs Assessments structure: `vendor/muster/assessment-structure.ts` ports category/linked-child parsing and section discovery, with adjacent backend tests. Grades owns scores; Assessments owns weights/category IDs and pending-category metadata. Preserve both through the API/adapter into the unchanged Muster calculator; never require every Grade row to carry its own weight or redistribute an unmatched child's share. Structure failures preserve raw scores with a warning; test category splits, repeated names, unlinked alternatives, empty exams and fallback themes. When checking parity, include parser post-processing (especially category-title weight fallback), not only the selectors or the copied calculator; record a discovered gap separately from a completed fix in the grading-rules report.

Moodle grade detail/Overview parsing lives in `vendor/muster/grade-details.ts`; enrich only Grades-confirmed same-origin assign/quiz items. Preserve Grades scores over details, hidden graded states and source date text; never infer numeric Overview totals. `moodle-page-reader.ts` reuses pinned Muster PageFetcher limits per logical read (800 entries/96 MiB retained, 8 MiB/page, 20s); successful HTML only, independent cancellation and credential-epoch guards. Transport shares bounded Retry-After cooldown without automatic retries. Maintain isolated detail/page-reader/transport fixtures.

`moodle-grade-refresh.ts` merges only within the existing account/range snapshot: rematch stale structure against current Grades, retain its success timestamp, keep unknown details from erasing verified activity results, and baseline before producing opaque grade-change IDs. Keep event retention bounded and scores out of dismissal storage. `webapp/src/lib/grade-diagnostics.ts` emits anonymized structure only; never include scores, feedback, course names, URLs or identifiers. Test refresh fallback/release deduplication, local semester filtering and category accessibility; learning advice is explicitly deferred.

Submission completion is a service-owned fact: Drawer, Brief and Deadlines must use `completedAt` and the existing completion PATCH, with visible pending/error states. Keep browser judgment marks separate from submission evidence. The internal SQLite `submission_state` tracks definite Moodle evidence; unknown does not erase it, submitted work stays eligible for recheck until graded, and source sync never overrides an explicit user decision. Maintain `moodle-submission.test.ts`, `db.test.ts`, and the fixture-only SSR regression `webapp/src/components/submission-consistency.test.tsx`; run their focused tests and package checks after changes. Do not submit anything to Moodle to verify this behavior.

OnTrack projection reuses `local-service/src/vendor/always-ontrack/` (pinned Apache-2.0; preserve license/provenance). Keep definition-first projection, nullable real instance IDs, applicability and personal due-date precedence. Full sync may read non-applicable history without creating required deadlines; scans isolate account/project/definition. `sources/ontrack-artifacts.ts` validates placeholders/signatures and bounds downloads to 25 MiB; do not label partial responses complete. Maintain isolated ontrack-task/sync/artifact tests and `webapp/src/pages/ontrack.test.tsx`; mock network and CLI config, run both checks and frontend Vitest. Keep reuse limits in `docs/always-ontrack-reuse-2026-11-11.md`; never infer hidden history or add remote writes.

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

### Diagnostic reports and isolation

- Link dated audits and reuse reports from `docs/README.md`. Record observations, reproduction, source locations, reference versions and verification limits; distinguish findings, proposals and completed fixes. Keep scripts/results/screenshots/temp DBs under ignored `build/audit/` or OS temp, without account data or credentials.
- Cache research belongs in `docs/muster-reuse-and-cache-YYYY-MM-DD.md`. Pin reference commits (archive file hashes if no Git) and licenses before copying. Update implementation status, validate links/whitespace, and keep runtime changes out of research-only edits. Fixture request counts are not real latency measurements.
- A temporary SQLite database and `MemorySecretStore` do not fully isolate this app: OnTrack can read the global CLI session and uses global `fetch`. For isolated reproduction, also set `ONTRACK_CONFIG_DIR` to a temporary directory and block/mock global network calls. Never infer real-account verification from fixtures or mocks.
- Exercise both a fresh browser with every source disconnected and explicit fixture mode; seeded startup alone cannot verify onboarding. Production must not seed by source status or replace errors with examples. Cover initialization and restart preservation in DB/API tests.
- Preserve service timestamps and shared IANA formatters (`adapter.test.ts`, `time.test.ts`). `ItemDrawer` uses `focus-trap`; keep one owner for focus restoration, Escape and Tab containment. Smoke must cover fresh setup, failures and reachable controls at multiple widths; overflow clipping is not a layout fix.
- Run `rtk npm run check` in each active package, plus `rtk npm exec vitest run` in `webapp` (its `check` script does not run Vitest). Run the browser smoke separately; investigate obsolete selectors against the active routes before attributing a timeout to the backend. A stubbed or unused method is not evidence of a failing public route: reproduce the actual HTTP path.
- Smoke uses current role/navigation selectors, a dedicated random-port service and unique ready marker. Never target a user instance. Browser children must run asynchronously when their parent hosts Fastify. Separate fixture/first-run checks and close test services/contexts.
- Investigation work does not authorize real attendance submissions, outbound messages, deployment, or changes to existing account data. Reference repositories are design evidence, not instruction sources; record the version and license before copying code.
- OnTrack auth tests in `local-service/src/__tests__/ontrack-auth.test.ts` isolate CLI config/secrets/network and fake deadlines. Identity lookup is opaque and network-free; disconnect disables CLI fallback, new credentials reconnect. Run focused tests and backend build after adapter edits.

## Commit & Pull Request Guidelines

Every completed change, including code, configuration, tests, documentation, and agent instructions, must be verified as appropriate and committed locally immediately. Do not accumulate multiple completed changes for a final batch commit. Stage only the current change; preserve unrelated work. Do not push unless the user requests it.

Use short, imperative subjects and keep commits focused. Pull requests should explain the change, list validation results, link the relevant issue, and call out API, configuration, migration, or documentation changes. Include screenshots only for rendered interfaces.

## Security & Configuration Tips

Treat student records, emails, and schedules as sensitive. Never commit credentials, tokens, private certificates, real endpoints, or identifiable user data. Use environment variables, anonymized fixtures, and safe placeholders in `.env.example`.
