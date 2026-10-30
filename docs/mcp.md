# Cove MCP

Cove exposes a **local, read-only MCP interface** so another agent can use the same data the Cove Web App sees.

The MCP server is a bridge over the local Cove API. It does not copy credentials, call source sites directly, or upload data.

## Transports

| Transport | Endpoint / command | Use |
|---|---|---|
| stdio | `node local-service/dist/mcp-stdio.js` | Claude Desktop, Codex, DSH and other local MCP clients |
| Streamable HTTP | `POST/GET/DELETE http://127.0.0.1:4317/mcp` | Clients that support remote MCP over HTTP |

For desktop builds, prefer **stdio**: the desktop app chooses a random local port. If using HTTP, set `COVE_PORT` to a fixed port when launching the desktop app or the local service.

## Prerequisites

1. Start Cove local-service:

```bash
cd local-service
npm run dev
```

2. Build the MCP bridge:

```bash
npm run build
```

3. Confirm the API:

```bash
curl http://127.0.0.1:4317/api/health
```

## stdio setup

Use an **absolute path** to `mcp-stdio.js`.

### Claude Desktop / generic MCP client

```json
{
  "mcpServers": {
    "cove": {
      "command": "node",
      "args": ["/absolute/path/to/Monash Agent/local-service/dist/mcp-stdio.js"],
      "env": {
        "COVE_API_URL": "http://127.0.0.1:4317"
      }
    }
  }
}
```

### Codex / DSH

Use the same command/args in the MCP server configuration for that host. The bridge writes protocol messages to stdout and diagnostics to stderr, so do not wrap it in a shell that prints to stdout.

### Manual test

```bash
cd local-service
node dist/mcp-stdio.js
```

It will wait on stdin. An MCP client should launch it; do not pipe arbitrary logs into it.

## Streamable HTTP setup

Start the service on the fixed port (default):

```bash
cd local-service
npm run dev
```

Configure the client with:

```text
http://127.0.0.1:4317/mcp
```

The endpoint supports the MCP Streamable HTTP flow, including session initialization, tool listing, and tool calls. It is bound to loopback by the local service; do not expose it on `0.0.0.0`.

## Tools

| Tool | What it returns |
|---|---|
| `cove_brief` | Current brief items; optional `source`, `sinceHours`, `q`, `onlyAction`, `limit` |
| `cove_get_item` | One item with source text, evidence quote, URL, due date, and triage fields |
| `cove_deadlines` | Moodle assessments with due dates, nearest first |
| `cove_sources` | Gmail / Ed / Moodle connection status and counts |
| `cove_sync_status` | Full-sync completion and current sync progress |
| `cove_courses` | Moodle courses visible in the local account |
| `cove_materials` | Cached Moodle sections/materials for one course; optional campus `region` |

### Example: `cove_brief`

Request:

```json
{
  "name": "cove_brief",
  "arguments": {
    "source": "moodle",
    "sinceHours": 72,
    "onlyAction": true,
    "limit": 10
  }
}
```

The response is a JSON text block:

```json
{
  "items": [
    {
      "id": "moodle:assessment:...",
      "source": "moodle",
      "course": "FIT1045_S2_2026",
      "title": "Portfolio Submission is due",
      "importance": "critical",
      "actionRequired": "yes",
      "dueAt": "2026-11-02T...",
      "url": "https://learning.monash.edu/...",
      "evidenceQuote": "..."
    }
  ],
  "returned": 1
}
```

### Example: `cove_get_item`

```json
{
  "name": "cove_get_item",
  "arguments": {
    "id": "moodle:assessment:2416880"
  }
}
```

Returns the full item text and evidence so the external agent can quote the source rather than invent a summary.

## Agent instructions

A good system prompt for the external agent:

```text
Cove is a local read-only campus triage source. Use cove_brief for the current
brief, cove_deadlines for dates, and cove_get_item before making a claim about
an item. Never invent a deadline, course, or source quote. If Cove returns
`isError`, report that the local Cove service is unavailable instead of guessing.
Cite the item's URL when giving the user advice.
```

## Security boundary

- read-only: no sync, download, credential, correction, or submit tool is exposed;
- the MCP bridge never receives Gmail/Ed/Moodle passwords;
- credentials stay in the local-service Keychain/secret store;
- the HTTP endpoint is loopback-only and has no remote authentication;
- do not expose `4317` to a LAN or the internet;
- each user runs their own Cove and own MCP server.

## Limitations

- Local service must be running before tool calls;
- desktop app random port means HTTP clients need a fixed port or stdio;
- MCP server is single-user; it is not a shared team endpoint;
- `cove_materials` returns cached content; it does not trigger a sync.
