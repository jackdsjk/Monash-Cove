# OnTrack CLI label port

Source: <https://github.com/bunizao/ontrack-cli/blob/04cee85a2351cc053e6e0ef2c33cdd4b44c3b1e4/src/status.ts>.
MIT, Copyright (c) 2026 bunizao; retain the adjacent LICENSE when distributing.

`status.ts` adapts only the read-only status labels, removing the CLI kit and
all remote-write helpers. Unknown states remain visible. Presentation colors,
definition-only states and Ready to Mark are local extensions in
`../../lib/ontrack-tasks.ts`; no completion or submission facts are inferred.
