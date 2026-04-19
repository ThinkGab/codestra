# Phase 3: Hub Push Delivery - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Hub delivers messages to workers via HTTP POST to their `callback_url`, falling back silently to store-and-forward when push fails or `callback_url` is absent.

Two surgical changes in `servers/hub.mjs`:
1. `POST /workers` — persist `callback_url` field into the worker record
2. `POST /messages` — attempt HTTP POST to worker's `callback_url` before (or instead of) pure store-and-forward

</domain>

<decisions>
## Implementation Decisions

### Broadcast Push (D-01)
- **D-01:** When `to === "broadcast"`, hub iterates ALL workers with a `callback_url` and POSTs to each individually. Workers without `callback_url` receive the message via store-and-forward only. Per-worker push failure is silent and that worker's copy falls back to store-and-forward.

### Mark-as-Read on Push (D-02)
- **D-02:** When a push succeeds (2xx response from worker), the message is marked `read: true` immediately. Subsequent polls by that worker will not return the message again. Push failure leaves the message as `read: false` so polling still works.

### Delivery Status in Response (D-03)
- **D-03:** `POST /messages` response contract is unchanged — `{ok: true, message: msg}`. Push is best-effort and opaque to the sender. No `delivered`, `pushed`, or `push_ok` field added.

### Push Payload Format (D-04)
- **D-04:** Hub POSTs the full message object to `callback_url`: `{id, from, to, body, timestamp}`. Worker handler already prints the raw body — no change needed there.

### Failure Behavior (D-05)
- **D-05:** Push failure (network error OR non-2xx response) is silent — no error surfaced to sender, message stays in store-and-forward. No logging to stderr unless Claude's discretion.

### Claude's Discretion
- Whether to log failed push attempts to stderr (e.g., `process.stderr.write`) — acceptable either way, not user-specified.
- Timeout for the push HTTP request — no value specified; reasonable default (e.g., 5s) is Claude's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core source files
- `servers/hub.mjs` — file to modify: `POST /workers` route (save callback_url) and `POST /messages` route (attempt push)
- `servers/mcp-server.mjs` — reference: worker HTTP handler (`POST /`) accepts the push payload; `startWorkerServer` and `swarm_register` for context on how callback_url is formed

### Requirements
- `.planning/REQUIREMENTS.md` — HUB-01, HUB-02, HUB-03 are the acceptance criteria for this phase

### Prior phase context
- `.planning/phases/02-worker-http-server/02-CONTEXT.md` — D-03/D-04: callback_url format, D-05/D-06: worker push handler behavior

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hub.mjs` `json(res, status, data)` helper — use for any new response formatting
- `hub.mjs` `readBody(req)` — use if hub needs to read push response body (unlikely needed)
- Node.js built-in `fetch` (Node 20+) — hub can call `fetch(callbackUrl, {method:'POST', ...})` directly, no new dependency

### Established Patterns
- Worker Map: `workers` is `Map<id, Worker>` — add `callback_url` as an optional field on the worker object in `POST /workers`
- Current `POST /workers` handler (lines 79-94): reads body, builds worker object, stores with `workers.set(id, worker)`. Add `callback_url: body.callback_url || null` to the worker object.
- Current `POST /messages` handler (lines 126-141): stores message then returns 201. Push logic goes after `messages.push(msg)` and before `json(res, 201, ...)`.
- For broadcast: iterate `[...workers.values()].filter(w => w.callback_url)` and fire push per worker.

### Integration Points
- `POST /workers` route in hub.mjs: extend worker record to include `callback_url`
- `POST /messages` route in hub.mjs: add push-then-fallback logic after message is stored
- Worker HTTP server (mcp-server.mjs `POST /`) receives the push — no change needed there for Phase 3

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — open to standard Node.js fetch-based push pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-hub-push-delivery*
*Context gathered: 2026-04-19*
