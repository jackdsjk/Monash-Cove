# Curriculum — eight weeks, eight modules

*The project is the course. Each week ends with a submitted artifact and a rubric, because that is the container you work best in.*

---

## The contract

- **One module per week.** Ship by Sunday 20:00. Late is late.
- **Every module has a definition of done** — checkable, binary, no partial credit for effort.
- **I am the marker.** Not the cheerleader. I will fail work that isn't done, including yours, including mine.
- **Nothing counts until it's a file in this repo.** Ideas in a chat are not progress.
- **A module took too long if it exceeded 6 hours.** That is a signal to cut scope, not to grind.

Three rules that exist to prevent the two failure modes you described:

1. **No tutorial hell.** No course, no video series, no book read end-to-end before building. Read for at most 90 minutes, then build. If a concept can't be applied within a day, it isn't needed yet.
2. **No rabbit holes.** Any single blocker gets 2 hours. Then it is written down as blocked and the module moves on.
3. **Ship weekly, however small.** An ugly thing that runs beats a clean thing that exists only in your head.

---

## The modules

| Wk | Module | You build | Done when |
|---|---|---|---|
| 0 | **Access** | `docs/access.md` | every source has a verdict + proof |
| 1 | **One model call** | text → JSON extractor + 5 tests | 5/5 pass, and it *rejects* uncited facts |
| 2 | **The ledger** | state schema + 20 real items, import twice | second import changes nothing |
| 3 | **The brief** | today's brief, generated from the ledger | you would actually read it at 07:30 |
| 4 | **The door** | Telegram bot that pushes at 07:30 | your phone buzzes, once |
| 5 | **Reminders** | escalation ladder + never-twice guarantee | a test proves no duplicate ever fires |
| 6 | **Ask + memory** | "what's due this week" in under a second, plus 3 stored preferences | sub-second, no model call |
| 7 | **Rules + maths** | 20 fact cards with provenance + a "can I drop this?" calculator | every answer cites a card |
| 8 | **Backtest + eval** | replay last semester, count the saves | a number, not a feeling |

Weeks 0–1 are specified in full below. The rest are specified when you reach them, because a curriculum that's too detailed in advance becomes another thing to fail at.

---

## Week 0 — Access (due in 3 days)

**Goal:** find out whether this product is possible at all, before investing in it.

**Build:** `docs/access.md`, one row per source — Moodle, Monash email, timetable, OnTrack, Ed, Handbook.

For each row: verdict (readable / partial / blocked), method (API, export, page fetch, manual), proof (a screenshot, a saved file, or a response you actually got), limits (auth expiry, rate limit, terms-of-service note).

**Done when:** all six rows filled, at least two carrying real proof, plus one paragraph: *what this means for the plan.*

**Hard rule:** two hours per source, then mark it blocked and move on. Discovering that Moodle can't be read programmatically is a *success* for this module — it is the whole point of doing it first.

**What you'll learn:** API vs export vs scrape; token vs OAuth vs cookie; why integrations break; how to de-risk a project in a day.

---

## Week 1 — One model call (due in 7 days)

**Goal:** the smallest possible agent-ish thing. One input, one structured output, five tests.

**Build:** a script that takes five messy announcement texts and returns `{title, due_at, weight, source_url}`. Put it in `src/`, tests in `tests/` (per the repo's conventions).

**Done when:**
- 5/5 cases produce valid JSON.
- It **rejects** output that cites a URL not present in the input. This is the trust rule from the plan, enforced in code on day one.
- A short note: *when must the model not be used?*

**What you'll learn:** API keys and cost, prompts vs. schemas, why structured output beats free text, why validation catches more than the model does, and how a test suite is the only thing standing between you and a confident liar.

**Why this module exists:** this is the whole product in miniature. Everything after it is plumbing and patience.

---

## If you fall behind

Skip the *polish*, never the *artifact*. A brief that prints three items beats a beautiful design for a brief that prints thirty. And if two weeks pass with nothing shipped, the problem is scope, not discipline — cut the module in half and ship that.

---

## The two questions this curriculum can't answer

1. **How many hours a week do you actually have?** Eight weeks assumes ~5. If it's 2, this is sixteen weeks and that's fine — but the calendar has to be honest or it becomes another failed plan.
2. **Is there an external deadline?** If this is for a unit, the unit's dates outrank mine and the modules get resequenced around them.
