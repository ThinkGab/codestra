---
phase: 06-hub-file-routes
reviewed: 2026-04-26T19:55:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - servers/hub.mjs
  - tests/task1-files-map-rawbody.test.mjs
  - tests/task2-file-routes.test.mjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-26T19:55:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the Phase 6 implementation: four file route handlers added to `servers/hub.mjs`
(`PUT /files/:swarmId/:filename`, `GET /files/:swarmId/:filename`, `GET /files/:swarmId`,
`DELETE /files/:swarmId/:filename`) plus the `readRawBody` helper and the `files` Map, with
their corresponding TDD test suites.

The core logic is sound. Route dispatch, duplicate-replacement semantics, 413 handling, and
the drain-then-respond pattern all work correctly. Two warnings require attention: binary
content is silently corrupted on download, and the `readRawBody` oversize error leaves the
socket receiving (and discarding) data without destroying it, which can hold the connection
open for the full upload duration before the 413 can be sent.

---

## Warnings

### WR-01: Binary file content corrupted on GET via UTF-8 decode

**File:** `servers/hub.mjs:297`
**Issue:** The GET download route returns file content as a UTF-8 string:
```js
json(res, 200, { content: slice.toString("utf8"), ... });
```
`content` is stored as a raw `Buffer` (from `readRawBody`). For any file that contains bytes
that are not valid UTF-8 (images, compiled binaries, arbitrary `.bin` files), `toString("utf8")`
silently replaces invalid byte sequences with the Unicode replacement character (U+FFFD).
The original bytes are unrecoverable. The upload handler accepts `application/octet-stream`,
so callers reasonably expect binary round-trips to work.

**Fix:** Encode binary content as Base64 and document the encoding in the response:
```js
const encoded = slice.toString("base64");
json(res, 200, {
  content: encoded,
  encoding: "base64",       // <-- callers decode with Buffer.from(content, "base64")
  offset,
  total_size: entry.size,
  has_more,
});
```
The test at SC2 sends `"hello world"` (pure ASCII) so it passes regardless — add a binary
round-trip test to catch regressions.

---

### WR-02: Oversized upload keeps socket open for entire body duration before 413 is sent

**File:** `servers/hub.mjs:77–80` and `servers/hub.mjs:259–264`
**Issue:** When `total > maxBytes`, `readRawBody` rejects immediately but does NOT call
`req.destroy()` or `req.pause()`. The socket continues receiving (and discarding, via the
`if (rejected) return` guard) all remaining bytes before the handler can send the 413 response.
For a 10.5 MB upload, the full payload must finish arriving before the caller's drain wait
resolves and `json(res, 413, ...)` executes. On a slow link this is a multi-second stall.

Contrast with `readBody` (line 53) which calls `req.destroy()` immediately — that is the
correct pattern for hard limits.

**Fix:** Add `req.destroy()` immediately after setting `rejected = true`:
```js
req.on("data", (c) => {
  if (rejected) return;
  total += c.length;
  if (total > maxBytes) {
    rejected = true;
    req.destroy();              // <-- abort the socket now
    const err = new Error("Request body too large");
    err.code = "BODY_TOO_LARGE";
    return reject(err);
  }
  chunks.push(c);
});
```
Then simplify the PUT handler — no drain loop is needed because the `close` event fires
immediately after `destroy()`:
```js
} catch (err) {
  if (err.code === "BODY_TOO_LARGE") {
    return json(res, 413, { error: "File too large (max 10 MB)" });
  }
  throw err;
}
```
Note: calling `json()` after `req.destroy()` is safe — `res` is a separate writable stream.

---

## Info

### IN-01: `GET /files/:swarmId` returns a bare array — inconsistent envelope with all other routes

**File:** `servers/hub.mjs:305`
**Issue:** All other list routes wrap their payload in a named key:
- `GET /workers` → `{ workers: [...] }`
- `GET /messages/:workerId` → `{ messages: [...] }`
- `GET /files/:swarmId` → `[...]` (bare array)

The test (task2-file-routes.test.mjs:163) explicitly asserts `Array.isArray(res.data)`, so
this is intentional per the current spec. However, it breaks the API's structural convention
and makes it harder to add top-level metadata (e.g., `total`, `swarmId`) later without a
breaking change.

**Fix (optional, needs spec change):** Wrap in a consistent envelope:
```js
json(res, 200, { files: list });
```
Update the test assertion accordingly. Coordinate with any MCP tool that calls this route.

---

### IN-02: No input validation on `:swarmId` or `:filename` URL params

**File:** `servers/hub.mjs:268–282` (PUT), `servers/hub.mjs:287` (GET), `servers/hub.mjs:310` (DELETE)
**Issue:** `swarmId` and `filename` are used directly as map lookup keys and stored in
metadata without any character validation. While the data never touches the filesystem
(all in-memory), extremely long values or special characters could cause unexpected
behaviour in downstream consumers that might log or display them.

The path-traversal test (task2-file-routes.test.mjs:214) confirms `../etc/passwd` is stored
opaquely — the comment notes this is by design. That is correct for the in-memory model.
This is a low-priority hygiene note, not a security issue.

**Fix:** Consider a simple allowlist validation (alphanumeric, dash, dot, underscore) if
downstream consumers are expected to treat these values as safe identifiers:
```js
const SAFE_SEGMENT = /^[\w.\-]+$/;
if (!SAFE_SEGMENT.test(swarmId) || !SAFE_SEGMENT.test(filename)) {
  return json(res, 400, { error: "Invalid swarmId or filename" });
}
```

---

_Reviewed: 2026-04-26T19:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
