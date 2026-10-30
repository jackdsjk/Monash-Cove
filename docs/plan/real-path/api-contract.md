# Local API Contract v1

Base URL in development: `http://127.0.0.1:4317`. The Web App uses `/api` via Vite proxy; production serves UI and API from the same origin.

## Common rules

- JSON only; UTF-8; timestamps are ISO 8601 with timezone (`2026-10-29T10:00:00.000Z`).
- Errors always use:

```json
{ "error": { "code": "not_found", "message": "Item not found", "retryable": false } }
```

- Browser state-changing requests must send an allowed `Origin` (`http://127.0.0.1:5174` or `http://127.0.0.1:4317`). Foreign origins get `403 forbidden_origin`.
- The browser never receives OAuth tokens, Ed tokens, or Moodle session cookies.

## GET /api/health

```json
{ "ok": true }
```

## GET /api/sources

```json
{
  "sources": [
    {
      "id": "gmail",
      "label": "Gmail",
      "status": "fixture",
      "lastSyncAt": null,
      "lastError": null,
      "itemCount": 25
    }
  ]
}
```

`status`: `connected | degraded | error | disconnected | fixture`.

## GET /api/brief?since=&source=&q=

- `since`: optional ISO timestamp; filters `publishedAt >= since`.
- `source`: optional `gmail | ed | moodle`.
- `q`: optional text search over title/course/body.

```json
{
  "items": [
    {
      "id": "gmail:18f...",
      "source": "gmail",
      "sourceItemId": "18f...",
      "course": "FIT1045",
      "title": "Deadline updated",
      "authorRole": "unknown",
      "publishedAt": "2026-10-29T10:00:00.000Z",
      "updatedAt": "2026-10-29T10:00:00.000Z",
      "url": "https://mail.google.com/...",
      "ageHours": 2.4,
      "dueAt": null,
      "deadlineKind": null,
      "contentHash": "sha256...",
      "contentType": "requirement_change",
      "importance": "critical",
      "actionRequired": "yes",
      "openOriginal": "required",
      "evidenceQuote": "the submission deadline has changed",
      "text": "The submission deadline has changed to Friday.",
      "triageVersion": "rules-v1",
      "model": "deterministic-rules",
      "read": false,
      "correction": { "pinned": false, "dismissed": false }
    }
  ],
  "sources": [],
  "syncedAt": "2026-10-29T10:01:00.000Z",
  "lastCheckedAt": null
}
```

## GET /api/moodle/courses

Requires a stored Moodle session. Returns:

```json
{ "courses": [{ "id": 46337, "shortname": "FIT1047_S2_2026", "fullname": "FIT1047 ..." }] }
```

## POST /api/moodle/content-sync

```json
{ "courseId": 46337 }
```

Fetches Moodle course sections and weekly activity links, then replaces the local cache for that course.

## GET /api/moodle/content?courseId=46337

Returns cached weekly rows: `sectionNumber`, `sectionTitle`, `module`, `title`, `url`, `text`, `updatedAt`.

## GET /api/moodle/download?url=

Server-side proxy for a Moodle **resource** page. Validates that `url` belongs to the configured Moodle origin and points at `/mod/resource/view.php`; follows the resource redirect to `pluginfile.php` and returns the file as an attachment. Not used for assignment submissions or arbitrary URLs.

## POST /api/moodle/download-batch

```json
{ "urls": ["https://learning.monash.edu/mod/resource/view.php?id=..."] }
```

Validates 1–100 Moodle resource URLs, downloads each with the local session, and returns one ZIP. Total uncompressed limit is 100 MB; failed/oversized files are skipped and reported via `x-cove-batch-count` / `x-cove-batch-skipped` headers.

## GET /api/items/:id

Returns one item in the same shape as `items[]`; `404` when missing.

## POST /api/check

```json
{ "ids": ["gmail:18f..."] }
```

Marks items read and stores `last_checked_at`. Response `{ "ok": true, "lastCheckedAt": "..." }`.

## PATCH /api/items/:id/correction

```json
{
  "pinned": true,
  "dismissed": false,
  "feedback": { "reason": "importance", "note": "optional", "at": "10:01" }
}
```

Returns the updated item. `404` when missing; values are persisted in SQLite.

## POST /api/sync/full

Starts a background full sync (`202`) and returns `{ job }`. All three sources are attempted; `full_sync_completed_at` is set only when every source succeeds.

## GET /api/sync/status

```json
{
  "fullSyncCompleted": false,
  "job": {
    "status": "running",
    "sources": {
      "gmail": { "status": "running", "processed": 134, "total": 678 },
      "ed": { "status": "pending", "processed": 0, "total": null },
      "moodle": { "status": "pending", "processed": 0, "total": null }
    }
  }
}
```

## POST /api/sync

```json
{ "source": "gmail" }
```

- `gmail`: requires OAuth token; returns `{ ok, source, synced, historyId, mode }`.
- `ed`: requires Ed credentials; returns `{ ok, source, synced }`.
- `moodle`: requires Moodle session; syncs assessments and forum posts; returns `{ ok, source, synced }`.
- `409 not_connected` when credentials are absent; `502 sync_failed` with retryable true.

## POST /api/sources/:source/credentials

Ed:

```json
{ "token": "...", "region": "au" }
```

Moodle:

```json
{ "baseUrl": "https://learning.monash.edu", "session": "..." }
```

Credentials are written to the local SecretStore, not SQLite or the response.

## POST /api/sources/:source/disconnect

Deletes the source credential and marks it `disconnected`.

## GET /api/oauth/google/start

Returns `{ "url": "https://accounts.google.com/..." }` for the desktop OAuth loopback flow. `503 oauth_not_configured` when env client id/secret are absent.

## GET /oauth/google/callback

Exchanges the code, stores tokens in Keychain, redirects to the Web App with `?connected=gmail|error`.

## DELETE /api/data

Deletes SQLite rows and source credentials, then marks all sources `disconnected`.
