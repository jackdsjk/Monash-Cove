# Monash Cove

**English** · [简体中文](README.zh-CN.md)

> Read-only triage for Monash students: four systems in, one reviewable brief out.

![Node](https://img.shields.io/badge/Node-26%2B-3c873a?style=flat-square)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square)
![Access](https://img.shields.io/badge/access-read--only-2f7fd1?style=flat-square)
![Data](https://img.shields.io/badge/data-local--only-177b8a?style=flat-square)

Everything runs on your machine. The app never uploads content and never acts on your behalf inside university systems.

## Contents

| Section | Topic |
|---|---|
| [1](#1-what-problem-this-solves) | What problem this solves |
| [2](#2-who-it-is-for) | Who it is for |
| [3](#3-features) | Features |
| [4](#4-data-sources) | Data sources |
| [5](#5-architecture) | Architecture |
| [6](#6-getting-started) | Getting started |
| [7](#7-repository-layout) | Repository layout |
| [8](#8-privacy-and-security-boundaries) | Privacy and security boundaries |
| [9](#9-development-and-verification) | Development and verification |
| [10](#10-current-status-and-known-limits) | Current status and known limits |
| [11](#11-documentation) | Documentation |
| [12](#12-license) | License |

## 1. What problem this solves

A student works across four systems every day: university mail, Moodle course pages, Ed discussion boards, and OnTrack. They carry notices, assignment requirement changes, tutor feedback, and a large amount of unrelated discussion. Those platforms publish; none of them judge. The judging is left to the student.

Monash Cove splits that work into four steps:

| Step | What it does |
|---|---|
| **Read-only polling** | Pull new content from four sources locally, with read-only credentials |
| **Triage** | Decide importance and required action from course ownership, author role, and whether the content changes an existing arrangement |
| **Evidence** | Every judgement carries a quoted excerpt and a link back to the source |
| **Change history** | Record what changed inside an item (due date, title, body), not merely whether something is new |

It is not a calendar replacement, and it does not write your assignments. It replaces reading every notification before deciding what matters.

## 2. Who it is for

| | Detail |
|---|---|
| **Fits** | A current Monash student who uses Moodle, university mail, Ed and OnTrack, needs to keep up with coursework, and would rather not read every notice one by one |
| **Does not fit** | Non-Monash users — the adapters target Monash's Moodle, Ed and OnTrack directly |
| **Does not fit** | Anyone expecting the app to submit coursework, reply to messages, or change grades |
| **Does not fit** | Multi-user or cloud-sync scenarios — this is single-user, single-machine software |

## 3. Features

| Page | The question it answers |
|---|---|
| [Brief](#31-brief-home) | What needs my attention since I last looked? |
| [Change tracking](#32-change-tracking) | What changed in something I already read? |
| [Deadlines](#33-deadline-countdown) | What is due next, and how long do I have? |
| [Weekly materials](#34-weekly-materials) | What did each course publish this week? |
| [OnTrack](#35-ontrack) | Where is each task, and what did the tutor say? |
| [Ed learning](#36-ed-learning) | Where are the recording, slides and files for this lesson? |
| [Attendance](#37-attendance) | What is this week's attendance code? |
| [Sources](#38-sources-and-credential-lifetime) | Which sources are connected, and how long do the credentials last? |
| [Local MCP](#39-local-mcp-optional) | How does another agent read this data? |

### 3.1 Brief (home)

Compresses everything since your last visit into **Must handle / To confirm / Folded**. Each row shows source, course, arrival time, a quoted excerpt and judgement tags; opening a row shows the full item and the original text. Filter by source, type or course, or narrow to "needs action" and "unread".

### 3.2 Change tracking

Every sync compares the incoming item with the stored version and records field-level changes (due date, title, course, body). The brief shows a collapsible "what changed since your last visit" list with before/after values. Change records are kept for 90 days, and first-time imports are never reported as changes.

### 3.3 Deadline countdown

Combines Moodle and OnTrack deadlines, grouped into **Overdue / Within 24 hours / Within three days / Later**. Each deadline is a square card with a per-second flip countdown; marking an item submitted removes it from the list.

### 3.4 Weekly materials

Materials grouped by course and week: slides, recordings, assignment instructions and notices, with filtering by course and type, batch selection and download.

### 3.5 OnTrack

A dedicated OnTrack page with four parts:

- **Task table** — code, name, status, due date and weighting, filterable by P / C / D / HD grade band;
- **Task conversation** — click any task to open a side panel with your full thread with the tutor in chronological order; status transitions and plan changes appear as system lines;
- **Tutor feedback** — comments and automated assessment results, filterable by task and readable in full;
- **Downloads** — task resource bundles and submitted PDFs.

### 3.6 Ed learning

Browse Ed lessons by video, text and attachments: videos open the original page, text slides export as Markdown, PPT and PDF files download, and a whole lesson can be packaged at once.

### 3.7 Attendance

Collects attendance codes from Gmail and Moodle. Moodle images are read with a bundled Tesseract.js (WASM) OCR pass, and every result can be checked by hand.

### 3.8 Sources and credential lifetime

Manages the four source connections and shows each one's **credential lifetime**:

| Source | Lifetime |
|---|---|
| Gmail | Renews automatically before it expires |
| Ed | No published expiry; prompts to reconnect when it lapses |
| Moodle | No published expiry; prompts to reconnect when it lapses |
| OnTrack | Exchanges a refresh credential for short-lived tokens |

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
│   webapp    │ ─────────────────▶ │  local-service   │ ─────────────▶ │ University   │
│ React+AntD  │ ◀───────────────── │ Fastify + SQLite │ ◀───────────── │ read-only    │
└─────────────┘                    └──────────────────┘                └──────────────┘
        │                                    │
        │                                    └─ Keychain (credentials)
        └─ browser UI                        └─ SQLite (items, judgements, changes)
```

| Process | Responsibility |
|---|---|
| **webapp** | Vite + React 19 + Ant Design 6; a pure client that never holds a credential |
| **local-service** | Node 26 + Fastify + `node:sqlite`; owns source access, sync, triage, change history and downloads |
| **desktop** | An Electron shell that reuses the same local-service and webapp |

## 6. Getting started

### Prerequisites

| Requirement | Why |
|---|---|
| Node.js 26+ | Modern syntax and `node:sqlite` |
| Google Chrome | The Moodle and OnTrack login assistants drive it |
| macOS | The only platform fully verified so far |
| A Monash account | Needed to connect the four sources |

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

Courses, grades, Ed lessons and OnTrack data use shared page queries and account-scoped SQLite snapshots. Cached data stays visible during refresh or network failure. Materials includes semester, hidden-course and pinned-course preferences for bulk material and grade reads; details and verification limits are in the [cache implementation report](docs/muster-reuse-and-cache-2026-11-10.md).

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

| Boundary | How it is enforced |
|---|---|
| Real credentials | Written only to the local Keychain; never in the repository or the browser |
| Content | Mail bodies, course content, judgements and change history live only in a local SQLite database |
| Public repository | Contains no real tokens, cookies, databases or account details |
| Network | Requests go only to university systems and Google's read-only APIs |
| External writes | Attendance submission is supported through a dedicated flow; coursework submission, message replies and grade changes are not supported |

Database location: `~/Library/Application Support/Cove/cove.sqlite`.

## 9. Development and verification

| Command | What it runs |
|---|---|
| `cd local-service && npm run check` | Unit tests and build |
| `cd webapp && npm run check` | Data checks, type check and build |
| `cd webapp && npm exec vitest run` | Frontend unit tests (separate from `check`) |
| `cd webapp && npm run e2e` | End-to-end smoke run |

## 10. Current status and known limits

| Status | Detail |
|---|---|
| **Verified against real accounts** | Source connection, sync, triage, change tracking, OnTrack tasks and conversations, material downloads |
| Unverified | The Windows desktop build has not been tested on real Windows hardware |
| Unverified | The macOS Electron build is unsigned; distribution needs a Developer ID and notarization |
| Known limit | Gmail incremental sync only reads mail after its cursor, so edits to older mail are never re-read (Gmail messages are not editable, so the impact is small) |
| Known limit | OnTrack deadlines are treated as 23:59 on the due date at +08:00; other campuses need an adjustment |
| Known limit | No external user research yet; evaluation rests on historical replay and self-testing |

## 11. Documentation

| Document | Contents |
|---|---|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/PRD-Monash-Agent.md](docs/PRD-Monash-Agent.md) | Product definition |
| [docs/webapp-design.md](docs/webapp-design.md) | Design rules |
| [local-service/README.md](local-service/README.md) | Local service |
| [webapp/README.md](webapp/README.md) | Web client |
| [docs/desktop-install.md](docs/desktop-install.md) | Desktop install |
| [docs/mcp.md](docs/mcp.md) | MCP access |

## 12. License

No open-source license is declared for this repository yet. Until one is added, all rights are reserved; contact the owner before quoting or reusing the code.
