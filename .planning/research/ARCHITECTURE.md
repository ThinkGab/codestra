# Architecture: MCP File Transport for Codestra v1.2

**Domain:** Hub & Spoke MCP orchestration — adding file artefact transport
**Researched:** 2026-04-26
**Based on:** Live source code of `servers/hub.mjs` (283 lines) and `servers/mcp-server.mjs` (467 lines)

---

## Summary

The existing architecture is a clean two-layer system: `hub.mjs` owns all shared state (workers Map, messages array) and exposes it via plain HTTP routes; `mcp-server.mjs` owns the MCP surface and proxies everything to the hub via `hubFetch()`. File transport must follow this same pattern exactly — hub owns file storage, MCP server owns the tool surface, hubFetch bridges them.

The key architectural constraint is that `hub.mjs` is intentionally the single source of truth for all shared state. Putting file storage directly in `mcp-server.mjs` would be in-process only, invisible to other workers (each worker runs its own `mcp-server.mjs` instance). Files must be stored in the hub so any worker can read what another worker uploaded.

---

## Storage Decision

**File storage belongs in `hub.mjs`, not `mcp-server.mjs`.**

Rationale:

- Each Claude Code instance runs its own `mcp-server.mjs` process. In-process storage in `mcp-server.mjs` is local only to that instance — other workers cannot access it.
- `hub.mjs` is the only shared singleton process on the LAN. All workers already converge on it for messages and registration.
- This is consistent with the existing pattern: messages array lives in hub, not in the MCP server.
- In-memory storage in hub is explicitly the v1.x philosophy (PROJECT.md: "Hub gestisce storage in-memory").

Implementation: add a new `files` Map to `hub.mjs` state section alongside `workers` and `messages`.

```javascript
// hub.mjs — new state entry (alongside existing workers and messages)
/** @type {Map<string, {swarmId: string, filename: string, content: string, contentType: string, size: number, uploadedAt: string, uploadedBy: string}>} */
const files = new Map(); // key: `${swarmId}/${filename}`
```

---

## HTTP Route Design

Add five new routes to the `routes` object in `hub.mjs`. They follow the existing handler signature `(req, res, params)` exactly.

### Routes

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/files/:swarmId/:filename` | Upload or overwrite a file |
| `GET` | `/files/:swarmId/:filename` | Download a single file |
| `GET` | `/files/:swarmId` | List files in a swarm namespace |
| `DELETE` | `/files/:swarmId/:filename` | Delete a single file |
| `DELETE` | `/files/:swarmId` | Delete all files in a swarm namespace |

### Route Handler Signatures

All follow the existing `routes` object pattern:

```javascript
"PUT /files/:swarmId/:filename": async (req, res, params) => { ... }
"GET /files/:swarmId/:filename": (_req, res, params) => { ... }
"GET /files/:swarmId": (_req, res, params) => { ... }
"DELETE /files/:swarmId/:filename": (_req, res, params) => { ... }
"DELETE /files/:swarmId": (_req, res, params) => { ... }
```

### Route Implementation Notes

**PUT `/files/:swarmId/:filename`**
- Read body via `readBody(req)` — existing helper, 1 MB max
- Body JSON: `{ content: string, contentType?: string, uploadedBy?: string }`
- Store under key `${params.swarmId}/${params.filename}`
- Return `{ ok: true, file: { swarmId, filename, size, uploadedAt } }`
- 400 if `content` field is missing

**GET `/files/:swarmId/:filename`**
- Look up key in `files` Map
- 404 if not found
- Return full file record including `content`

**GET `/files/:swarmId`**
- Iterate `files` Map, filter entries whose key starts with `${params.swarmId}/`
- Return metadata only (no `content` field) — list response, not download
- Return `{ files: [{ swarmId, filename, size, uploadedAt, uploadedBy }] }`

**DELETE `/files/:swarmId/:filename`**
- `files.delete(key)`; 404 if not found
- Return `{ ok: true }`

**DELETE `/files/:swarmId`**
- Collect all keys starting with `${params.swarmId}/`, delete each
- Return `{ ok: true, deleted: count }`

### Router Compatibility

The existing `matchRoute()` function in `hub.mjs` (lines 233–258) handles parameterized routes by splitting on `/` and counting segments. A path like `/files/:swarmId/:filename` has 3 segments; `/files/:swarmId` has 2 segments. These are distinct lengths so `matchRoute()` handles them correctly without modification. No router changes needed.

The existing `readBody()` helper (lines 43–64) is reused for PUT. No new helpers needed.

---

## MCP Tool Design

Add four new tools to `mcp-server.mjs`. Each proxies to a hub HTTP route via `hubFetch()`, following the exact pattern of existing tools (try/catch, isError: true on failure).

### Tools

| Tool name | Hub route | Description |
|-----------|-----------|-------------|
| `file_upload` | `PUT /files/:swarmId/:filename` | Upload a file artefact to hub |
| `file_download` | `GET /files/:swarmId/:filename` | Download a file artefact from hub |
| `file_list` | `GET /files/:swarmId` | List files in a swarm namespace |
| `file_delete` | `DELETE /files/:swarmId/:filename` | Delete a specific file |

### Namespace Parameter: swarmId

**Use the worker's registered SWARM_ID (`INSTANCE_ID` module variable) as the default, with an optional override parameter.**

Rationale:
- Workers already register with a `SWARM_ID` (WORKER-03, validated v1.1). This ID is stored as `INSTANCE_ID` at the top of `mcp-server.mjs` (line 24: `const INSTANCE_ID = process.env.SWARM_ID || ""`).
- Using it as default means workers in the same swarm share a file namespace automatically, without the caller needing to pass it explicitly.
- An explicit `swarmId` parameter allows cross-swarm file access (leader reading worker output, etc.).

```javascript
// mcp-server.mjs tool schema pattern
{
  swarmId: z.string().optional().describe(
    "Swarm namespace (default: this instance's SWARM_ID)"
  ),
  filename: z.string().describe("File name"),
  // ... other fields
}
```

Inside each handler, resolve: `const ns = swarmId || INSTANCE_ID || "default"`.

### Tool Schemas

**`file_upload`**
```javascript
{
  filename: z.string().describe("File name"),
  content: z.string().describe("File content (text)"),
  swarmId: z.string().optional().describe("Swarm namespace (default: this instance's SWARM_ID)"),
  contentType: z.string().optional().describe("MIME type (default: text/plain)"),
}
```

**`file_download`**
```javascript
{
  filename: z.string().describe("File name to download"),
  swarmId: z.string().optional().describe("Swarm namespace (default: this instance's SWARM_ID)"),
}
```

**`file_list`**
```javascript
{
  swarmId: z.string().optional().describe("Swarm namespace to list (default: this instance's SWARM_ID)"),
}
```

**`file_delete`**
```javascript
{
  filename: z.string().describe("File name to delete"),
  swarmId: z.string().optional().describe("Swarm namespace (default: this instance's SWARM_ID)"),
}
```

### hubFetch Usage

PUT requires a non-JSON body for the file route. Use the existing `hubFetch()` helper — it already sets `Content-Type: application/json` and the Authorization header. The file `content` field is a string embedded in the JSON body, so no raw binary handling is needed for v1.2 (plain text artefacts only).

```javascript
// file_upload handler pattern
const ns = swarmId || INSTANCE_ID || "default";
const data = await hubFetch(`/files/${encodeURIComponent(ns)}/${encodeURIComponent(filename)}`, {
  method: "PUT",
  body: JSON.stringify({ content, contentType: contentType || "text/plain", uploadedBy: INSTANCE_ID }),
});
```

---

## Data Flow

### Upload: Worker A writes an artefact

```
Worker A (Claude Code)
  └─ calls file_upload(filename, content, swarmId?)
       └─ mcp-server.mjs: file_upload handler
            └─ hubFetch("PUT /files/{swarmId}/{filename}", {content})
                 └─ hub.mjs: "PUT /files/:swarmId/:filename" route
                      └─ files.set(`${swarmId}/${filename}`, record)
                      └─ returns { ok: true, file: metadata }
            └─ returns text: "Uploaded {filename} to swarm {swarmId}"
```

### Download: Worker B reads the artefact

```
Worker B (Claude Code)
  └─ calls file_download(filename, swarmId)
       └─ mcp-server.mjs: file_download handler
            └─ hubFetch("GET /files/{swarmId}/{filename}")
                 └─ hub.mjs: "GET /files/:swarmId/:filename" route
                      └─ files.get(`${swarmId}/${filename}`)
                      └─ returns { file: { content, contentType, ... } }
            └─ returns content field as text to Claude
```

### Leader listing worker outputs

```
Leader (Claude Code)
  └─ calls file_list(swarmId: "worker-abc")
       └─ mcp-server.mjs: file_list handler
            └─ hubFetch("GET /files/worker-abc")
                 └─ hub.mjs: "GET /files/:swarmId" route
                      └─ filters files Map by prefix "worker-abc/"
                      └─ returns { files: [...metadata] }
            └─ returns formatted table of files
```

### Authorization

All hub routes go through the existing `authorize()` check (line 262 in hub.mjs: `if (!authorize(req, res)) return;`). The new file routes are registered in the `routes` object so they automatically receive the same auth gate. No additional auth logic needed.

---

## Integration Points with Existing Code

### hub.mjs changes (minimal, additive only)

| Location | Change | Type |
|----------|--------|------|
| Line 27–31 (State section) | Add `const files = new Map()` | New state |
| Lines 117–229 (routes object) | Add 5 new file route handlers | New entries |
| No other changes | `matchRoute`, `authorize`, `readBody`, `json`, server setup all unchanged | — |

### mcp-server.mjs changes (additive only)

| Location | Change | Type |
|----------|--------|------|
| After line 384 (`swarm_kill_worker` tool) | Add 4 new tool registrations | New tools |
| `INSTANCE_ID` (line 24) | Already exists, used as default namespace | No change |
| `hubFetch()` (line 29) | Already handles all HTTP methods, reused as-is | No change |
| No other changes | `startWorkerServer`, lifecycle, shutdown all unchanged | — |

### No new files required

Both changes are purely additive to existing files. No new modules, no new dependencies.

---

## Build Order

**Phase 1: Hub HTTP routes** (prerequisite — must come first)

Implement all 5 file routes in `hub.mjs`. Testable in isolation with `curl` against a running hub before any MCP work. The hub can be tested independently because it exposes a plain HTTP API.

Verification: `curl -X PUT localhost:7800/files/test/hello.txt -d '{"content":"hello"}'`

**Phase 2: MCP tool wrappers** (depends on Phase 1)

Add 4 tools to `mcp-server.mjs`. Each tool is a thin proxy — the logic lives in the hub. Tests require a running hub (Phase 1 complete).

**Rationale for this order:**
- Hub routes are testable without MCP tooling
- MCP tools are useless without hub routes
- Hub is the only change shared across all worker instances — validate it first
- If Phase 1 route design reveals issues (naming, body shape), fixing before Phase 2 avoids rework in MCP layer

**Within Phase 1, route implementation order:**

1. `PUT /files/:swarmId/:filename` — core upload
2. `GET /files/:swarmId/:filename` — core download
3. `GET /files/:swarmId` — listing (needs upload to have test data)
4. `DELETE /files/:swarmId/:filename` — single delete
5. `DELETE /files/:swarmId` — namespace delete (lowest priority for MVP)

---

## Constraints and Constraints Carried Forward

| Constraint | Source | Impact on file transport |
|------------|--------|-------------------------|
| No TypeScript, no framework, no bundler | PROJECT.md | Pure ESM, no new dependencies |
| `@modelcontextprotocol/sdk` v1.12.0 | PROJECT.md | Tool registration pattern already established, no API changes |
| In-memory only (no persistence) | PROJECT.md | Files lost on hub restart — document this |
| 1 MB readBody limit in hub | hub.mjs line 43 | File content is capped at ~1 MB; sufficient for text artefacts |
| LAN-only, no TLS | PROJECT.md | File content transmitted in plaintext — acceptable per project scope |
| SWARM_ID already on worker record | mcp-server.mjs line 24, hub.mjs line 131 | Use as namespace default without any new plumbing |

## Open Questions / Flags for Phase Planning

- **Binary content:** v1.2 targets text artefacts (code, markdown, JSON). If binary support is needed later, the `content` string field must become base64 and the 1 MB readBody limit becomes a real constraint earlier. Flag for v1.3.
- **Namespace isolation enforcement:** Currently any worker can read any swarm's files (no ownership check). This is consistent with how messages work (any worker can poll any worker's messages). Acceptable for trusted LAN — document explicitly.
- **File eviction:** In-memory files accumulate for the hub's lifetime. A `DELETE /files/:swarmId` on worker deregister could be wired to the existing `DELETE /workers/:id` route as a cleanup step. Not required for MVP but flag as a moderate-priority addition.
