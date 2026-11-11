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

`isPortalCourseName` directly ports `is_portal_course_name` (lines 4773–4780):
portal, student hub, academic success, graduate success and school of IT names
identify support hubs. Grade reads skip these; the course directory and materials
remain available. The upstream revision also contains this classification's tests.

`assessment-structure.ts` ports `parse_assessments_from_html`, assessment-section
discovery and `parse_weight_percent` from the same revision. Widget categories
retain IDs, category weights, linked children and empty exam categories. The
older activity-list template retains explicit item weights. Missing widget weights
fall back to category titles, preserving explicit zero. Grades controls scored-item
eligibility and primary scores; confirmed activity details may fill missing values.
Unmatched assessment links stay pending metadata.
The frontend uses the unchanged upstream calculator to split category weights.

`grade-details.ts` adapts assignment feedback/grading status, quiz attempt/grade
parsing and the official grade overview from `scraper.rs` in the same revision.
It preserves zero/letter/denominator-less scores and explicit graded-but-hidden
states. Only Grades-confirmed items may be enriched with activity detail. The
adaptation restricts assignment inspection to Moodle status/feedback tables,
keeps quiz reads within activity content, rejects date-shaped scores, and omits
empty overview placeholders and foreign-origin course links. Grading timestamps
remain the source's display text; this module does not guess a timezone.

`../../moodle-page-reader.ts` adapts `src-tauri/src/moodle/http.rs::PageFetcher`
from the same revision: successful HTML only, single-flight per logical grade read,
800 entries / 96 MiB retained, 8 MiB per page and 20-second timeout. Credential
checks and independent cancellation are Node adaptations. `moodle-transport.ts`
shares bounded 429/503 Retry-After cooldown, without automatically retrying.

Preserve [LICENSE](LICENSE) and [NOTICE](NOTICE), Copyright 2026 Poetrynan,
PolyForm Noncommercial 1.0.0. This port does not change the upstream license.
Run the backend gradebook and resource-route tests plus `npm run check` after edits.
