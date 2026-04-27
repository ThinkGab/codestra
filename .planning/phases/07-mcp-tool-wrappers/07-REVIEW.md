---
phase: 07-mcp-tool-wrappers
reviewed: 2026-04-27T14:43:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - servers/mcp-server.mjs
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-04-27T14:43:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `servers/mcp-server.mjs` focusing on the four new file tools added in Phase 7
(`file_upload`, `file_download`, `file_list`, `file_delete`) and the module-level
`registeredWorkerId` variable that backs them.

The `registeredWorkerId` guard pattern is sound — all four tools correctly check for
falsy value before proceeding, and the module-level variable is set atomically at the
end of a successful `swarm_register` call. Error handling follows the established
try/catch pattern used by pre-existing tools.

One critical path-traversal issue exists in all four file tools: the `filename`
parameter is interpolated into the hub URL without sanitization, enabling a caller to
escape their worker namespace. Three additional warnings cover a misleading success
return on hub error, the semantic re-use of the JSON-oriented `hubFetch` for raw body
upload, and missing minimum-length validation on `filename`.

---

## Critical Issues

### CR-01: Path Traversal via `filename` in All Four File Tools

**File:** `servers/mcp-server.mjs:406` (also lines 442, 495, and `file_list` uses only workerId)
**Issue:** The `filename` parameter is interpolated directly into the hub URL path with
no sanitization:

```js
// file_upload — line 406
await hubFetch(`/files/${registeredWorkerId}/${filename}`, { method: "PUT", ... });

// file_download — line 442
await hubFetch(`/files/${registeredWorkerId}/${filename}?offset=...`);

// file_delete — line 495
await hubFetch(`/files/${registeredWorkerId}/${filename}`, { method: "DELETE" });
```

A caller can pass `../other-worker-id/secret.txt` as `filename`. The hub receives the
path `/files/<id>/../other-worker-id/secret.txt`, which — depending on how hub.mjs
resolves routes — can be normalized to `/files/other-worker-id/secret.txt`, allowing
one worker to read, overwrite, or delete another worker's files. Even if the hub
performs path normalization, the MCP layer should not forward attacker-controlled path
segments unvalidated.

**Fix:**
```js
// Add this guard at the top of each file tool handler, after the registeredWorkerId check:
function validateFilename(filename) {
  if (!filename || filename.length === 0) throw new Error("filename must not be empty");
  if (/[/\\]/.test(filename)) throw new Error("filename must not contain path separators");
  if (filename === '..' || filename.startsWith('../') || filename.startsWith('..\\'))
    throw new Error("filename must not traverse directories");
}

// In each handler, before the try block:
try {
  validateFilename(filename);
} catch (err) {
  return { content: [{ type: "text", text: err.message }], isError: true };
}
```

Alternatively use `encodeURIComponent(filename)` at the point of interpolation to
percent-encode slashes, preventing path traversal at the HTTP level while keeping the
fix local to the URL construction:

```js
await hubFetch(`/files/${registeredWorkerId}/${encodeURIComponent(filename)}`, ...);
```

`encodeURIComponent` is the lower-friction fix; the explicit validator is preferable if
filenames must also be validated for hub-side filesystem safety.

---

## Warnings

### WR-01: Success Return When Hub Assigns No Worker Record

**File:** `servers/mcp-server.mjs:162-184`
**Issue:** When the hub response does not include a `worker` object (e.g. `{ok: false}`
without an `error` field), `assignedId` becomes `""` and `registeredWorkerId` is set
to `""`. The tool then falls through to the success return at line 180, producing the
text `"Registered as undefined with ID: undefined"`. The caller sees a success response
with undefined fields and `registeredWorkerId` remains `""`, so all file tools will
subsequently return "Not registered: call swarm_register first" — a confusing failure
mode that is hard to diagnose.

```js
// Current — line 162
const assignedId = resolvedId || data.worker?.id || "";
registeredWorkerId = assignedId; // set even when empty

// Current — line 180 (reached even when data.worker is undefined)
text: `Registered as ${data.worker?.role} with ID: ${data.worker?.id}\n...`
```

**Fix:** Validate that the hub returned a usable worker record before treating
registration as successful:

```js
if (!data.worker?.id && !resolvedId) {
  // Hub didn't assign an ID and we didn't supply one — treat as failure
  httpServer.close(); httpServer = undefined;
  return {
    content: [{ type: "text", text: `Registration failed: hub returned no worker ID. Response: ${JSON.stringify(data)}` }],
    isError: true,
  };
}
const assignedId = resolvedId || data.worker.id;
registeredWorkerId = assignedId;
```

### WR-02: `hubFetch` Used for Raw String Body — Semantic Mismatch

**File:** `servers/mcp-server.mjs:405-409`
**Issue:** `hubFetch` is designed as a JSON API client (default `Content-Type:
application/json`, named `hubFetch`). The `file_upload` handler repurposes it to send
a raw UTF-8 string body with a caller-supplied MIME type:

```js
const data = await hubFetch(`/files/${registeredWorkerId}/${filename}`, {
  method: "PUT",
  body: content,           // raw string, NOT JSON
  headers: { "Content-Type": mimeType || "text/plain" },  // overrides the JSON default
});
```

This works today because the header override mechanism (`...options.headers`) correctly
replaces the default. However `hubFetch` also calls `res.json()` unconditionally on
line 34, so if the hub ever returns a non-JSON response (e.g. `200 OK` with plain text
body on upload), `hubFetch` will throw a JSON parse error that surfaces as a generic
"Hub not reachable" message — obscuring the real cause.

**Fix:** Either add a `raw: true` option to `hubFetch` that returns `res.text()` instead
of `res.json()`, or add a response-content-type check:

```js
async function hubFetch(path, options = {}) {
  const url = `${HUB_URL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : { _raw: await res.text(), _status: res.status };
}
```

Alternatively, keep `hubFetch` JSON-only and introduce a separate `hubPut(path, body, contentType)`
helper for the upload case.

### WR-03: `filename` Accepts Empty String (No `.min(1)` on Zod Schema)

**File:** `servers/mcp-server.mjs:394` (also lines 427, 485)
**Issue:** All three tools that take a `filename` parameter use bare `z.string()` with
no minimum length constraint. An empty string produces URLs like
`/files/<workerId>/` which may match a different hub route (e.g. the list endpoint),
causing unexpected behavior rather than a clear error.

```js
// Current
filename: z.string().describe("..."),

// Fix
filename: z.string().min(1).describe("..."),
```

---

## Info

### IN-01: Dual Representation of Worker ID (Module Variable + Closure Capture)

**File:** `servers/mcp-server.mjs:102, 163, 169`
**Issue:** The worker ID is tracked in two places simultaneously: `registeredWorkerId`
(module-level, read by file tools) and `assignedId` (closure-captured by the heartbeat
poll). These are set from the same value at registration time and stay in sync because
re-registration clears the old interval. The pattern is correct but creates a cognitive
burden — a future maintainer editing the poll closure might not realize `registeredWorkerId`
also needs updating, or vice versa. A comment linking the two would reduce risk.

**Fix:** Add a brief comment at the `pollInterval` assignment:
```js
// assignedId is also captured in registeredWorkerId (module scope) for file tools.
// Both are set from the same source; keep them in sync if this logic changes.
pollInterval = setInterval(async () => { ... }, 10_000);
```

### IN-02: `file_download` Query Parameters Not URL-Encoded

**File:** `servers/mcp-server.mjs:442`
**Issue:** `offset` and `max_bytes` are interpolated directly into the query string.
Both are numeric (resolved via `?? 0` and `?? 25000`) so there is no injection risk
in practice. However the pattern is inconsistent with URL construction best practices
and would become a bug if the types ever changed.

**Fix:** Use `URLSearchParams` for robustness:
```js
const params = new URLSearchParams({
  offset: String(resolvedOffset),
  max_bytes: String(resolvedMaxBytes),
});
const data = await hubFetch(`/files/${registeredWorkerId}/${encodeURIComponent(filename)}?${params}`);
```

---

_Reviewed: 2026-04-27T14:43:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
