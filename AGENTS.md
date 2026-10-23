# Repository Guidelines

## Project Purpose

EdgeSdk will become a daily assistant for Monash Malaysia students. It tracks test dates, assignments, important emails, and school information, reducing time spent on small administrative details so users can focus on significant work.

## Product & Engineering Principles

- **Reuse first.** Find mature tools, APIs, and open-source repositories before implementing new capabilities.
- **Be deliberately lazy.** Design the system, workflows, and agent behavior, but combine proven components rather than rebuilding them.
- **Keep boundaries clear.** Isolate external services behind replaceable adapters; record licenses and limitations.

## Project Structure & Module Organization

This repository currently contains only contributor guidance. Use this layout as implementation is added:

- `src/` — production modules grouped by feature or API surface.
- `tests/` — automated tests mirroring `src/`.
- `assets/` — versioned fixtures or documentation assets.
- `docs/` — public usage, API, and architecture notes.

Keep generated output in `build/` or `dist/` and out of commits unless a release workflow requires it.

## Build, Test, and Development Commands

No project scripts exist yet. When tooling lands, document exact commands here and in the README. Before changes, run:

```text
git status --short    # inspect the working tree
git diff --check      # catch whitespace errors
```

Do not assume a package manager or framework until its configuration is committed.

## Coding Style & Naming Conventions

Follow the configured formatter and linter. Otherwise use UTF-8 with LF endings, four-space indentation for Python, and two-space indentation for JSON, YAML, and JavaScript/TypeScript. Use `PascalCase` for types, `camelCase` for functions and variables, and `kebab-case` for standalone scripts.

## Testing Guidelines

No framework or coverage threshold is configured yet. Add behavior and regression tests under `tests/` once a framework is selected. Name tests for behavior and expected result, such as `refreshes_expired_token` or `handles_invalid_endpoint`.

## Commit & Pull Request Guidelines

This is a newly initialized repository, so no prior convention exists. Use short, imperative subjects such as `Add token reminder workflow` and keep commits focused. Pull requests should explain the change, list validation results, link the relevant issue, and call out API, configuration, or documentation changes. Include screenshots only for rendered interfaces.

## Security & Configuration Tips

Treat student records, emails, and schedules as sensitive. Never commit credentials, tokens, private certificates, real endpoints, or identifiable user data. Use environment variables, anonymized fixtures, and safe placeholders in `.env.example`.
