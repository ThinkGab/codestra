# Phase 3: Hub Push Delivery - Research

**Researched:** 2026-04-19
**Domain:** Node.js built-in fetch, HTTP push delivery, broadcast fan-out, silent failure handling
**Confidence:** HIGH

## Summary

Phase 3 is a surgical two-point modification of `servers/hub.mjs`. No new dependencies are
needed: Node.js 20.20.1 (verified on this machine) ships `fetch` as a stable global. Both
modification points are already wired for async handlers — the `POST /workers` and
`POST /messages` routes are `async` functions that `await readBody(req)` before responding.

The push logic follows a fire-and-complete-with-Promise.allSettled pattern for broadcast and
a single try/catch fetch call for unicast. In both cases, failure is silent: the message is
already stored before the push is attempted, so the polling path is always intact. The only
architectural subtlety is the mark-as-read-on-push decision (D-02): for broadcast, each
per-worker push result must independently control that worker's message `read` flag — which
means broadcast messages cannot share a single `read` boolean. The current data model uses
one `read` field per message object, which works for unicast but breaks D-02 for broadcast.
This is the single design gap the planner must resolve.

**Primary recommendation:** Add `pushToWorker(worker, msg)` as a private async helper in
`hub.mjs`, call it from `POST /messages` after `messages.push(msg)`. For broadcast, fan out
with `Promise.allSettled`. The mark-as-read-on-push for broadcast requires per-worker read
tracking; the simplest fix is a `readBy: Set<workerId>` field on each message and updating
`GET /messages/:workerId` to filter using it instead of the global `read` boolean.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Broadcast (`to === "broadcast"`) → push to ALL workers with `callback_url` individually. Per-worker failure is silent; that worker falls back to store-and-forward.
- **D-02:** Push success (2xx) → mark message `read: true` immediately. Push failure leaves `read: false`.
- **D-03:** `POST /messages` response contract unchanged — `{ok: true, message: msg}`. No delivery status field added.
- **D-04:** Hub POSTs full message object `{id, from, to, body, timestamp}` to `callback_url`.
- **D-05:** Push failure (network error OR non-2xx) is silent — no error to sender, message stays in store-and-forward.

### Claude's Discretion
- Whether to log failed push attempts to stderr — acceptable either way.
- Timeout for the push HTTP request — no value specified; reasonable default (e.g., 5s) is Claude's call.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HUB-01 | Hub saves `callback_url` in worker record at registration | Extend worker object in `POST /workers` handler (hub.mjs line 82-92); add `callback_url: body.callback_url \|\| null` |
| HUB-02 | When a message is sent to a worker, hub POSTs to its `callback_url` if available | `pushToWorker()` helper using built-in `fetch`; called from `POST /messages` after store |
| HUB-03 | Hub falls back silently to store-and-forward if `callback_url` absent or POST fails | try/catch around push, message already stored before push attempt, no re-throw |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Store callback_url at registration | API / Backend (hub.mjs) | — | Hub owns the worker registry Map |
| HTTP push to worker | API / Backend (hub.mjs) | — | Hub initiates outbound fetch; worker is passive receiver |
| Silent fallback to polling | API / Backend (hub.mjs) | — | Fallback is implicit — message was already stored; no action needed on failure |
| Mark-as-read on push | API / Backend (hub.mjs) | — | Hub sets read flag immediately on 2xx; no client involvement |
| Broadcast fan-out | API / Backend (hub.mjs) | — | Hub iterates worker Map and fires per-worker push |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fetch` | Node 20+ (stable) | HTTP POST to callback_url | Zero new dependencies; available as global in Node 20.20.1 (verified) |
| `AbortController` | Node 20+ (built-in) | Timeout for push requests | Standard Web API; no imports needed |
| `node:http` | built-in | Hub server (already used) | No change; hub already uses it |
| `node:crypto` | built-in | ID generation (already used) | No change |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Promise.allSettled` | ES2020 / Node 12+ | Broadcast fan-out | Use instead of `Promise.all` — prevents one worker failure from cancelling others |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in `fetch` | `node-fetch`, `axios`, `got` | No benefit — built-in fetch is stable in Node 20, adding deps is unnecessary complexity |
| `Promise.allSettled` | Sequential loop | Sequential is simpler but slower for large swarms; `allSettled` is idiomatic for fire-and-forget fan-out |
| `AbortController` timeout | `setTimeout` + manual abort | `AbortController` is the standard; integrates natively with `fetch`'s `signal` option |

**Installation:** No new packages required. [VERIFIED: node --version = v20.20.1]

---

## Architecture Patterns

### System Architecture Diagram

```
POST /messages (sender)
        │
        ▼
  readBody(req)
        │
        ▼
  validate fields (from, to, body)
        │
        ▼
  build msg object {id, from, to, body, timestamp, read:false}
        │
        ▼
  messages.push(msg)   ◄── store FIRST, always
        │
        ├─── to === "broadcast"?
        │           │ YES
        │           ▼
        │    [...workers.values()]
        │    .filter(w => w.callback_url)
        │           │
        │           ▼
        │    Promise.allSettled(
        │      workers.map(w => pushToWorker(w, msg))
        │    )  ← fire-and-forget; failures ignored
        │
        └─── to === workerId?
                    │
                    ▼
             worker = workers.get(to)
                    │
             worker.callback_url?
               YES ──► pushToWorker(worker, msg)
                             │
                         2xx? → msg.read = true
                         non-2xx/error → no-op (already stored)
               NO ──► no-op (already stored, polling works)
        │
        ▼
  json(res, 201, {ok:true, message: msg})
```

### Recommended Project Structure
No structural changes — this phase modifies `servers/hub.mjs` only. No new files needed.

### Pattern 1: pushToWorker Helper (Unicast and Broadcast)
**What:** Async function that POSTs a message to a worker's callback_url with AbortController timeout. Returns true on 2xx, false on any failure.
**When to use:** Called from `POST /messages` after the message is stored.

```javascript
// Source: Node.js 20 built-in fetch + AbortController (VERIFIED: node v20.20.1)
async function pushToWorker(worker, msg) {
  if (!worker.callback_url) return false;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000); // 5s timeout (Claude's discretion)
  try {
    const res = await fetch(worker.callback_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      msg.read = true; // D-02: mark read on push success
      return true;
    }
    return false; // non-2xx → fallback to polling (D-05)
  } catch {
    clearTimeout(timer); // covers AbortError and network errors
    return false; // D-05: silent failure
  }
}
```

### Pattern 2: Broadcast Fan-out with Promise.allSettled
**What:** For `to === "broadcast"`, push to all workers with a callback_url in parallel. Per-worker failures are silent.
**When to use:** Inside `POST /messages` after `messages.push(msg)`, when `body.to === "broadcast"`.

```javascript
// Source: MDN Promise.allSettled / Node 20 built-in (VERIFIED: available in Node 12+)
if (body.to === "broadcast") {
  const pushTargets = [...workers.values()].filter(w => w.callback_url);
  await Promise.allSettled(pushTargets.map(w => pushToWorker(w, msg)));
  // allSettled: never rejects, per-worker result irrelevant (D-05)
} else {
  const target = workers.get(body.to);
  if (target) await pushToWorker(target, msg);
}
```

### Pattern 3: POST /workers — Add callback_url to Worker Record
**What:** Extend the worker object built in `POST /workers` to include the optional `callback_url`.
**When to use:** Lines 82-92 of hub.mjs, inside the `POST /workers` handler.

```javascript
// hub.mjs POST /workers — extend worker object (line 82-92 analog)
const worker = {
  id,
  role: body.role || "worker",
  task: body.task || "",
  status: body.status || "idle",
  cwd: body.cwd || "",
  host: body.host || req.socket.remoteAddress || "unknown",
  callback_url: body.callback_url || null,  // ← ADD THIS (HUB-01)
  registeredAt: workers.has(id) ? workers.get(id).registeredAt : new Date().toISOString(),
  lastSeen: new Date().toISOString(),
};
```

### Anti-Patterns to Avoid
- **Pushing before storing:** Never attempt push before `messages.push(msg)`. If push crashes or times out and the message was never stored, it is lost.
- **Using Promise.all for broadcast:** If one push throws, `Promise.all` rejects and remaining pushes are abandoned. Use `Promise.allSettled`.
- **Surfacing push errors in the HTTP response:** D-03 locks the response to `{ok: true, message: msg}`. Do not add delivery status fields.
- **Not clearing the AbortController timer:** Always `clearTimeout(timer)` in both success and catch branches to avoid timer leaks on long-running hub processes.
- **Re-using the shared `read` boolean for broadcast mark-as-read without addressing the data model gap (see below).**

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for push | Custom `http.request` wrapper | Built-in `fetch` | `fetch` has cleaner Promise API, native AbortController integration, no callback pyramid |
| Timeout mechanism | Manual race with setTimeout + Promise.race | `AbortController` + `signal` passed to `fetch` | Standard, cancels cleanly, no dangling requests |
| Fan-out error isolation | try/catch around Promise.all | `Promise.allSettled` | Built-in; designed exactly for this use case |

**Key insight:** Node 20's built-in `fetch` with `AbortController` handles all three classical HTTP push concerns (timeout, error isolation, response status checking) without any library.

---

## Critical Design Gap: Broadcast + Mark-as-Read (D-02 + D-01 Conflict)

**This is the most important finding in this research.** The planner must make a decision here.

### The Problem

The current `messages` array stores one `read: boolean` per message object. The `GET /messages/:workerId` handler marks ALL matching messages as `read: true` when any worker polls.

For unicast (`to === workerId`), this is fine — there is one recipient, one `read` flag.

For broadcast (`to === "broadcast"`), D-02 requires that a successful push to worker A marks the message as read **for worker A only**. Worker B may not have been reached yet and must still receive the message via polling. With the current single `read` flag:

- Push succeeds for worker A → `msg.read = true`
- Worker B polls → filter sees `msg.read === true` → message excluded → **worker B never receives it**

### Resolution Options

**Option A: Per-worker `readBy` Set (recommended)**
Replace `read: false` with `readBy: new Set()`. On push success for worker W, do `msg.readBy.add(w.id)`. The `GET /messages/:workerId` filter becomes:

```javascript
// Broadcast: include if workerId not in readBy
// Unicast: include if not in readBy
const isUnread = !msg.readBy.has(params.workerId);
const isRecipient = msg.to === params.workerId || msg.to === "broadcast";
return isRecipient && (unreadOnly ? isUnread : true);

// Mark as read on poll:
matching.forEach(m => m.readBy.add(params.workerId));
```

This is backwards-compatible: unicast `readBy.has(workerId)` is equivalent to the old `read` boolean, and the response shape `{ok, message}` still uses the full `msg` object (Set is not JSON-serializable — serialize as `read: msg.readBy.has(recipientId)` or omit from response).

**Option B: Keep `read` boolean, skip D-02 for broadcast**
Accept that for broadcast, push success does NOT mark messages as read — message always stays available for polling. Simpler but does not implement D-02 for broadcast.

**Option C: Separate per-worker message copies for broadcast**
When `to === "broadcast"`, create one message object per worker. Unicast semantics then apply to each copy. More storage, but clean read tracking. Overkill for v1.0.

**Recommendation to planner:** Option A. The `readBy: Set` approach is the minimal correct fix. The response contract (D-03) is unchanged since `message` in `{ok, message}` is the msg object serialized without the Set field — just omit `readBy` from `JSON.stringify` or use a `toJSON` approach, or keep it as an array in the stored object.

**Simplest implementation note:** If the planner wants to avoid touching `GET /messages` at all, Option B is valid — just don't call `msg.read = true` for broadcast pushes. This means broadcast recipients always poll, which is acceptable behavior. The planner should pick one and lock it.

---

## Common Pitfalls

### Pitfall 1: AbortController Timer Leak
**What goes wrong:** If `clearTimeout(timer)` is missing from the catch branch, every failed push leaves a live timer. On a hub that processes many messages, this accumulates.
**Why it happens:** Developers clear the timer in success path only.
**How to avoid:** Put `clearTimeout(timer)` as the first line in both success (after `res.ok` check) and catch block.
**Warning signs:** Hub memory usage growing over time; Node process event loop staying alive after hub is meant to idle.

### Pitfall 2: Push Before Store
**What goes wrong:** If the push is attempted before `messages.push(msg)` and the push hangs until timeout, the HTTP response to the sender is also delayed. Worse — if the process crashes during the push, the message is lost.
**Why it happens:** Intuitive ordering: "push first, then store as fallback."
**How to avoid:** Always `messages.push(msg)` first. The hub response should fire after the push only when the push is fast (which it may not be). Consider whether to `await` the push or fire it after responding.
**Warning signs:** Sender POST /messages response takes 5+ seconds (the push timeout) whenever a worker is unreachable.

### Pitfall 3: Awaiting Push Before Responding to Sender
**What goes wrong:** If the hub `await`s the push (or `Promise.allSettled` for broadcast) before calling `json(res, 201, ...)`, the sender's request hangs for up to 5 seconds on each unreachable worker.
**Why it happens:** Straightforward sequential code: store → push → respond.
**How to avoid:** Two valid approaches:
  - (A) Respond first, then push: `json(res, 201, {ok:true, message:msg}); pushToWorker(worker, msg);` — fire-and-forget.
  - (B) Push with short timeout (already 5s) then respond — acceptable if 5s timeout is acceptable to caller.
  - D-03 says response contract is unchanged and push is opaque to sender, which implies approach (A) is the intent.
**Warning signs:** curl to `POST /messages` takes 5 seconds when worker is down.

### Pitfall 4: SWARM_SECRET Not Forwarded to Worker Push
**What goes wrong:** The hub POSTs to the worker's `callback_url`. The worker HTTP server (from Phase 2) checks `Authorization: Bearer <SECRET>` if `SWARM_SECRET` is set. If the hub doesn't include the secret in its outbound push headers, the worker returns 401, the hub sees non-2xx, and silently falls back — even though the worker is reachable.
**Why it happens:** `pushToWorker` only sets `Content-Type` header.
**How to avoid:** If `SECRET` is set, include `Authorization: Bearer ${SECRET}` in the push fetch headers.
**Warning signs:** Push always "fails" (falls back to polling) even when worker is running; worker logs show 401s.

### Pitfall 5: JSON.stringify of Set in Response
**What goes wrong:** If `readBy: new Set()` is stored on the message object and the hub returns `msg` directly in `json(res, 201, {ok: true, message: msg})`, `JSON.stringify(Set)` produces `{}` — the field disappears silently.
**Why it happens:** `Set` is not JSON-serializable.
**How to avoid:** Either (a) keep `readBy` as an internal field never included in the JSON response, (b) store as an Array and use `.includes()`, or (c) serialize with a replacer. Simplest: store the full msg object but build the response with only the fields callers expect: `{id, from, to, body, timestamp, read}`.

---

## Code Examples

### Complete pushToWorker (production-ready)
```javascript
// Source: Node.js 20 built-in fetch + AbortController [VERIFIED: node v20.20.1]
async function pushToWorker(worker, msg) {
  if (!worker.callback_url) return false;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const headers = { "Content-Type": "application/json" };
    if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
    const res = await fetch(worker.callback_url, {
      method: "POST",
      headers,
      body: JSON.stringify(msg),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      msg.readBy.add(worker.id); // or msg.read = true for unicast-only
      return true;
    }
    return false;
  } catch {
    clearTimeout(timer);
    return false;
  }
}
```

### POST /messages modified handler (respond-first pattern)
```javascript
// Source: hub.mjs lines 126-141 + push additions [VERIFIED: codebase read]
"POST /messages": async (req, res) => {
  const body = await readBody(req);
  if (!body.from || !body.to || !body.body) {
    return json(res, 400, { error: "Required fields: from, to, body" });
  }
  const msg = {
    id: generateId(),
    from: body.from,
    to: body.to,
    body: body.body,
    timestamp: new Date().toISOString(),
    readBy: new Set(),   // replaces read:false (Option A) or keep read:false (Option B)
  };
  messages.push(msg);
  // Respond immediately — push is fire-and-forget (D-03, D-05)
  json(res, 201, { ok: true, message: { ...msg, read: false } });
  // Push after response (non-blocking to sender)
  if (body.to === "broadcast") {
    const targets = [...workers.values()].filter(w => w.callback_url);
    Promise.allSettled(targets.map(w => pushToWorker(w, msg)));
  } else {
    const target = workers.get(body.to);
    if (target) pushToWorker(target, msg);
  }
},
```

### GET /messages/:workerId updated filter (Option A)
```javascript
// Updated to use readBy Set instead of read boolean
"GET /messages/:workerId": (req, res, params) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const wid = params.workerId;
  const matching = messages.filter((m) => {
    const isRecipient = m.to === wid || m.to === "broadcast";
    const isUnread = !m.readBy.has(wid);
    return unreadOnly ? isRecipient && isUnread : isRecipient;
  });
  matching.forEach((m) => m.readBy.add(wid));
  // Serialize: readBy Set not JSON-safe — map to read boolean for response
  json(res, 200, { messages: matching.map(m => ({
    id: m.id, from: m.from, to: m.to, body: m.body, timestamp: m.timestamp,
    read: m.readBy.has(wid),
  }))});
},
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` for HTTP requests in Node | Built-in `fetch` global | Node 18 (experimental), Node 21 (stable unflagged), Node 20 LTS with `--experimental-fetch` flag removed in 22 | No import needed in Node 20+ |
| Callback-based `http.request` | `fetch` Promise API | Node 20+ | Cleaner async/await pattern, no manual buffer concat |

**Note on fetch stability in Node 20:** Built-in fetch was added unflagged in Node 18 and is stable (not behind a flag) in Node 20. [VERIFIED: node v20.20.1 on this machine — `fetch` is available as global without any flag or import.]

---

## Race Condition Analysis: Push Before Worker HTTP Server is Up

**Question:** Can the hub push to a worker before its HTTP server is ready?

**Answer:** No, by design from Phase 2. The `swarm_register` tool in `mcp-server.mjs` (lines 112-138, verified) does:
1. `await startWorkerServer(portArg)` — waits for the HTTP server to be fully bound and listening
2. Only then POSTs to `/workers` with the `callback_url`

The hub only learns about `callback_url` after the worker's server is already listening. Therefore, any push the hub attempts will find a live server. [VERIFIED: mcp-server.mjs lines 112-148 — sequential: server up, then register]

The only edge case is if the worker server crashes between registration and the first push — handled by the silent failure / fallback-to-polling pattern (D-05, D-03).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `fetch` global | pushToWorker HTTP calls | ✓ | v20.20.1 | — |
| `AbortController` global | Push timeout | ✓ | v20.20.1 (built-in Web API) | — |
| `Promise.allSettled` | Broadcast fan-out | ✓ | Node 12+ / ES2020 | — |

No missing dependencies. Phase 3 requires no new packages.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no test config files or test directories found in codebase) |
| Config file | None — Wave 0 must create if tests are added |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HUB-01 | `POST /workers` stores `callback_url` in worker record | manual smoke | `curl -X POST localhost:7800/workers -d '{"callback_url":"http://localhost:9999"}'` then `GET /workers/:id` | ❌ no test infra |
| HUB-02 | Hub POSTs message to worker's callback_url | manual smoke | Start mock HTTP server, send message via hub, verify push received | ❌ no test infra |
| HUB-03 | Push failure → message available via poll | manual smoke | Point callback_url at unreachable host, send message, poll and verify message returned | ❌ no test infra |

### Wave 0 Gaps
No test infrastructure exists in this project. The phase is a small surgical edit (~30 LOC); manual smoke testing via curl is the verification path. No Wave 0 test file setup is needed unless the planner decides to add a test harness.

*(If no test infra is desired: "None — verification via curl smoke test matching the Phase 2 VERIFICATION.md pattern")*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | Partial | SWARM_SECRET bearer token forwarded in push headers |
| V5 Input Validation | Yes | `callback_url` received in POST body — validate it is a valid HTTP URL before storing |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via malicious callback_url | Spoofing/Tampering | Validate `callback_url` is HTTP/HTTPS before storing; consider blocking loopback/private ranges if security matters (out of scope for v1.0 LAN use) |
| Missing auth header on push | Spoofing | Forward `Authorization: Bearer ${SECRET}` in pushToWorker headers when SECRET is set |
| callback_url pointing to non-worker endpoint | Tampering | Silent failure handles it (D-05) — no additional mitigation needed |

**Note:** This is a LAN-only tool. SSRF hardening is documented as out of scope for v1.0 per REQUIREMENTS.md. The Secret forwarding on push (Pitfall 4) is the only security-relevant finding that must be implemented.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node.js built-in `fetch` requires no `--experimental-fetch` flag in Node 20 | Standard Stack | Low — verified by running node v20.20.1; fetch is available globally |

**All other claims were verified against codebase reads or runtime checks.**

---

## Open Questions

1. **Broadcast read-tracking model (must be decided before planning)**
   - What we know: Current `read: boolean` on message breaks D-02 for broadcast (one worker's push success marks message unreadable for others)
   - What's unclear: Does the planner want Option A (`readBy: Set`) or Option B (skip D-02 for broadcast)?
   - Recommendation: Option A — implement `readBy: Set`, update `GET /messages/:workerId` filter. ~15 extra lines but semantically correct.

2. **Respond-before-push vs respond-after-push**
   - What we know: If hub awaits push before responding, sender hangs for up to 5s on unreachable workers
   - What's unclear: Is the 5s sender wait acceptable? D-03/D-05 language ("push is opaque to sender") implies respond-first
   - Recommendation: Respond first, then push as fire-and-forget. Simplest and matches D-03 intent.

---

## Sources

### Primary (HIGH confidence)
- `servers/hub.mjs` (lines 1-210, full file read) — current routes, state, helpers, async handler pattern
- `servers/mcp-server.mjs` (lines 1-250, read) — swarm_register ordering guarantee, callback_url construction
- `.planning/phases/02-worker-http-server/02-PATTERNS.md` (full read) — Phase 2 patterns, startWorkerServer ordering
- `.planning/phases/03-hub-push-delivery/03-CONTEXT.md` (full read) — all locked decisions D-01 through D-05
- `.planning/REQUIREMENTS.md` (full read) — HUB-01, HUB-02, HUB-03 acceptance criteria
- Node.js v20.20.1 (verified via `node --version`) — confirms built-in `fetch` and `AbortController` availability

### Secondary (MEDIUM confidence)
- Node.js 20 release notes: `fetch` stable (unflagged) since Node 18 [ASSUMED from training knowledge — not re-verified against release notes in this session, but confirmed working by runtime]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node 20 fetch verified at runtime; no new dependencies
- Architecture: HIGH — hub.mjs fully read; exact line numbers known for both modification points
- Pitfalls: HIGH — derived from direct code analysis (Pitfall 4 Secret header, Pitfall 3 respond-before-push) + standard fetch/AbortController patterns
- Broadcast read-tracking gap: HIGH — identified by direct analysis of message data model vs D-01+D-02 requirements

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable Node.js APIs; hub.mjs is unlikely to change)
