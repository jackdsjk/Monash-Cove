# Muster assessment matching

`assessment-match.ts` ports the activity-ID-first and normalized-name fallback from
`src-tauri/src/moodle/scraper.rs::apply_gradebook` (lines 4626–4649) and
`cmid_from_url` in the user-provided Muster repository, commit
`ad2372683e0fbc4efb148af8b81840ae8dee5f39`.

The local adaptation requires course-scoped inputs and rejects foreign hosts,
conflicting activity IDs and ambiguous names. It matches assessment content to
Grades; it does not infer scoring from an activity type, title or due date.
The grade parser's `.gradeitemheader` gate follows the same upstream file's
`parse_gradebook_from_html` (lines 1884–1971).

Preserve [LICENSE](LICENSE) and [NOTICE](NOTICE), Copyright 2026 Poetrynan,
PolyForm Noncommercial 1.0.0. This port does not change the upstream license.
Run the backend gradebook and resource-route tests plus `npm run check` after edits.
