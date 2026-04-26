# Technology Stack: MCP File Transport (v1.2)

**Project:** Codestra — Hub & Spoke MCP orchestration  
**Milestone:** v1.2 — MCP File Transport  
**Researched:** 2026-04-26  
**Overall confidence:** HIGH (SDK verified via Context7; spec verified via official schema sources)

---

## Summary

Adding `file_upload`, `file_download`, `file_list`, `file_delete` as MCP tools requires **zero new npm packages**. Everything needed is already present: `@modelcontextprotocol/sdk` v1.12.0 for tool registration, Node.js built-in `Buffer` for binary encoding, and a plain `Map` for in-memory storage namespaced by `swarm_id`. Binary content is carried as base64 strings inside standard MCP `{ type: "image", data, mimeType }` or `{ type: "resource", resource: { blob, mimeType, uri } }` content blocks. All changes are additive: new routes on `hub.mjs`, new tools on `mcp-server.mjs`, no modifications to existing handlers.

---

## MCP SDK File Handling

### Tools vs Resources — Which to Use

The MCP spec defines two primitives for exposing data:

| Primitive | Control | Invoked by | Best for |
|-----------|---------|------------|----------|
| **Tool** (`server.tool`) | Server-side logic | The LLM autonomously | Read/write operations with side effects (upload, download, delete) |
| **Resource** (`server.registerResource`) | Read-only data | The host application | Passively exposing static/listed content |

**Decision: Use tools exclusively for all four file operations.** Rationale: upload, download, delete are stateful operations with side effects. Resources are read-only and application-controlled — the LLM cannot invoke them directly. Tools match the existing pattern in `mcp-server.mjs` exactly (all current capabilities are tools).

### Tool Registration API (existing pattern — no change needed)

The current codebase uses the v1 API correctly:

```js
server.tool(name, description, zodSchema, async (args) => {
  return { content: [{ type: "text", text: "..." }] };
});
```

This is the `McpServer.tool()` call already used for `swarm_register`, `swarm_send_message`, etc. All four file tools follow the exact same pattern.

### Content Types Available in Tool Responses

Verified against the MCP spec (2025-06-18) and the TypeScript SDK (Context7, HIGH confidence):

| Content type | Shape | Use |
|---|---|---|
| `text` | `{ type: "text", text: string }` | JSON metadata, error messages, file listings |
| `image` | `{ type: "image", data: string, mimeType: string }` | Base64 binary, any MIME type |
| `resource` (EmbeddedResource) | `{ type: "resource", resource: { uri, blob, mimeType } }` | Binary resource embedded in result |
| `resource_link` | `{ type: "resource_link", uri, name, mimeType }` | Reference only, no inline data |

For file download, **`{ type: "image", data: base64String, mimeType }` is the correct and simplest pattern** for returning binary content from a tool. Despite the name `"image"`, the MCP spec uses this type for any binary content and Claude Code handles it correctly for arbitrary MIME types. The alternative `EmbeddedResource` with `blob` is also valid but adds URI indirection that is unnecessary here.

For `file_list` and operation confirmations, `{ type: "text", text: JSON.stringify(...) }` is sufficient and consistent with existing tools.

---

## Encoding Recommendation

**Use base64 for all file content. No exceptions.**

Rationale:
- MCP tool responses are JSON-serialized and transmitted over stdio. Raw binary in JSON is not valid.
- The MCP spec's `ImageContent.data` field is defined as "A base64-encoded string representing the image data." The same constraint applies to `BlobResourceContents.blob`.
- Claude Code's tool result pipeline expects base64 for non-text content.
- Node.js `Buffer` makes the round-trip trivial and allocation-free:

```js
// Upload: client sends base64 string → hub stores as Buffer
const buf = Buffer.from(base64String, "base64");

// Download: hub reads Buffer → tool returns base64 string
const base64 = buf.toString("base64");
```

**For text files specifically:** Accept both a `content` string (plain text) and a `base64` flag in the upload tool. Store as a UTF-8 Buffer regardless. On download, return `{ type: "text", text: buf.toString("utf8") }` when `mimeType` starts with `text/`, otherwise return `{ type: "image", data: buf.toString("base64"), mimeType }`. This avoids unnecessarily base64-encoding plain text that Claude Code can read directly.

---

## In-Memory Storage Pattern

**Use a single `Map` keyed by `swarm_id`, each value a nested `Map` keyed by filename.**

This is zero-dependency, matches how `workers` and `messages` are already stored in `hub.mjs`, and is completely predictable.

```js
// In hub.mjs — add alongside existing `workers` and `messages` state:
/**
 * @type {Map<string, Map<string, { name: string, mimeType: string, size: number, uploadedAt: string, data: Buffer }>>}
 * Key: swarm_id → Map(filename → file record)
 */
const files = new Map();

// Helper to get or create namespace
function getNamespace(swarmId) {
  if (!files.has(swarmId)) files.set(swarmId, new Map());
  return files.get(swarmId);
}
```

Hub HTTP endpoints to add:

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/files/:swarmId` | Upload — body `{ name, mimeType, data: base64 }` |
| `GET` | `/files/:swarmId/:name` | Download — returns `{ name, mimeType, data: base64, size }` |
| `GET` | `/files/:swarmId` | List — returns `{ files: [{ name, mimeType, size, uploadedAt }] }` |
| `DELETE` | `/files/:swarmId/:name` | Delete — returns `{ ok: true }` |

The existing `readBody`, `json`, `matchRoute`, and `authorize` helpers in `hub.mjs` handle all of this without modification.

**Size guard:** The existing `readBody` already has a 1 MB cap. For file uploads, this cap should be raised or overridden per-route (e.g., to 10 MB) by passing a larger `maxBytes` argument. No new mechanism needed — `readBody(req, 10_485_760)`.

**MCP tools in `mcp-server.mjs`:** Four tools that call `hubFetch` — same pattern as `swarm_send_message`. The tools receive/return base64 strings; the hub stores Buffers.

---

## What NOT to Add

| Temptation | Why to skip |
|---|---|
| External storage (S3, Redis, SQLite) | In-memory is intentional for v1.x per PROJECT.md; adds zero-config requirement |
| Streaming / chunked upload | Adds protocol complexity; `readBody` with a raised cap is sufficient for MCP artifact sizes |
| Multipart form data | MCP tools use JSON; multipart is a browser/HTTP form concept |
| File deduplication / content hashing | Premature optimization; not required for swarm artifact exchange |
| `@modelcontextprotocol/sdk` upgrade | v1.12.0 is installed and supports all required content types; upgrade is out of scope |
| New npm packages (multer, formidable, etc.) | All primitives are in Node.js core and the existing SDK |
| MCP Resources (`server.registerResource`) | Application-controlled, read-only, not directly invokable by the LLM; tools cover all use cases |
| TTL / expiry for files | Not required for v1.2; files live until swarm ends or explicit delete |
| Per-file authorization beyond SWARM_SECRET | Existing `authorize()` in hub.mjs is sufficient for LAN use |

---

## Versions

| Package | Current installed | Latest (npm) | Action |
|---------|------------------|--------------|--------|
| `@modelcontextprotocol/sdk` | `^1.12.0` | `1.29.0` | No change — v1.12.0 has all needed APIs |
| `zod` | (peer dep, already used) | `4.3.6` | No change |
| Node.js builtins used | `node:http`, `node:crypto`, `Buffer`, `Map` | — | All available in current Node.js ESM |

No `package.json` changes required.

---

## Integration Points with Existing Code

**hub.mjs additions (additive only):**
- New state: `const files = new Map()` alongside `workers` and `messages`
- New routes object entries: `POST /files/:swarmId`, `GET /files/:swarmId`, `GET /files/:swarmId/:name`, `DELETE /files/:swarmId/:name`
- No changes to existing routes, helpers, or server bootstrap

**mcp-server.mjs additions (additive only):**
- Four new `server.tool(...)` calls: `file_upload`, `file_download`, `file_list`, `file_delete`
- All call `hubFetch` — same pattern as `swarm_send_message` / `swarm_read_messages`
- `file_download` returns `{ type: "image", data: base64, mimeType }` for binary or `{ type: "text", text }` for text MIME types
- Input schemas use `z.string()` for `swarmId`, `fileName`, `mimeType`, `data`; `z.number().optional()` for none

---

## Sources

- Context7 `/modelcontextprotocol/typescript-sdk` — tool registration patterns, `server.tool()` API, `resource_link` output type (HIGH confidence)
- MCP spec schema 2025-06-18: `BlobResourceContents.blob` is base64, `ImageContent.data` is base64 (HIGH confidence via WebSearch citing official schema)
- MCP spec tools page `modelcontextprotocol.io/specification/2025-11-25/server/tools` — CallToolResult content types include `text`, `image`, `resource` (HIGH confidence)
- npm registry: `@modelcontextprotocol/sdk` latest = 1.29.0, `zod` latest = 4.3.6 (HIGH confidence, verified via npm)
