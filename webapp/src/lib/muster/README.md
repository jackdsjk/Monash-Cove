# Muster helper provenance

The framework-free helpers and their original tests in this directory were copied from the user-provided Muster repository, `/Users/Admin/Documents/Workspace/muster`, commit `ad2372683e0fbc4efb148af8b81840ae8dee5f39`.

`gradeBreakdown.ts` is identical to `src/lib/gradeBreakdown.ts` at that commit except for its local type import. `types.ts` retains the fields those helpers read. The local gradebook adapter is maintained separately in `../grades.ts`; changes there must not be described as upstream Muster behavior.

Muster is licensed under PolyForm Noncommercial 1.0.0. Preserve [LICENSE](LICENSE) and [NOTICE](NOTICE), including Copyright 2026 Poetrynan, with copies and distributions. This reuse is for the project's stated noncommercial use; it does not grant commercial rights.

The backend's class-based grade-cell extraction also follows `src-tauri/src/moodle/scraper.rs::parse_gradebook_from_html`, adapted to the existing Node HTML parser rather than copying the Rust runtime. Backend weight ancestry and the local gradebook adapter are local adaptations, not claims about Muster's gradebook format.
