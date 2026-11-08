# Monash Cove

**English** · [简体中文](README.zh-CN.md)

A local-first triage app for Monash students. It turns read-only content from Gmail, Ed, Moodle and OnTrack into one reviewable brief, one deadline countdown, and one weekly materials sheet.

Everything runs on your machine. The app never uploads content and never acts on your behalf inside university systems.

---

## 1. What problem this solves

A student works across four systems every day: university mail, Moodle course pages, Ed discussion boards, and OnTrack. They carry notices, assignment requirement changes, tutor feedback, and a large amount of unrelated discussion. Those platforms publish; none of them judge. The judging is left to the student.

Monash Cove splits that work into four steps:

1. **Read-only polling** — pull new content from four sources locally, with read-only credentials;
2. **Triage** — decide importance and required action from course ownership, author role, and whether the content changes an existing arrangement;
3. **Evidence** — every judgement carries a quoted excerpt and a link back to the source;
4. **Change history** — record what changed inside an item (due date, title, body), not merely whether something is new.

It is not a calendar replacement, and it does not write your assignments. It replaces reading every notification before deciding what matters.

## 2. Who it is for

**Fits**: a current Monash student who uses Moodle, university mail, Ed and OnTrack, needs to keep up with coursework, and would rather not read every notice one by one.

**Does not fit**:

- non-Monash users — the adapters target Monash's Moodle, Ed and OnTrack directly;
- anyone expecting the app to submit work, reply to messages, or change grades — there are no write operations;
- multi-user or cloud-sync scenarios — this is single-user, single-machine software.

## 3. Features

### 3.1 Brief (home)

Compresses everything since your last visit into **Must handle / To confirm / Folded**. Each row shows source, course, arrival time, a quoted excerpt and judgement tags; opening a row shows the full item and the original text. Filter by source, type or course, or narrow to "needs action" and "unread".

### 3.2 Change tracking

Every sync compares the incoming item with the stored version and records field-level changes (due date, title, course, body). The brief shows a collapsible "what changed since your last visit" list with before/after values. Change records are kept for 90 days, and first-time imports are never reported as changes.

### 3.3 Deadline countdown

Combines Moodle and OnTrack deadlines, grouped into **Overdue / Within 24 hours / Within three days / Later**. Each deadline is a square card with a per-second flip countdown; marking an item submitted removes it from the list.

### 3.4 Weekly materials

Materials grouped by course and week: slides, recordings, assignment instructions and notices, with filtering by course and type, batch selection and download.

### 3.5 OnTrack

A dedicated page with:

- **Task table** — code, name, status, due date, weighting, filterable by P / C / D / HD grade band;
- **Task conversation** — click any task to open a side panel with your full thread with the tutor in chronological order; status transitions and plan changes appear as system lines;
- **Tutor feedback** — comments and automated assessment results, filterable by task and readable in full;
- **Downloads** — task resource bundles and submitted PDFs.

### 3.6 Ed learning

Browse Ed lessons by video, text and attachments: videos open the original page, text slides export as Markdown, PPT and PDF files download, and a whole lesson can be packaged at once.

### 3.7 Attendance

Collects attendance codes from Gmail and Moodle. Moodle images are read with a bundled Tesseract.js (WASM) OCR pass, and every result can be checked by hand.

### 3.8 Sources and credential lifetime

Manages the four source connections and shows each one's **credential lifetime**: Gmail renews automatically; Ed and Moodle have no published expiry and report a failure when they lapse; OnTrack exchanges a refresh credential for short-lived tokens.

### 3.9 Local MCP (optional)

`local-service` also exposes a read-only MCP endpoint (stdio or Streamable HTTP) so an external agent can read the brief, deadlines, source status and course materials. See [docs/mcp.md](docs/mcp.md).

## 4. Data sources

| Source | Connection | Scope | Credential | Lifetime |
|---|---|---|---|---|
| Gmail | Google OAuth (`gmail.readonly`) | Read mail and threads | Local Keychain | 1 hour, auto-renewed |
| Ed | Ed API token | Read course discussions | Local Keychain | Not published |
| Moodle | Chrome login assistant, captures the session cookie | Read course pages and files | Local Keychain | Not published |
| OnTrack | Chrome login assistant, captures a refresh credential | Read tasks, feedback and files | Local Keychain | Short-lived tokens, auto-renewed |

All four are read-only. The app sends no mail, submits no work, and changes no task status.

## 5. Architecture

```text
┌─────────────┐     HTTP/JSON      ┌──────────────────┐     HTTPS      ┌──────────────┐
│   webapp    │ ─────────────────▶ │  local-service   │ ─────────────▶ │  University  │
│ React+AntD  │ ◀───────────────── │ Fastify + SQLite │ ◀───────────── │  read-only   │
└─────────────┘                    └──────────────────┘                └──────────────┘
        │                                    │
        │                                    └─ Keychain (credentials)
        └─ browser UI                        └─ SQLite (items, judgements, changes)
```

- **webapp** — Vite + React 19 + Ant Design 6; a pure client that never holds a credential;
- **local-service** — Node 26 + Fastify + `node:sqlite`; owns source access, sync, triage, change history and downloads;
- **desktop** — an Electron shell that reuses the same local-service and webapp.

## 6. Getting started

### Prerequisites

- Node.js 26 or newer;
- Google Chrome (the Moodle and OnTrack login assistants drive it);
- macOS, the only platform fully verified so far;
- a Monash account.

### One command

```bash
./start-cove.sh
```

The script installs dependencies and builds both packages as needed, then starts the local service in production mode and serves the UI at <http://127.0.0.1:4317/> (macOS opens the browser automatically).

### Manual start

```bash
# terminal 1 — local service
cd local-service && npm install && npm run dev

# terminal 2 — web app
cd webapp && npm install && npm run dev
```

Development mode uses the Vite dev server at <http://127.0.0.1:5174/>; `local-service` serves `/api` on port 4317 and Vite proxies to it.

### First run

1. Open **Sources** and connect Gmail, Ed, Moodle and OnTrack in turn;
2. Run one full sync;
3. Return to **Brief**. Later launches run an incremental sync automatically.

## 7. Repository layout

| Path | Contents |
|---|---|
| `webapp/` | Web client (brief, deadlines, materials, OnTrack, Ed, attendance, sources, settings) |
| `local-service/` | Local service: source adapters, sync orchestration, SQLite, HTTP and MCP endpoints |
| `desktop/` | Electron shell and packaging configuration |
| `demo/` | Anonymous static prototype (no real login or sync) |
| `docs/` | Product definition, design rules, install and integration guides, development log |
| `redesign/` | Static HTML design directions kept for reference |
| `scripts/` | Evaluation and operational scripts |

## 8. Privacy and security boundaries

- Real credentials are written only to the local Keychain; they never enter the repository or the browser;
- Mail bodies, course content, judgements and change history live only in a local SQLite database (`~/Library/Application Support/Cove/cove.sqlite`);
- This public repository contains no real tokens, cookies, databases or account details;
- Network requests go only to university systems and Google's read-only APIs;
- No write operation exists, so a stray submission or reply is not possible.

## 9. Development and verification

```bash
# local service: unit tests + build
cd local-service && npm run check

# web app: data checks + type check + build
cd webapp && npm run check

# end-to-end smoke
cd webapp && npm run e2e
```

## 10. Current status and known limits

**Verified against real accounts**: source connection, sync, triage, change tracking, OnTrack tasks and conversations, material downloads.

**Unverified or limited**:

- the Windows desktop build has not been tested on real Windows hardware;
- the macOS Electron build is unsigned; distribution needs a Developer ID and notarization;
- Gmail incremental sync only reads mail after its cursor, so edits to older mail are never re-read (Gmail messages are not editable, so the impact is small);
- OnTrack deadlines are treated as 23:59 on the due date at +08:00, which needs per-campus adjustment for other campuses;
- there has been no external user research; evaluation rests on historical replay and self-testing.

## 11. Documentation

- Documentation index: [docs/README.md](docs/README.md)
- Product definition: [docs/PRD-Monash-Agent.md](docs/PRD-Monash-Agent.md)
- Design rules: [docs/webapp-design.md](docs/webapp-design.md)
- Local service: [local-service/README.md](local-service/README.md)
- Web client: [webapp/README.md](webapp/README.md)
- Desktop install: [docs/desktop-install.md](docs/desktop-install.md)
- MCP access: [docs/mcp.md](docs/mcp.md)

## 12. License

No open-source license is declared for this repository yet. Until one is added, all rights are reserved; contact the owner before quoting or reusing the code.
