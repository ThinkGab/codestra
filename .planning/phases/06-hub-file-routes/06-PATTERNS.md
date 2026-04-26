# Phase 6: Hub File Routes - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 1 (servers/hub.mjs — modified)
**Analogs found:** 1 / 1 (all patterns live in the single file being modified)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `servers/hub.mjs` | server / route-handler | CRUD + file-I/O | itself (existing routes) | exact |

All patterns come from `servers/hub.mjs` itself. The executor must add code inside the existing file without touching any existing function.

---

## Pattern Assignments

### 1. In-memory state — `files` Map

**Analog:** `servers/hub.mjs` lines 24–30 (existing `workers` and `messages` declarations)

Add immediately after line 30, in the `// ── State ──` block:

```js
/** @type {Map<string, {id: string, swarmId: string, filename: string, content: Buffer, size: number, mimeType: string, uploadedAt: string}>} */
const files = new Map();
```

Pattern rules:
- JSDoc `@type` comment with full shape inline — matches `workers` Map on line 26
- Module-level `const`, never reassigned
- Keyed by UUID string (use `crypto.randomUUID()` — see pattern 3 below)

---

### 2. `readRawBody` helper

**Analog:** `servers/hub.mjs` lines 43–64 (`readBody`)

Exact source to derive from:

```js
function readBody(req, maxBytes = 1_048_576 /* 1 MB */) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        return reject(new Error("Request body too large"));
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}
```

**New function — copy structure, change two things only:**

```js
function readRawBody(req, maxBytes = 10_485_760 /* 10 MB */) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        const err = new Error("Request body too large");
        err.code = "BODY_TOO_LARGE";   // typed code for 413 detection in handler
        return reject(err);
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));  // no JSON.parse
    req.on("error", reject);
  });
}
```

Differences from `readBody`:
- Default `maxBytes` = 10 MB (D-07)
- `err.code = "BODY_TOO_LARGE"` — handler catches this and sends 413 (Claude's Discretion from D-07)
- `resolve(Buffer.concat(chunks))` — returns raw Buffer, no JSON.parse

Place immediately after `readBody` (after line 64), still in the `// ── Helpers ──` block.

---

### 3. UUID generation

**Analog:** `servers/hub.mjs` line 81 (`generateId`)

```js
function generateId() {
  return crypto.randomBytes(4).toString("hex");
}
```

`crypto` is already imported (line 18). For file IDs use `crypto.randomUUID()` directly in the PUT handler — this produces a standard UUID v4 string suitable as a Map key, distinct from the short hex IDs used for workers/messages.

```js
const id = crypto.randomUUID();
```

---

### 4. `json()` helper — response pattern

**Analog:** `servers/hub.mjs` lines 34–41

```js
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
```

Use for ALL file route responses. Never call `res.writeHead` / `res.end` directly in route handlers — always go through `json()`.

---

### 5. Route registration pattern

**Analog:** `servers/hub.mjs` lines 117–229 (`routes` object)

All four file routes are added as new keys in the existing `routes` object. Pattern for each entry:

```js
// Sync handler (no body read needed):
"GET /some/path": (req, res, params) => {
  // ... synchronous logic ...
  json(res, 200, { ... });
},

// Async handler (body read or async ops):
"PUT /some/path/:param": async (req, res, params) => {
  // ... async logic ...
  json(res, 201, { ... });
},
```

Reference entries by role:

| New route | Closest existing analog | Why |
|-----------|------------------------|-----|
| `PUT /files/:swarmId/:filename` | `POST /workers` (lines 124–144) | async, reads body, writes to Map, returns created object |
| `GET /files/:swarmId/:filename` | `GET /messages/:workerId` (lines 218–228) | reads query params via `new URL`, filters in-memory store |
| `GET /files/:swarmId` | `GET /workers` (lines 147–149) | sync list from Map, no params |
| `DELETE /files/:swarmId/:filename` | `DELETE /workers/:id` (lines 170–174) | deletes from Map, 404 if missing |

---

### 6. URL query param parsing

**Analog:** `servers/hub.mjs` lines 219–220

```js
const url = new URL(req.url, `http://${req.headers.host}`);
const unreadOnly = url.searchParams.get("unread") === "true";
```

For `GET /files/:swarmId/:filename` pagination (D-08):

```js
const url = new URL(req.url, `http://${req.headers.host}`);
const offset    = parseInt(url.searchParams.get("offset")    ?? "0",         10);
const max_bytes = parseInt(url.searchParams.get("max_bytes") ?? "1000000",   10);
```

Note: `req.url` is already used inside the server handler to build the URL passed to `matchRoute` (line 265–266), but route handlers receive the original `req` with `req.url` intact — they must construct `new URL` themselves, exactly as the messages handler does.

---

### 7. Error handling — 413 from `readRawBody`

**Analog:** `servers/hub.mjs` lines 272–276 (server-level try/catch)

```js
try {
  await route.handler(req, res, route.params);
} catch (err) {
  json(res, 500, { error: err.message });
}
```

The server-level catch sends 500 for all unhandled errors. The PUT handler must intercept the `BODY_TOO_LARGE` error before it propagates:

```js
"PUT /files/:swarmId/:filename": async (req, res, params) => {
  let content;
  try {
    content = await readRawBody(req);
  } catch (err) {
    if (err.code === "BODY_TOO_LARGE") return json(res, 413, { error: "File too large (max 10 MB)" });
    throw err;  // re-throw anything else → server-level 500
  }
  // ... rest of handler
},
```

---

### 8. `authorize` — no change needed

**Analog:** `servers/hub.mjs` lines 66–78 and line 263

```js
// Server handler, line 263:
if (!authorize(req, res)) return;
```

`authorize` is already called globally before any route handler runs. File routes benefit automatically — no per-route auth logic needed.

---

## Shared Patterns

### Authentication
**Source:** `servers/hub.mjs` line 263
**Apply to:** All routes (already global — no action needed in new route handlers)

### Error handling
**Source:** `servers/hub.mjs` lines 272–276
**Apply to:** PUT handler must catch `err.code === "BODY_TOO_LARGE"` and return 413 before the server-level catch sends 500. All other handlers can rely on the server-level catch for unexpected errors.

### Response formatting
**Source:** `servers/hub.mjs` lines 34–41 (`json` helper)
**Apply to:** All four file route handlers — use `json(res, status, data)` exclusively.

---

## Concrete Route Implementations (Reference)

These are the exact shapes the executor should produce, derived mechanically from the patterns above.

### PUT /files/:swarmId/:filename

```js
"PUT /files/:swarmId/:filename": async (req, res, params) => {
  let content;
  try {
    content = await readRawBody(req);
  } catch (err) {
    if (err.code === "BODY_TOO_LARGE") return json(res, 413, { error: "File too large (max 10 MB)" });
    throw err;
  }
  const { swarmId, filename } = params;
  const mimeType = req.headers["content-type"] || "application/octet-stream";

  // D-02: replace existing entry for same swarm+filename
  for (const [existingId, f] of files) {
    if (f.swarmId === swarmId && f.filename === filename) {
      files.delete(existingId);
      break;
    }
  }

  const id = crypto.randomUUID();
  const entry = { id, swarmId, filename, content, size: content.length, mimeType, uploadedAt: new Date().toISOString() };
  files.set(id, entry);
  json(res, 200, { id, filename, size: entry.size, mimeType, uploadedAt: entry.uploadedAt });
},
```

### GET /files/:swarmId/:filename

```js
"GET /files/:swarmId/:filename": (req, res, params) => {
  const { swarmId, filename } = params;
  const entry = [...files.values()].find(f => f.swarmId === swarmId && f.filename === filename);
  if (!entry) return json(res, 404, { error: "File not found" });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const offset    = parseInt(url.searchParams.get("offset")    ?? "0",       10);
  const max_bytes = parseInt(url.searchParams.get("max_bytes") ?? "1000000", 10);

  const slice   = entry.content.slice(offset, offset + max_bytes);
  const has_more = offset + slice.length < entry.content.length;
  json(res, 200, { content: slice.toString("utf8"), offset, total_size: entry.size, has_more });
},
```

### GET /files/:swarmId

```js
"GET /files/:swarmId": (_req, res, params) => {
  const list = [...files.values()]
    .filter(f => f.swarmId === params.swarmId)
    .map(({ id, filename, size, mimeType, uploadedAt }) => ({ id, filename, size, mimeType, uploadedAt }));
  json(res, 200, list);
},
```

### DELETE /files/:swarmId/:filename

```js
"DELETE /files/:swarmId/:filename": (_req, res, params) => {
  const { swarmId, filename } = params;
  let found = null;
  for (const [id, f] of files) {
    if (f.swarmId === swarmId && f.filename === filename) { found = id; break; }
  }
  if (!found) return json(res, 404, { error: "File not found" });
  files.delete(found);
  json(res, 200, { deleted: true });
},
```

---

## No Analog Found

None. All patterns are sourced from `servers/hub.mjs` itself.

---

## Metadata

**Analog search scope:** `servers/hub.mjs` (sole file being modified)
**Files scanned:** 1
**Pattern extraction date:** 2026-04-26
