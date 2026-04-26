# Feature Landscape: MCP File Transport (Codestra v1.2)

**Domain:** In-memory MCP file hub for AI agent swarm artifact exchange
**Researched:** 2026-04-26
**Confidence:** HIGH (architecture grounded in existing codebase + verified MCP spec patterns)

---

## Summary

Codestra v1.2 adds file-passing capability to the hub so that workers in a swarm can exchange artifacts (code output, reports, structured data, intermediate results) without relying on a shared local filesystem. The hub already stores workers and messages in-memory Maps; files follow the same pattern — a new `files` Map namespaced by `swarm_id`.

MCP tools are the right transport layer. The LLM calls `file_upload` to push bytes into the hub, then instructs another worker (via existing messaging) to call `file_download` with the filename. This keeps file content out of the LLM context window — only the filename/key crosses the message channel, not the bytes.

Binary content must be base64-encoded because MCP tool inputs and outputs are JSON strings. The hub stores base64 strings internally; workers decode on receipt. This is consistent with how MCP handles image/binary resources in the 2025-06-18 spec.

The four core operations — upload, download, list, delete — are the entire surface area needed. Versioning, streaming, locking, and TTL-based eviction are all out of scope for v1.2 (in-memory-only philosophy inherited from v1.x; no persistence is intentional).

---

## Table Stakes

Features workers will break without. Missing any of these makes the transport unusable.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| `file_upload` MCP tool | Core write path — no upload, no sharing | Low | hub.mjs new route `POST /files/:swarm_id/:filename` |
| `file_download` MCP tool | Core read path — no download, no artifact handoff | Low | hub.mjs new route `GET /files/:swarm_id/:filename` |
| `file_list` MCP tool | Workers need to discover what's available without knowing exact names | Low | hub.mjs new route `GET /files/:swarm_id` |
| `file_delete` MCP tool | Clean up artifacts after consumption to bound memory use | Low | hub.mjs new route `DELETE /files/:swarm_id/:filename` |
| `swarm_id` namespace isolation | Two concurrent swarms must not see each other's files | Low | Already exists: workers carry `swarm_id` from v1.1 |
| Base64 content encoding | MCP tool I/O is JSON; binary files require base64 to survive transport | Low | Standard; must be documented in SKILL.md |
| Per-file metadata (size, mime_type, uploaded_at, uploaded_by) | Consumers need to know what they got before deciding to decode/use it | Low | Computed at upload time; stored alongside content |
| Max file size enforcement | hub uses 1 MB `readBody` limit already; file content must respect same guard | Low | Reuse existing `readBody` 1 MB cap on hub route |
| SWARM_SECRET auth on all file routes | All existing hub routes require Bearer token; file routes must be consistent | Low | Copy existing `authorize()` pattern in hub.mjs |

---

## Differentiators

Features that add value without being blockers. Build after table stakes are solid.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `content_type` auto-detection by filename extension | Workers skip mime guessing — `.json` → `application/json` etc. | Low | Simple map; no external lib needed |
| `file_list` returns metadata per file (size, uploaded_at, uploaded_by) | Orchestrator can decide which artifact to fetch without downloading all | Low | Already stored; just include in list response |
| Overwrite on re-upload (same filename) | Idempotent re-runs: worker can re-upload without prior delete | Low | Replace entry in Map; no version chain needed |
| Explicit `uploaded_by` field | Orchestrator can audit which worker produced which artifact | Low | Worker passes its own ID at upload time |
| `file_list` filter by `uploaded_by` | Find all files from a specific worker cheaply | Low | In-memory filter on Map values |
| Skill documentation (`SKILL.md` update) | Claude agents need declarative instructions for when/how to use file tools | Low | Required for correct LLM behavior; not runtime code |

---

## Anti-Features

Explicitly out of scope for v1.2. Building these would contradict the project's in-memory philosophy or add unwarranted complexity.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| File versioning / history | Contradicts in-memory simplicity; v1.x has no persistence | Overwrite in place; workers include version info in filename if needed (`output-v2.json`) |
| TTL-based auto-expiry | Requires background timer management; no GC complexity for v1.2 | Document that files live until deleted or hub restart; instruct workers to delete after use |
| Streaming / chunked upload | MCP tools are request/response, not streams; base64 fits in 1 MB limit | If file > 1 MB is needed, split into chunks — defer to v1.3 |
| Persistent storage (disk/DB) | Explicitly out of scope for entire v1.x line per PROJECT.md | By design: hub restart clears state |
| File locking / concurrency control | Two workers writing same file key is a workflow error, not a hub concern | Orchestrator enforces write ordering via messaging before upload |
| Access control per file (per-worker ACL) | Overkill for LAN swarm; all workers in same swarm are trusted | Namespace isolation by `swarm_id` is sufficient |
| Content-addressed storage (hash keys) | Breaks the simple filename-based handoff model | Workers agree on filenames via message, not hash lookups |
| MCP Resources exposure | Resources are application-controlled (host app decides); tools are model-controlled (LLM decides). File tools must be model-controlled so workers can invoke them autonomously | Expose files exclusively via MCP tools, not MCP Resources |

---

## Metadata Design

Each stored file entry in the hub's `files` Map holds:

```
{
  swarm_id:     string,   // namespace — partition key
  filename:     string,   // logical name agreed upon by workers
  content:      string,   // base64-encoded raw bytes
  mime_type:    string,   // "application/json" / "text/plain" / etc.  (worker-provided or inferred)
  size:         number,   // byte length of decoded content (NOT base64 length)
  uploaded_at:  string,   // ISO 8601 UTC timestamp
  uploaded_by:  string,   // worker ID (same as worker registration ID)
}
```

**Storage key:** `${swarm_id}/${filename}` — composite string key into a flat `Map<string, FileEntry>`.

**Why flat Map, not nested:** Consistent with how `workers` and `messages` are stored today. No extra indirection.

**Why `size` = decoded bytes, not base64 length:** Consumers care about actual file size. Base64 adds ~33% overhead; reporting the decoded size matches user expectations and simplifies the 1 MB guard (check `size`, not `content.length`).

**Why store `uploaded_by`:** Enables the orchestrator to attribute output to specific workers and to instruct a worker to fetch only files it did not produce, reducing redundant downloads.

**What is NOT stored:**
- File content hash — not needed for v1.2; overwrite is the only mutation
- Download count — not needed; no quota enforcement
- TTL timestamp — no auto-expiry in v1.2

---

## API Shape (MCP Tools)

### `file_upload`

```
Input:
  swarm_id:   string (required) — the swarm this file belongs to
  filename:   string (required) — logical name, e.g. "analysis.json"
  content:    string (required) — base64-encoded file bytes
  mime_type:  string (optional) — defaults to inferred from extension or "application/octet-stream"

Output (success):
  { filename, size, mime_type, uploaded_at, uploaded_by }

Output (error):
  { error: "File too large", max_bytes: 1048576 }
  { error: "swarm_id required" }
```

Hub route: `POST /files/:swarm_id/:filename`

### `file_download`

```
Input:
  swarm_id:  string (required)
  filename:  string (required)

Output (success):
  { filename, content, mime_type, size, uploaded_at, uploaded_by }
  — content is base64-encoded; worker decodes before use

Output (error):
  { error: "File not found" }
```

Hub route: `GET /files/:swarm_id/:filename`

### `file_list`

```
Input:
  swarm_id:    string (required)
  uploaded_by: string (optional) — filter by worker ID

Output:
  { files: [ { filename, mime_type, size, uploaded_at, uploaded_by }, ... ] }
  — content is NOT included in list response
```

Hub route: `GET /files/:swarm_id`

### `file_delete`

```
Input:
  swarm_id:  string (required)
  filename:  string (required)

Output (success):
  { deleted: true, filename }

Output (error):
  { error: "File not found" }
```

Hub route: `DELETE /files/:swarm_id/:filename`

---

## Use Cases

These use cases validate that the four operations cover all real worker workflows.

### UC-1: Worker produces output for orchestrator
Worker A finishes analysis, uploads `report.json` (base64). Orchestrator calls `file_list` on the swarm, sees `report.json`, calls `file_download`, decodes and reads result.
**Operations used:** upload, list, download.

### UC-2: Pipeline handoff between workers
Orchestrator assigns Worker A to parse data, Worker B to summarize it. Worker A uploads `parsed.json`. Orchestrator messages Worker B: "download parsed.json from swarm X and summarize". Worker B downloads, summarizes, uploads `summary.md`. Orchestrator downloads final result.
**Operations used:** upload (x2), download (x2), list (optional verification).
**Key insight:** Orchestrator controls ordering via existing messaging; no locking needed.

### UC-3: Parallel workers producing partial results
Orchestrator assigns Workers A, B, C to process different data segments. Each uploads `chunk-A.json`, `chunk-B.json`, `chunk-C.json`. Orchestrator calls `file_list`, verifies all three exist, downloads all three, merges.
**Operations used:** upload (x3), list, download (x3).

### UC-4: Idempotent re-run
Worker A re-runs analysis (due to orchestrator retry). Uploads `report.json` again — hub overwrites in place. Orchestrator downloads the latest version.
**Operations used:** upload (overwrites), download.
**Key insight:** Overwrite semantics make retries safe without prior delete.

### UC-5: Memory cleanup after consumption
After orchestrator downloads all artifacts, it calls `file_delete` on each to release in-memory bytes. Prevents unbounded hub growth across long swarm sessions.
**Operations used:** delete (x N).

### UC-6: Orchestrator inspects available artifacts
Orchestrator wakes up mid-session (e.g. after polling), calls `file_list` to discover what workers have already produced, avoids re-assigning completed work.
**Operations used:** list.

---

## Feature Dependencies on Existing Code

| v1.2 Feature | Depends On (existing) | Notes |
|---|---|---|
| All file routes | `authorize()` in hub.mjs | Re-use as-is; same Bearer token pattern |
| File size limit | `readBody(req, 1_048_576)` in hub.mjs | Re-use existing cap |
| `swarm_id` namespace | WORKER-03 (v1.1) — workers carry `swarm_id` | Already validated and shipped |
| MCP tool wiring | `hubFetch()` in mcp-server.mjs | Same pattern as `swarm_send_message` |
| `uploaded_by` field | Worker registration ID from `swarm_register` | Worker knows its own ID post-registration; store at module scope like `httpServer`/`pollInterval` |
| Error response shape | `json(res, status, data)` in hub.mjs | Re-use as-is |

---

## Sources

- MCP Tools specification (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP binary content / base64 discussion: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1306
- MCP file handling lessons (practitioner): https://gelembjuk.com/blog/post/file-handling-in-ai-agents-with-mcp-lessons-learned/
- MCP Resources vs Tools distinction: https://modelcontextprotocol.info/docs/concepts/resources/
- Multi-agent artifact exchange patterns: https://fast.io/resources/ai-agent-shared-workspace/
- Agent handoff and namespace isolation: https://strandsagents.com/docs/user-guide/concepts/multi-agent/swarm/
- Cloudflare Artifacts (versioned agent storage, for contrast): https://blog.cloudflare.com/artifacts-git-for-agents-beta/
- Context window tool output overhead: https://writer.com/engineering/rag-mcp/
