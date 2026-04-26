# Domain Pitfalls: MCP File Transport on Codestra Hub

**Milestone:** v1.2 — MCP File Transport
**System:** hub.mjs (Node.js HTTP, in-memory Map) + mcp-server.mjs (stdio MCP, @modelcontextprotocol/sdk v1.12.0)
**Researched:** 2026-04-26
**Confidence:** HIGH (findings grounded in source code + official MCP spec + verified community issues)

---

## Summary

Adding file transport to Codestra introduces five distinct risk areas. The most dangerous is the
existing `readBody` 1 MB hard cap in hub.mjs — any file upload route that reuses the current helper
will silently reject files larger than 1 MB with a TCP `req.destroy()`, no 413 response. The second
most dangerous is stdout corruption: the v1.1 fix redirected console.log to stderr, but any new
file tool that uses `console.log`, `process.stdout.write`, or imports a dependency that writes to
stdout will break the stdio transport immediately and silently. Every other pitfall is significant
but recoverable in code review.

---

## 1. Memory / Storage Pitfalls

### P-M1 (CRITICAL) — `readBody` 1 MB cap blocks all file uploads

**What goes wrong:** `hub.mjs` line 43 calls `readBody(req)` with `maxBytes = 1_048_576` (1 MB).
The implementation calls `req.destroy()` on overflow and rejects the promise — no HTTP 413 is
sent to the client, the connection is torn, and the caller receives a network error. Any file
upload route that reuses this helper without raising the limit will silently fail for files over
1 MB. This is the current default for every POST route.

**Root cause:** The 1 MB guard was intentional for message bodies, but the file upload route has
a fundamentally different size profile.

**Consequences:** Uploads of source files, test outputs, or any artifact over 1 MB fail with a
cryptic connection reset. The worker calling the MCP tool gets `isError: true` but no actionable
message.

**Prevention:**
- Add a separate `readRawBody(req, maxBytes)` helper in hub.mjs for file routes, with the
  limit raised to a configurable value (e.g. `FILE_MAX_BYTES = parseInt(process.env.SWARM_FILE_MAX_BYTES || "10485760")` — 10 MB default).
- The existing `readBody` must not be changed — it protects all other routes.
- Send a proper HTTP 413 response before destroying the request.

**Detection:** Upload a 2 MB file via the tool; the worker HTTP call will throw `ECONNRESET`.

---

### P-M2 (HIGH) — Unbounded in-memory store causes OOM under sustained use

**What goes wrong:** The hub stores workers and messages in module-level `Map` / `Array` with no
eviction. Adding a `Map<fileId, { swarmId, filename, data: Buffer, uploadedAt }>` with the same
pattern means files accumulate indefinitely. 10 workers each uploading 5 MB of artifacts = 50 MB
per swarm session with no cleanup. The hub process has no memory cap — Node.js will use whatever
the OS gives it until it is OOM-killed.

**Root cause:** The existing design is acceptable for small messages (strings). Buffers are orders
of magnitude larger and never cleared.

**Consequences:** Hub OOM crash mid-session; all registered workers, messages, and files are lost
simultaneously (no persistence). A restart starts clean — workers must re-register.

**Prevention:**
- Enforce a per-file size cap (enforced at upload time, e.g. 10 MB).
- Enforce a per-swarm file count cap (e.g. 50 files).
- Add TTL eviction: a `setInterval` every 5–10 minutes deletes files older than N minutes
  (configurable via `SWARM_FILE_TTL_MS`). 30 minutes is a reasonable default for coordination
  artifacts.
- Log evictions to stderr so operators can tune limits.

**Detection:** Monitor `process.memoryUsage().heapUsed` in the `/health` endpoint response.

---

### P-M3 (MEDIUM) — Hub restart silently loses all uploaded files

**What goes wrong:** All state is in-memory. If the hub restarts (crash, redeploy, SIGTERM), all
files vanish. Workers that uploaded a file and later call `file_download` will receive 404.

**Root cause:** By design — the same applies to workers and messages today.

**Consequences:** Silent data loss mid-session. Workers that uploaded files for a later phase of
the task will fail silently when downloading.

**Prevention:**
- Document this clearly in SKILL.md: files are ephemeral, scoped to a single hub session.
- `file_upload` tool response should include an explicit `"ephemeral": true` field so Claude
  understands the semantic.
- Consider a `file_exists` / `file_list` tool call before assuming a file is still present.

---

## 2. Transport / Encoding Pitfalls

### P-T1 (CRITICAL) — stdout write in any new tool handler corrupts the stdio transport

**What goes wrong:** `@modelcontextprotocol/sdk` stdio transport uses `process.stdout` exclusively
for newline-delimited JSON-RPC frames. Any byte written to stdout outside of the SDK — including
from `console.log`, `process.stdout.write`, or any imported module that writes startup banners —
breaks the framing. The client sees a non-JSON line and either ignores it (emitting parse warnings)
or closes the connection with error -32000.

**Root cause:** This is the exact bug fixed in v1.1 (console.log → stderr). The risk resurfaces
any time new code is added, especially file tools that might log "uploaded N bytes" for debugging.

**Consequences:** All MCP tools become unreachable. Claude Code reports the MCP server as
disconnected. The failure is silent from the hub's perspective.

**Prevention:**
- Every new tool handler: use `process.stderr.write(...)` for any diagnostic output, never
  `console.log` or `process.stdout.write`.
- Add a lint rule or code review checklist item: grep for `console.log` and `process.stdout.write`
  in mcp-server.mjs before shipping.
- Watch out for transitive dependencies: if a new npm package (e.g. a mime-type library) writes
  to stdout on import, it will break the transport on startup before any tool is called.

**Detection:** Call any MCP tool immediately after adding new code. A parse error in Claude's
MCP client output means stdout was polluted.

---

### P-T2 (HIGH) — Base64 inflation causes MCP tool response to exceed Claude's token limit

**What goes wrong:** MCP tool responses in the stdio transport are single JSON-RPC lines. The
`file_download` tool must return file content to Claude. Base64 encoding inflates binary data by
~33% (3 bytes → 4 chars). A 1 MB binary file becomes ~1.4 MB of base64 string. When returned as
a `text` content block in a tool result, Claude Code must fit this into its context window.

Known Claude Code limits:
- Default `MAX_MCP_OUTPUT_TOKENS`: 25,000 tokens (configurable via env var).
- A base64-encoded 1 MB file is approximately 1.4 M characters ≈ 350,000 tokens.
- This is 14x the default limit. The tool call will fail with "MCP tool response exceeds maximum
  allowed tokens".
- This limit exists at the MCP client (Claude Code), not the SDK or transport layer.

**Root cause:** MCP stdio tool responses are not streamed — the entire response is one JSON-RPC
line. File content embedded in text blocks is treated as LLM context, not as a file handle.

**Consequences:** `file_download` for any non-trivial file fails. Claude Code raises a token
overflow error. The worker receives `isError: true`.

**Prevention (in priority order):**
1. Design `file_download` to return content in chunks via a `max_bytes` / `offset` parameter
   (pagination). Each call returns ≤ 32 KB of base64 content (≈ 8,000 tokens — safely under limit).
2. For the initial implementation, enforce a hard cap: `file_download` refuses requests for files
   over 100 KB unless `offset` is specified. This prevents accidental oversized responses.
3. Do NOT return raw binary in text content blocks. Always base64-encode binary; always note the
   encoding in the response metadata.
4. The `resource_link` pattern (returning a URI instead of content) is the SDK-recommended
   approach for large resources — but it requires the MCP client to fetch the resource separately,
   which Claude Code may not do automatically for tool results.

**Detection:** Call `file_download` on a 500 KB file; Claude Code will report token overflow.

---

### P-T3 (MEDIUM) — URL-safe vs. standard base64 mismatch causes validation failures

**What goes wrong:** The MCP Python SDK has a confirmed bug (issue #342) where the server encodes
binary resources using URL-safe base64 (`-` and `_`) but the client validator expects standard
base64 (`+` and `/`). The TypeScript SDK may have analogous edge cases in `image` content blocks.

**Root cause:** The MCP spec says binary blob fields use base64, but does not explicitly require
standard vs. URL-safe variant in all implementations.

**Prevention:**
- Always use standard base64 (`Buffer.from(data).toString('base64')` in Node.js — no URL-safe
  variant).
- When decoding on the hub side: `Buffer.from(b64str, 'base64')` — Node.js accepts both variants,
  but be explicit.
- Do not use `btoa/atob` (browser globals available in Node.js 18+ but with known edge cases on
  binary data with null bytes).

---

### P-T4 (LOW) — Embedded newlines in file content break stdio JSON-RPC framing

**What goes wrong:** MCP stdio transport requires each JSON-RPC message to be exactly one line.
If file content is placed in a JSON string field, JSON serialization (`JSON.stringify`) correctly
escapes newlines as `\n` — so the framing is safe. However, if any code path constructs JSON
manually using string concatenation or template literals, an actual `\n` character in the file
content will split the message across two lines, corrupting the frame.

**Root cause:** Manual JSON construction instead of `JSON.stringify`.

**Prevention:** Never construct JSON-RPC responses manually. Always use `JSON.stringify` on the
full response object. The SDK handles this correctly as long as tool handlers return a proper
content array — do not build the wire format by hand.

---

## 3. Security Pitfalls

### P-S1 (CRITICAL) — Path traversal via filename parameter

**What goes wrong:** If the hub stores files keyed by a filename supplied by the client (e.g.
`POST /files` with `{ filename: "../../etc/passwd" }`), and if any route ever constructs a
filesystem path from that name (e.g. for a future "save to disk" feature), an attacker can write
or read arbitrary files. Even in a pure in-memory store, a malicious filename in the Map key can
collide with internal metadata keys or confuse listing output.

**Root cause:** User-supplied filenames are not sanitized. `path.normalize` alone is insufficient
on Windows (legacy device names like `CON`, `PRN`, `AUX` are interpreted as special files —
CVE-2025-27210). On Linux, `../` traversal is the primary vector.

**Consequences:** In the current in-memory design, the immediate risk is limited to Map key
confusion and denial-of-service via crafted filenames. If the store is ever persisted to disk,
this becomes a critical RCE/data exfiltration vector.

**Prevention:**
- Reject the filename at upload time. Use a server-generated UUID as the storage key (the Map
  key is never the client-supplied name).
- Store the original filename as metadata only, never as a key or path component.
- Strip or reject filenames containing `/`, `\`, `..`, null bytes, or Windows reserved names.
- Validation function: `if (!/^[\w\-. ]+$/.test(filename) || filename.includes('..')) reject()`

---

### P-S2 (HIGH) — Swarm ID spoofing: any worker can claim another worker's files

**What goes wrong:** The hub currently has no per-worker authentication beyond the global
`SWARM_SECRET`. If file storage is scoped by `swarm_id` (passed in the request body), any worker
that knows another swarm's ID can upload, overwrite, or delete that swarm's files. The hub has no
way to verify that the requester actually belongs to the swarm they claim.

**Root cause:** The global `SWARM_SECRET` is a single shared secret — it authenticates "is this
a legitimate participant" but not "is this participant the owner of swarm X". This is the same
design accepted for the worker registry (any worker can PATCH or DELETE any other worker).

**Consequences:** In a LAN environment with trusted participants this is a low operational risk.
But a compromised worker process can delete files from other active swarms, causing silent task
failures.

**Prevention:**
- Scope file operations by `swarm_id` (already planned), but document the trust boundary
  explicitly: swarm_id isolation is namespace isolation, not access control.
- For MVP: accept this limitation, document it. All participants share the same trust level.
- If stricter isolation is needed later: issue per-swarm tokens at swarm creation time.

---

### P-S3 (MEDIUM) — Hub file routes unauthenticated if SWARM_SECRET is not set

**What goes wrong:** `hub.mjs` `authorize()` returns `true` immediately if `SECRET` is empty
(line 67: `if (!SECRET) return true`). File routes will be publicly accessible with no auth on
any network the hub is bound to. The hub binds to `0.0.0.0` by default.

**Root cause:** By design — SWARM_SECRET is optional ("fine for trusted LAN"). This is acceptable
for small team use but a hazard if the hub is accidentally exposed beyond the LAN.

**Prevention:**
- Emit a louder startup warning when SECRET is unset: `process.stderr.write("WARNING: SWARM_SECRET not set — file store is publicly accessible\n")`.
- Document in SKILL.md: file operations require SWARM_SECRET on any non-loopback network.
- No code change required to the auth logic; the existing authorize() function covers new routes
  automatically as long as file routes follow the existing route handler pattern.

---

### P-S4 (LOW) — File content in hub memory is accessible to all workers in the same secret space

**What goes wrong:** If two separate swarms share the same hub and SWARM_SECRET (e.g. a developer
running multiple projects on the same machine), files from one swarm are visible to workers from
another if they know a file ID or enumerate the listing endpoint.

**Prevention:**
- `file_list` must always filter by `swarm_id` — never expose files from other swarms.
- File IDs must be unguessable (crypto.randomBytes(8).toString('hex')).

---

## 4. Concurrency Pitfalls

### P-C1 (LOW) — Two workers uploading the same logical filename in the same swarm silently overwrites

**What goes wrong:** Node.js is single-threaded, so concurrent `Map.set()` calls are safe from
a data-corruption standpoint. However, if two workers upload a file with the same logical filename
to the same swarm simultaneously, the second upload will succeed and the hub will have two
independent file entries (different IDs, same name), or — if keyed by name — the second will
silently overwrite the first with no conflict error.

**Root cause:** No uniqueness constraint on filename within a swarm scope.

**Consequences:** Worker A uploads `report.json`, worker B uploads a different `report.json` a
moment later. The leader downloads `report.json` and gets whichever arrived last. Worker A's data
is silently lost.

**Prevention:**
- Key files by server-generated UUID (not by filename). This guarantees no collisions.
- The `file_upload` response returns the UUID. Workers reference files by UUID, not by name.
- `file_list` returns both UUID and original filename so leaders can find the right file.
- If deduplication by name is desired, it must be an explicit choice: `file_upload` accepts
  an optional `overwrite: boolean` parameter; default false returns an error if the name exists
  within the swarm.

---

### P-C2 (LOW) — Hub restart while a worker is mid-upload loses partial data silently

**What goes wrong:** `readBody` accumulates chunks into an array. If the hub crashes or is
SIGTERM'd while reading a large upload, the request promise is abandoned and the partial buffer
is GC'd. The worker's HTTP call will throw `ECONNRESET` or `ECONNREFUSED`.

**Prevention:**
- Workers calling `file_upload` must handle `isError: true` and retry or report failure.
- The tool handler must not assume the hub call succeeds — it already wraps `hubFetch` in
  try/catch (established pattern from v1.1 WR-04 fix). Apply the same pattern to file tools.

---

## 5. MCP-Specific Pitfalls

### P-MCP1 (HIGH) — Tool schema: file content as a Zod string parameter vs. content block

**What goes wrong:** If `file_upload` accepts the file content as a Zod `z.string()` parameter
in the tool's input schema, Claude must pass the base64 content as a JSON string inside the tool
call arguments. This means the entire base64 blob travels through the LLM's output as a token
sequence. Claude has an output token limit (by default 32,000 tokens for claude-sonnet-4-x). A
1 MB file = ~1.4 MB base64 = ~350,000 tokens — impossible to output.

**Root cause:** MCP tool input parameters are LLM-generated text. Large binary payloads must
never be placed in tool input parameters.

**Consequences:** File upload of any non-trivial file is impossible via tool input parameters.
Claude physically cannot emit that many tokens in a single tool call.

**Prevention:**
- File upload must be a two-step operation:
  1. Claude calls `file_upload` with metadata only (filename, mime_type, size_hint).
  2. Hub responds with an upload URL or session token.
  3. The actual file bytes are transferred via a separate HTTP call (the worker's non-MCP HTTP
     path, using the Bash tool or a helper script).
- Alternatively (simplest for MVP): restrict `file_upload` to text files under 50 KB
  (≈ 12,500 tokens) — small enough that Claude can include the content in a tool argument.
  Document this limit clearly in the tool description so Claude does not attempt larger uploads.
- Binary files always require the two-step approach.

---

### P-MCP2 (MEDIUM) — Tool description must state size limits or Claude will attempt oversized calls

**What goes wrong:** If the `file_upload` / `file_download` tool descriptions do not mention
size limits, Claude will attempt to upload or download arbitrarily large files. The failure will
arrive as an HTTP error from the hub (413 or 500) rather than a clear tool-level error, making
the failure hard to diagnose.

**Prevention:**
- Include size limits explicitly in the tool `description` string:
  `"Upload a text file to the hub. Content must be plain text, maximum 50 KB. For larger files, use the two-step upload flow."`
- Include encoding expectations:
  `"content: base64-encoded file contents"` in the parameter description.

---

### P-MCP3 (MEDIUM) — Tool re-registration on `swarm_register` re-call clears previous tools

**What goes wrong:** The existing `swarm_register` handler (Phase 5, WR-03) calls
`clearInterval(pollInterval)` and `httpServer.close()` to clean up previous lifecycle resources.
However, MCP tool registrations via `server.tool(...)` are module-level and permanent — they are
not re-registered on re-call. This is correct behavior. The risk is the inverse: if a future
refactor moves tool registration inside the `swarm_register` handler body (to conditionally
register file tools only for certain roles), re-registration will throw a duplicate tool error or
silently create conflicting handlers.

**Prevention:**
- Keep all `server.tool(...)` calls at module level, outside any handler function. This is the
  existing pattern and must be maintained.
- File tools (`file_upload`, `file_download`, `file_list`, `file_delete`) must be registered at
  module startup, not conditionally inside `swarm_register`.

---

### P-MCP4 (LOW) — `hubFetch` in file tools does not handle large response bodies from hub

**What goes wrong:** `hubFetch` in mcp-server.mjs calls `res.json()` which buffers the entire
response body in memory before returning. For `file_download`, the hub response contains the
file's base64 content. If the file is 5 MB, the hub sends a ~7 MB JSON body, which `res.json()`
buffers entirely in the mcp-server process memory, then places in the tool response content array,
which the SDK serializes as a single JSON-RPC line on stdout.

**Prevention:**
- Enforce the file size cap at the hub level (see P-M2) so `hubFetch` never receives a response
  larger than the agreed limit.
- For the MVP: a 100 KB per-download limit applied on both the hub response and the tool
  description keeps the entire pipeline within safe bounds.

---

## Prevention Checklist

Use this checklist when implementing any file tool or hub file route.

### Hub (hub.mjs)

- [ ] New file upload route uses a separate `readRawBody(req, FILE_MAX_BYTES)` helper, not the
      existing `readBody` (which hard-caps at 1 MB and destroys the connection on overflow)
- [ ] File size rejected before storing: respond HTTP 413 with `{ error: "File too large" }`
- [ ] File stored under server-generated UUID, never under client-supplied filename
- [ ] Client-supplied filename validated: only `[\w\-. ]`, no `..`, no `/`, no null bytes
- [ ] Per-swarm file count cap enforced (e.g. 50 files)
- [ ] TTL eviction interval set up in hub startup (e.g. every 5 min, evict files older than 30 min)
- [ ] File list route filters by `swarm_id` — never returns files from other swarms
- [ ] File IDs use `crypto.randomBytes(8).toString('hex')` — unguessable
- [ ] `/health` response includes `files: fileStore.size` for observability

### MCP Server (mcp-server.mjs)

- [ ] No `console.log` or `process.stdout.write` anywhere in new file tool handlers
- [ ] All diagnostic output uses `process.stderr.write(...)`
- [ ] File tool descriptions include explicit size limits and encoding expectations
- [ ] `file_upload` for text MVP: validates content is ≤ 50 KB before calling hub
- [ ] `file_download` implements pagination (`offset`, `max_bytes` params) or hard size cap
- [ ] All `hubFetch` calls in file tool handlers are wrapped in try/catch (WR-04 pattern)
- [ ] `server.tool(...)` registrations are module-level, not inside `swarm_register` handler
- [ ] Base64 encoding uses `Buffer.from(data).toString('base64')` (standard, not URL-safe)
- [ ] Base64 decoding uses `Buffer.from(b64str, 'base64')` (not `atob`)

### Security

- [ ] Startup warning emitted to stderr if `SWARM_SECRET` is not set (file store is open)
- [ ] `swarm_id` scope isolation documented as namespace-only, not access control
- [ ] Trust boundary documented: any participant with valid SWARM_SECRET can access any swarm's files

---

## Phase-Specific Warnings

| Phase Topic | Pitfall | Mitigation |
|---|---|---|
| Hub file routes (new routes) | P-M1: readBody 1 MB cap | New `readRawBody` helper with configurable limit |
| Hub file storage design | P-M2: unbounded memory | TTL eviction + per-swarm file count cap from day one |
| File naming / IDs | P-S1: path traversal | UUID keys, filename as metadata only |
| file_upload MCP tool | P-MCP1: LLM output token limit | 50 KB text-only MVP; two-step for binary/large |
| file_download MCP tool | P-T2: context window overflow | Pagination or hard 100 KB cap per call |
| Any new tool handler | P-T1: stdout corruption | grep for console.log before every commit |
| Encoding | P-T3: base64 variant mismatch | Explicit `Buffer.from(..., 'base64')` everywhere |
| Swarm scoping | P-S2: swarm_id spoofing | Document trust boundary; UUID file IDs |
| Re-registration | P-MCP3: tool re-registration | Keep server.tool() at module level |

---

## Sources

- MCP TypeScript SDK — `resource_link` for large resources: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- MCP response size limit discussion: https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2211
- Claude Code token limit bug for image MCP responses: https://github.com/anthropics/claude-code/issues/9152
- Claude Code large MCP tools context warning: https://github.com/anthropics/claude-code/issues/12241
- Python SDK base64 variant mismatch: https://github.com/modelcontextprotocol/python-sdk/issues/342
- MCP stdio stdout corruption (real-world): https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/570
- MCP stdio spec — newline-delimited, no embedded newlines: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Node.js path traversal CVE-2025-27210: https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows
- Base64 inflation ratio (33%): https://lemire.me/blog/2019/01/30/what-is-the-space-overhead-of-base64-encoding/
- Node.js race conditions in async Map access: https://medium.com/@zuyufmanna/mastering-node-js-concurrency-race-condition-detection-and-prevention-3e0cfb3ccb07
- MCP server memory management best practices: https://fast.io/resources/mcp-server-memory-management/
