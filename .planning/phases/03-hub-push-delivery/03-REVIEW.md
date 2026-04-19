---
phase: 03-hub-push-delivery
reviewed: 2026-04-19T13:37:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - servers/hub.mjs
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-19T13:37:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

`servers/hub.mjs` implements the hub HTTP broker with worker registration, unicast/broadcast messaging, and the new push-delivery (D-series) logic introduced in Phase 3. The push delivery structure is sound — `setImmediate` decoupling, `Promise.allSettled` for broadcast, and store-and-forward fallback are all correctly implemented.

Two critical issues were found: a timing-attack vulnerability in the secret comparison, and SSRF-grade secret exfiltration via unvalidated `callback_url`. Three warnings cover a missing body-size cap (DoS vector), a `Set` that silently serializes to `{}` in all JSON responses (breaking clients that read `readBy`), and a falsy-check bug that silently ignores empty-string field updates. Two info items note a URL re-parse and console output style.

---

## Critical Issues

### CR-01: Timing Attack on `SWARM_SECRET` Comparison

**File:** `servers/hub.mjs:61`
**Issue:** `token === SECRET` uses a non-constant-time string comparison. An attacker on the LAN can measure response latency to infer the secret one character at a time, eventually recovering it without brute-forcing the full keyspace.
**Fix:**
```js
function authorize(req, res) {
  if (!SECRET) return true;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  // Use constant-time comparison to prevent timing attacks
  const tokenBuf  = Buffer.from(token.padEnd(SECRET.length));
  const secretBuf = Buffer.from(SECRET);
  if (
    tokenBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(tokenBuf, secretBuf)
  ) return true;
  json(res, 401, { error: "Unauthorized — set SWARM_SECRET" });
  return false;
}
```

---

### CR-02: `SWARM_SECRET` Forwarded to Attacker-Controlled `callback_url` (SSRF / Secret Exfiltration)

**File:** `servers/hub.mjs:73-87`
**Issue:** `pushToWorker` unconditionally sends `Authorization: Bearer ${SECRET}` to whatever URL a worker registered as `callback_url`. A malicious or compromised worker can register `callback_url: "https://attacker.example.com/collect"` and receive the hub's shared secret on the first broadcast or unicast delivery. No validation is performed on the URL scheme, host, or port.
**Fix:** Validate that `callback_url` is a loopback or LAN address before storing it, or omit the `Authorization` header on outbound push calls (workers do not need to authenticate the hub's push — they can verify message integrity by other means, or the push endpoint can be unauthenticated):
```js
// Option A — strip Authorization from outbound push (simplest, recommended)
const res = await fetch(worker.callback_url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: msg.id, from: msg.from, to: msg.to,
                         body: msg.body, timestamp: msg.timestamp }),
  signal: AbortSignal.timeout(5000),
});

// Option B — allowlist callback_url at registration time
function isLanUrl(raw) {
  try {
    const { hostname } = new URL(raw);
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  } catch { return false; }
}
// In POST /workers handler, before workers.set():
if (body.callback_url && !isLanUrl(body.callback_url)) {
  return json(res, 400, { error: "callback_url must be a LAN address" });
}
```

---

## Warnings

### WR-01: `Set` Serializes as `{}` in All JSON Responses — `readBy` Always Empty to Clients

**File:** `servers/hub.mjs:162-167, 201`
**Issue:** `msg.readBy` is a `Set`. `JSON.stringify(new Set([...]))` always produces `"{}"` regardless of contents. Every response from `POST /messages` (line 167) and `GET /messages/:workerId` (line 201) sends `readBy: {}` to the client. Any client that reads `readBy` to determine delivery status will always see it as empty.
**Fix:** Either serialize to an array at response time, or store `readBy` as a `Set` internally and convert on output:
```js
// In the json() helper, or at the call sites, convert Set fields:
json(res, 201, { ok: true, message: { ...msg, readBy: [...msg.readBy] } });

// And in GET /messages/:workerId:
json(res, 200, { messages: matching.map(m => ({ ...m, readBy: [...m.readBy] })) });
```

---

### WR-02: No Request Body Size Limit — Unbounded Memory Consumption (DoS)

**File:** `servers/hub.mjs:43-56`
**Issue:** `readBody` accumulates all incoming chunks in the `chunks` array with no size cap. A client (or attacker on the LAN) can send a gigabyte-sized body and the server will buffer it entirely in RAM before responding. This will exhaust available memory and crash the process.
**Fix:** Add a hard limit and destroy the connection if exceeded:
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
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}
```
Then handle the rejection in the route try/catch (which already returns a 500).

---

### WR-03: Falsy Check Silently Ignores Empty-String Field Updates in `PATCH /workers/:id`

**File:** `servers/hub.mjs:138-139`
**Issue:** `if (body.status) w.status = body.status` and `if (body.task) w.task = body.task` use truthy checks. A caller sending `{ "task": "" }` to clear a worker's task gets a silent no-op — the field is not cleared and no error is returned. This creates a confusing API contract where a valid patch payload is silently ignored.
**Fix:** Check for `undefined` explicitly instead of truthiness:
```js
if (body.status !== undefined) w.status = body.status;
if (body.task   !== undefined) w.task   = body.task;
```

---

## Info

### IN-01: `req.url` Parsed Twice — Once in Router, Once in `GET /messages/:workerId` Handler

**File:** `servers/hub.mjs:193, 239`
**Issue:** The server handler at line 239 already constructs a `URL` object from `req.url` for routing, but this object is not passed to route handlers. The `GET /messages/:workerId` handler re-parses `req.url` at line 193 solely to read query params. This is harmless but adds minor redundancy.
**Fix:** Pass the already-parsed `url` object as a fourth argument to handlers, or attach it to `req`:
```js
// In server handler, after line 240:
req.parsedUrl = url;
// Then in the route handler, replace line 193:
const url = req.parsedUrl;
```

---

### IN-02: File Header Still References "Claude Swarm" — Stale Internal Name

**File:** `servers/hub.mjs:3`
**Issue:** The file docblock reads `Claude Swarm — Hub Server`. Per the project timeline, the plugin was rebranded to "Codestra" (observation 111). The internal name `SWARM_*` env vars are fine as an implementation detail, but the public-facing comment should reflect the product name.
**Fix:**
```js
/**
 * Codestra — Hub Server
 * ...
 */
```

---

_Reviewed: 2026-04-19T13:37:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
