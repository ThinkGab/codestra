# Research Summary: Codestra v1.2 — MCP File Transport

**Project:** Codestra — Hub & Spoke MCP orchestration
**Milestone:** v1.2 — MCP File Transport
**Researched:** 2026-04-26
**Confidence:** HIGH (all four files grounded in live source code + verified MCP spec + official SDK)

---

## Summary

- Zero new npm packages required. File transport is built entirely on `Buffer`, `Map`, `crypto`, and the already-installed `@modelcontextprotocol/sdk` v1.12.0.
- The only correct architecture is hub-owned storage: files live in a new `Map` in `hub.mjs` (the sole shared singleton), exposed via plain HTTP routes, proxied to the LLM via four new MCP tools in `mcp-server.mjs`.
- Three hard constraints dominate all design decisions: (1) the existing `readBody` 1 MB cap must be replaced with a new `readRawBody` helper for file routes; (2) `file_download` must paginate from day one because 1 MB base64 equals approximately 350k tokens, 14x Claude Code's 25k-token MCP output limit; (3) `file_upload` MVP is text-only at 50 KB max because the LLM cannot emit large base64 as a tool argument.

---

## Stack Additions

No changes to `package.json`. All additions are in-process.

| Component | Addition | Rationale |
|-----------|----------|-----------|
| `hub.mjs` state | `const files = new Map()` keyed by `swarm_id` | Matches existing `workers`/`messages` pattern; hub is the only shared singleton |
| `hub.mjs` helpers | `readRawBody(req, maxBytes)` with configurable `SWARM_FILE_MAX_BYTES` env var | Replaces 1 MB `readBody` cap for file routes only; existing routes untouched |
| `hub.mjs` routes | 5 new HTTP routes (`PUT`, `GET x2`, `DELETE x2`) on `/files/:swarmId/...` | Plain handler pattern; `matchRoute()` handles them without modification |
| `mcp-server.mjs` tools | 4 new `server.tool()` registrations at module level | Same `hubFetch` proxy pattern as `swarm_send_message` |
| Encoding | `Buffer.from(str, 'base64')` / `buf.toString('base64')` — standard base64 only | MCP spec requires standard (not URL-safe) base64 for all binary content fields |
| File IDs | `crypto.randomBytes(8).toString('hex')` as Map key | UUID keys prevent path traversal; client filename stored as metadata only |

**Critical non-addition:** MCP Resources (`server.registerResource`) must NOT be used. Resources are host-controlled and read-only; the LLM cannot invoke them autonomously. All four operations must be MCP Tools.

---

## Feature Table Stakes

The four operations are the complete v1.2 surface. Nothing else ships.

| MCP Tool | Hub Route | Blocks without |
|----------|-----------|----------------|
| `file_upload` | `PUT /files/:swarmId/:filename` | No write path — transport is unusable |
| `file_download` | `GET /files/:swarmId/:filename` | No read path — artifact handoff impossible |
| `file_list` | `GET /files/:swarmId` | Workers cannot discover what exists without knowing exact names |
| `file_delete` | `DELETE /files/:swarmId/:filename` | Memory accumulates unboundedly without explicit cleanup |

**Required metadata per file entry:** `swarm_id`, `filename`, `content` (base64), `mime_type`, `size` (decoded bytes, not base64 length), `uploaded_at` (ISO 8601), `uploaded_by` (worker registration ID).

**Differentiators (build alongside table stakes, low cost):**
- `content_type` auto-detection by filename extension (no external lib)
- Overwrite semantics on re-upload (idempotent retries)
- `uploaded_by` filter on `file_list`
- `DELETE /files/:swarmId` (namespace wipe — useful for cleanup)

**Deferred to v1.3+:**
- Binary file upload (requires two-step flow — LLM cannot emit large base64 as tool arg)
- Chunked streaming upload
- TTL-based auto-eviction (acceptable to defer; document that files are ephemeral)
- Persistent storage (explicitly out of scope for entire v1.x line)

---

## Architecture Overview

The two-layer pattern is fixed and must not be violated: hub owns state, MCP server owns the tool surface, `hubFetch` bridges them. Putting file storage in `mcp-server.mjs` is architecturally wrong — each Claude Code instance runs its own MCP server process; only `hub.mjs` is a shared singleton.

**Build order is strict:**

1. **Hub HTTP routes first** — testable with `curl` before any MCP work; MCP tools are useless without them
2. **MCP tool wrappers second** — thin proxies only; all logic lives in the hub

**Hub storage key:** `${swarmId}/${filename}` as a composite string in a flat `Map` (consistent with existing code, no extra indirection).

**Data flow (upload):**
```
LLM calls file_upload(filename, content, swarmId?)
  -> mcp-server.mjs handler resolves ns = swarmId || INSTANCE_ID
  -> hubFetch("PUT /files/{ns}/{filename}", { content, contentType, uploadedBy })
  -> hub.mjs stores record under key "{ns}/{filename}"
  -> returns { ok: true, file: metadata }
  -> MCP tool returns text confirmation
```

**Authorization:** Existing `authorize()` in hub.mjs covers all new routes automatically — they are registered in the same `routes` object. No new auth logic needed.

**`swarmId` parameter:** Optional in all four MCP tools; defaults to `INSTANCE_ID` (already `process.env.SWARM_ID` at mcp-server.mjs line 24). Workers in the same swarm share a namespace automatically.

---

## Critical Constraints

These pitfalls are not optional to handle — they shape what is even buildable in v1.2.

### C-1 (CRITICAL): Replace `readBody` with `readRawBody` for file routes

The existing `readBody(req)` hard-caps at 1 MB and calls `req.destroy()` on overflow — no HTTP 413 is sent, the connection is torn, and the caller gets a cryptic `ECONNRESET`. Any file upload route that reuses `readBody` will fail for files over 1 MB. A new `readRawBody(req, maxBytes)` helper must be written for file routes with a configurable cap (`SWARM_FILE_MAX_BYTES`, default 10 MB). The existing `readBody` must remain unchanged to protect all other routes.

### C-2 (CRITICAL): `file_download` must paginate from day one

MCP tool responses travel as a single JSON-RPC line over stdio. Claude Code's default `MAX_MCP_OUTPUT_TOKENS` is 25,000 tokens. A 1 MB file base64-encoded is approximately 350,000 tokens — 14x the limit. The `file_download` tool must accept `offset` and `max_bytes` parameters and return at most approximately 32 KB per call (approximately 8,000 tokens). A hard cap refusing downloads over 100 KB without pagination is required as a safety net.

### C-3 (CRITICAL): `file_upload` MVP is text-only, 50 KB maximum

MCP tool input parameters are LLM-generated tokens. The LLM's output token limit for a single tool call is approximately 32,000 tokens. A 1 MB file as base64 requires approximately 350,000 output tokens — physically impossible. The MVP `file_upload` must restrict to text content only, maximum 50 KB (approximately 12,500 tokens), and the tool description must state this limit explicitly so Claude does not attempt oversized uploads. Binary file upload is deferred to v1.3 (requires a two-step flow where Claude uploads metadata and the worker's non-MCP HTTP path handles bytes).

### C-4 (CRITICAL): No `console.log` or `process.stdout.write` in any new handler

The MCP stdio transport uses `process.stdout` exclusively for JSON-RPC frames. Any byte written to stdout outside the SDK corrupts the framing — all tools become unreachable and Claude Code reports the server as disconnected. Every new file tool handler must use `process.stderr.write(...)` for diagnostics. Grep for `console.log` before every commit (this bug was fixed in v1.1 and must not resurface).

### C-5 (CRITICAL): UUID keys only — client filename is metadata, never a Map key or path component

Storing files under client-supplied filenames creates a path traversal vector. Even in a pure in-memory store, crafted filenames (`../../etc/passwd`) can confuse listing output and pre-position for a future persistence layer. All files are stored under a server-generated `crypto.randomBytes(8).toString('hex')` key. The original filename is stored as metadata and validated on receipt (regex `^[\w\-. ]+$`, no `..`, no `/`, no null bytes). `file_list` returns both the UUID and the original filename.

### C-6 (HIGH): Per-swarm file count cap and OOM documentation

In-memory Buffers are orders of magnitude larger than message strings. Without a per-swarm file count cap (e.g. 50 files) and per-file size cap (enforced at upload), a long-running swarm can OOM the hub, destroying all workers, messages, and files simultaneously. Add the cap at upload time. Document clearly in SKILL.md that files are ephemeral (hub restart clears all state) and instruct workers to call `file_delete` on artifacts after consumption.

---

## Recommended Phase Structure

### Phase 1: Hub File Routes

**Rationale:** The hub is the only shared singleton and is independently testable with `curl`. MCP tools are useless without it. All downstream work depends on these routes being correct.

**Delivers:** Five HTTP routes on `hub.mjs`, a new `readRawBody` helper, the `files` Map with UUID-keyed storage.

**Implements:**
- `const files = new Map()` in hub.mjs state section
- `readRawBody(req, maxBytes)` helper with `SWARM_FILE_MAX_BYTES` env var
- All 5 route handlers following existing `(req, res, params)` signature
- UUID key generation via `crypto.randomBytes`
- Filename validation (reject traversal attempts)
- Per-swarm file count cap

**Pitfalls to bake in:** C-1 (`readRawBody`), C-5 (UUID keys), C-6 (count cap)

**Research flag:** Standard patterns — no deeper research needed. Existing hub.mjs is the complete template.

### Phase 2: MCP Tool Wrappers

**Rationale:** Four thin proxy tools; all logic lives in Phase 1. Cannot proceed until hub routes are curl-verified.

**Delivers:** `file_upload`, `file_download`, `file_list`, `file_delete` as MCP tools in `mcp-server.mjs`. Updated SKILL.md with size limits, encoding expectations, and ephemeral semantics.

**Implements:**
- Four `server.tool()` registrations at module level (not inside `swarm_register`)
- `swarmId` defaults to `INSTANCE_ID`
- `file_upload`: validates content is text, enforces 50 KB cap before calling hub
- `file_download`: `offset` + `max_bytes` pagination parameters, hard cap at 100 KB without offset
- `file_list`: optional `uploaded_by` filter
- All `hubFetch` calls wrapped in try/catch (WR-04 pattern)
- Tool descriptions include explicit size limits and encoding requirements

**Pitfalls to bake in:** C-2 (pagination), C-3 (50 KB text-only), C-4 (no stdout), P-MCP3 (module-level registration)

**Research flag:** Standard patterns — follows existing `swarm_send_message` / `swarm_read_messages` exactly.

### Phase 3: SKILL.md Update and Integration Test

**Rationale:** Claude agents need declarative instructions to use file tools correctly. Without accurate SKILL.md documentation, the LLM will attempt oversized uploads, forget to paginate downloads, and misunderstand the ephemeral semantics.

**Delivers:** Updated SKILL.md documenting all four tools, size constraints, the text-only MVP limitation, base64 encoding expectations, swarm namespace behavior, and cleanup responsibility. End-to-end test of a two-worker artifact handoff (upload on Worker A, list and download on Worker B).

**Pitfalls to bake in:** P-M3 (ephemeral semantics must be documented), P-MCP2 (size limits in tool descriptions)

**Research flag:** No research needed — content is derived from Phase 1 and 2 implementation decisions.

### Phase Ordering Rationale

- Hub routes must precede MCP tools (independently testable; MCP tools have no value without them)
- Security constraints (C-5: UUID keys) must be in Phase 1 — retrofitting path traversal protection is much harder than building it in from the start
- Pagination (C-2) must be in Phase 2 — adding it after the fact requires a breaking change to the tool schema
- SKILL.md is Phase 3 because it documents final implementation decisions, not aspirational ones

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages; Buffer/Map/crypto are Node.js core; SDK API verified via Context7 and npm |
| Features | HIGH | Four operations cover all six identified use cases; anti-features explicitly reasoned |
| Architecture | HIGH | Based on live source code of hub.mjs (283 lines) and mcp-server.mjs (467 lines) |
| Pitfalls | HIGH | MCP token limits verified against Claude Code issues; readBody behavior verified in source |

**Overall confidence:** HIGH

### Gaps to Address

- **Binary upload protocol (v1.3):** The two-step flow (metadata upload + out-of-band byte transfer via Bash tool) is identified as the right pattern but not designed in detail. Flag when v1.3 is planned.
- **TTL eviction interaction with hub lifecycle:** P-M2 recommends a `setInterval` every 5-10 minutes. Verify that `clearInterval` is called on SIGTERM alongside the existing `httpServer.close()` pattern. Not blocking for v1.2 since eviction is deferred, but must be clean if added.
- **Swarm namespace cross-access:** Any worker with `SWARM_SECRET` can read any swarm's files. This is a documented trust boundary, not a gap to close in v1.2, but it must be explicit in SKILL.md.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/modelcontextprotocol/typescript-sdk` — tool registration, `server.tool()` API, content types
- MCP spec 2025-06-18 — `ImageContent.data` base64, `BlobResourceContents.blob` base64, stdio framing
- `servers/hub.mjs` live source (283 lines) — `readBody`, `matchRoute`, `authorize`, state pattern
- `servers/mcp-server.mjs` live source (467 lines) — `hubFetch`, `INSTANCE_ID`, tool registration pattern
- npm registry — `@modelcontextprotocol/sdk` 1.12.0 installed, 1.29.0 latest (no upgrade needed)

### Secondary (HIGH confidence — verified community issues)
- Claude Code issue #9152 — token limit for MCP image responses
- Claude Code issue #12241 — large MCP tools context warning (25k token default cap)
- MCP discussion #2211 — MCP response size limits
- Python SDK issue #342 — URL-safe vs. standard base64 mismatch
- Chrome DevTools MCP issue #570 — stdout corruption via console.log in stdio transport

### Tertiary (supporting)
- MCP file handling practitioner blog — binary content patterns
- Base64 inflation ratio (Lemire, 2019) — 33% overhead calculation underpinning C-2 token math
- CVE-2025-27210 — Node.js path traversal on Windows (device name reserved names)

---

*Research completed: 2026-04-26*
*Ready for roadmap: yes*
