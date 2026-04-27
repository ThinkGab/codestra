# Phase 7: MCP Tool Wrappers - Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 1 (mcp-server.mjs — modify only)
**Analogs found:** 1 / 1 (self-analog: existing tools within same file)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `servers/mcp-server.mjs` | service / tool-host | request-response (proxy) | `servers/mcp-server.mjs` existing tools | exact (same file) |

This phase is a single-file modification. All four new tools (`file_upload`, `file_download`, `file_list`, `file_delete`) plus two small edits (module-level var, swarm_register capture) live in `servers/mcp-server.mjs`.

---

## Pattern Assignments

### Edit 1 — Module-level `registeredWorkerId` variable

**Analog:** `servers/mcp-server.mjs` lines 99-101

**Existing pattern to extend:**
```javascript
// ── Module-level lifecycle state ─────────────────────────────────────────────
let httpServer;      // set by swarm_register handler
let pollInterval;    // set by swarm_register handler (WORKER-04 heartbeat)
```

**Action:** Add one line immediately after line 101:
```javascript
let registeredWorkerId; // set by swarm_register handler (Phase 7: file tools)
```

---

### Edit 2 — Capture `registeredWorkerId` in `swarm_register` success path

**Analog:** `servers/mcp-server.mjs` lines 160-161

**Existing context:**
```javascript
// Capture hub-assigned ID if none was provided (WR-01)
const assignedId = resolvedId || data.worker?.id || "";
```

**Action:** Add one line immediately after line 161:
```javascript
registeredWorkerId = assignedId; // Phase 7: expose to file tool handlers
```

---

### New tool: `file_list` (simplest — no params, GET)

**Analog:** `servers/mcp-server.mjs` lines 80-97 (`swarm_hub_status`) and lines 314-336 (`swarm_read_messages`)

**Insertion point:** After line 384 (closing `)` of `swarm_kill_worker`), before line 386 (`// ── Worker HTTP Server ──`).

**Guard pattern** (new for Phase 7 — not yet in existing tools):
```javascript
if (!registeredWorkerId) {
  return {
    content: [{ type: "text", text: "Not registered: call swarm_register first." }],
    isError: true,
  };
}
```

**hubFetch GET pattern** (lines 86, 323-324):
```javascript
const data = await hubFetch(`/files/${registeredWorkerId}`);
```

**Hub error detection pattern** (D-09 — new, not yet in existing tools):
```javascript
if (data.error) {
  return { content: [{ type: "text", text: `Hub error: ${data.error}` }], isError: true };
}
```

**Success response pattern** (lines 87-89):
```javascript
return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
```

**Error catch pattern** (lines 306-308 — identical across all existing tools):
```javascript
} catch (err) {
  return { content: [{ type: "text", text: `Hub not reachable: ${err.message}` }], isError: true };
}
```

**Full tool skeleton to copy:**
```javascript
// ── Tool: file_list ─────────────────────────────────────────────────────────

server.tool(
  "file_list",
  "List all files stored in this worker's swarm namespace. Returns an array of file metadata objects.",
  {},
  async () => {
    if (!registeredWorkerId) {
      return {
        content: [{ type: "text", text: "Not registered: call swarm_register first." }],
        isError: true,
      };
    }
    try {
      const data = await hubFetch(`/files/${registeredWorkerId}`);
      if (data.error) {
        return { content: [{ type: "text", text: `Hub error: ${data.error}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Hub not reachable: ${err.message}` }], isError: true };
    }
  }
);
```

---

### New tool: `file_delete` (simple DELETE — one param)

**Analog:** `servers/mcp-server.mjs` lines 368-384 (`swarm_kill_worker`) — closest structural match: single string param, DELETE method, simple success/error response.

**Schema pattern** (lines 372-373):
```javascript
{
  workerId: z.string().describe("Worker ID to remove"),
}
```

**hubFetch DELETE pattern** (line 376):
```javascript
const data = await hubFetch(`/workers/${workerId}`, { method: "DELETE" });
```

**Full tool skeleton to copy:**
```javascript
// ── Tool: file_delete ───────────────────────────────────────────────────────

server.tool(
  "file_delete",
  "Delete a file from this worker's swarm namespace.",
  {
    filename: z.string().describe("Name of the file to delete"),
  },
  async ({ filename }) => {
    if (!registeredWorkerId) {
      return {
        content: [{ type: "text", text: "Not registered: call swarm_register first." }],
        isError: true,
      };
    }
    try {
      const data = await hubFetch(`/files/${registeredWorkerId}/${filename}`, { method: "DELETE" });
      if (data.error) {
        return { content: [{ type: "text", text: `Hub error: ${data.error}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Hub not reachable: ${err.message}` }], isError: true };
    }
  }
);
```

---

### New tool: `file_download` (GET with query params, two optional params)

**Analog:** `servers/mcp-server.mjs` lines 314-336 (`swarm_read_messages`) — builds query string from optional params, handles response content.

**Query string construction pattern** (line 323):
```javascript
const query = all ? "" : "?unread=true";
const data = await hubFetch(`/messages/${workerId}${query}`);
```

**Adapted for file_download** (offset + max_bytes with defaults):
```javascript
const resolvedOffset = offset ?? 0;
const resolvedMaxBytes = max_bytes ?? 25000;
const data = await hubFetch(
  `/files/${registeredWorkerId}/${filename}?offset=${resolvedOffset}&max_bytes=${resolvedMaxBytes}`
);
```

**Schema with optional numeric params** (lines 109-112):
```javascript
{
  filename:  z.string().describe("..."),
  offset:    z.number().optional().describe("Byte offset to start reading from (default 0)"),
  max_bytes: z.number().optional().describe("Max bytes to return (default 25000)"),
}
```

**D-03 response format** — return entire hub JSON as text string (LLM parses `has_more` for chunking):
```javascript
return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
```

---

### New tool: `file_upload` (PUT with raw body + Content-Type override)

**Analog:** `servers/mcp-server.mjs` lines 29-35 (`hubFetch`) — the header spread `{ ...headers, ...options.headers }` already supports Content-Type override; no modification to hubFetch needed.

**hubFetch header override pattern** (lines 29-35):
```javascript
async function hubFetch(path, options = {}) {
  const url = `${HUB_URL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  return res.json();
}
```

**D-04 invocation pattern** — raw string body, Content-Type from param:
```javascript
const data = await hubFetch(`/files/${registeredWorkerId}/${filename}`, {
  method: "PUT",
  body: content,                          // raw string — NOT JSON.stringify
  headers: { "Content-Type": mimeType || "text/plain" },
});
```

**Schema with optional mimeType** (lines 109-112 style):
```javascript
{
  filename: z.string().describe("Name to store the file under"),
  content:  z.string().describe("File content as a UTF-8 string (max ~50 KB)"),
  mimeType: z.string().optional().describe("MIME type (default: text/plain)"),
}
```

---

## Shared Patterns

### Guard: registeredWorkerId check
**Apply to:** All four file tools (`file_upload`, `file_download`, `file_list`, `file_delete`)
**Place:** First statement inside the async handler, before try/catch

```javascript
if (!registeredWorkerId) {
  return {
    content: [{ type: "text", text: "Not registered: call swarm_register first." }],
    isError: true,
  };
}
```

### Network error catch
**Source:** `servers/mcp-server.mjs` lines 306-308, 332-334, 360-362, 381-382 (identical in all existing tools)
**Apply to:** All four file tools

```javascript
} catch (err) {
  return { content: [{ type: "text", text: `Hub not reachable: ${err.message}` }], isError: true };
}
```

### Hub semantic error detection (D-09 — new pattern)
**Apply to:** All four file tools, inside try block, immediately after hubFetch call
**Purpose:** Catches 4xx hub errors (file not found, etc.) that don't throw but return `{error: "..."}`

```javascript
if (data.error) {
  return { content: [{ type: "text", text: `Hub error: ${data.error}` }], isError: true };
}
```

### Success response
**Source:** `servers/mcp-server.mjs` lines 87-89 (`swarm_hub_status`)
**Apply to:** All four file tools

```javascript
return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
```

### Tool section comment header style
**Source:** `servers/mcp-server.mjs` line 44, 78, 103, 282, 312, 338, 366
**Pattern:** `// ── Tool: <name> ──────...──` (dashes pad to ~76 chars)

---

## No Analog Found

No files lack analogs. All patterns are found within `servers/mcp-server.mjs` itself. The only truly new pattern is the hub semantic error detection (`data.error` check per D-09), which is a one-line addition layered onto the existing catch structure.

---

## Structural Change Summary

| Location in file | Change | Lines |
|-----------------|--------|-------|
| After line 101 | Add `let registeredWorkerId;` | +1 line |
| After line 161 | Add `registeredWorkerId = assignedId;` | +1 line |
| After line 384, before line 386 | Insert four new `server.tool(...)` blocks | +~80 lines |

---

## Metadata

**Analog search scope:** `servers/mcp-server.mjs` (single-file modification)
**Files scanned:** 1
**Pattern extraction date:** 2026-04-27
