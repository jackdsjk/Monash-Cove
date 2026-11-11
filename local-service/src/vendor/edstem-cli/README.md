# Ed lesson attachment extraction

`lessons.ts` ports `parseLessonSlide`, `listLessonFiles`, file extraction and filename
helpers from `edstem-cli@0.5.0`, MIT, Copyright (c) 2026 bunizao.
Source: https://github.com/bunizao/edstem-cli (installed npm distribution).
The inspected `dist/edstem.js` SHA-256 is
`dbaa73bb791cb959e3947ff8db38670565ef0d15f0d6e9dd4a267849d716fccd`.

Local adaptations: typed read-only inputs, a `document` compatibility fallback,
separate lesson-outline and slide ownership, and rejection of URL credentials or
custom ports. The existing download adapter remains responsible for redirects,
stream bounds and connection guards. No quiz/progress writes are ported.
Preserve LICENSE and this provenance; run backend Ed lesson/API tests and check.
