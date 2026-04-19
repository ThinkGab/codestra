---
phase: 03-hub-push-delivery
plan: 01
subsystem: api
tags: [node, http, esm, hub, push, messaging]

# Dependency graph
requires:
  - phase: 02-worker-http-server
    provides: worker HTTP server foundation and registration flow

provides:
  - callback_url field on worker records in the in-memory Map
  - readBy:Set on message objects replacing read:boolean
  - GET /messages/:workerId with per-worker unread tracking via readBy
  - pushToWorker(worker, msg) async helper ready for Plan 02 to wire into POST /messages

affects:
  - 03-02 (Plan 02 wires pushToWorker into POST /messages — depends entirely on this plan)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - readBy:Set pattern for per-worker message delivery tracking (replaces single boolean)
    - AbortSignal.timeout(5000) for outbound fetch timeout (Node 20+ built-in, no deps)
    - pushToWorker returns boolean sentinel (true=2xx, false=any error) for caller logic

key-files:
  created: []
  modified:
    - servers/hub.mjs

key-decisions:
  - "readBy is a Set<workerId> — enables broadcast messages to be tracked per-recipient without duplication"
  - "pushToWorker swallows all errors and returns false — caller (Plan 02) decides retry/fallback logic"
  - "Authorization header in pushToWorker uses same SWARM_SECRET as hub auth — worker validates same secret"
  - "callback_url stored as null when absent — null is explicit sentinel for store-and-forward fallback"

patterns-established:
  - "Push payload excludes readBy (internal hub state) — only {id, from, to, body, timestamp} sent to worker"
  - "AbortSignal.timeout(5000) pattern for all outbound hub→worker requests"

requirements-completed:
  - HUB-01
  - HUB-03

# Metrics
duration: 8min
completed: 2026-04-19
---

# Phase 3 Plan 01: Hub Push Delivery — Data Model and Push Infrastructure Summary

**readBy:Set schema replacing read:boolean, callback_url on worker records, and pushToWorker async helper with Bearer auth and 5s timeout**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-19T00:00:00Z
- **Completed:** 2026-04-19T00:08:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Worker records now persist `callback_url: body.callback_url || null` — null is the explicit sentinel for store-and-forward fallback
- Message objects migrated from `read: boolean` to `readBy: Set<workerId>` enabling per-worker delivery tracking (critical for broadcast messages)
- GET /messages/:workerId updated to use `readBy.has()` / `readBy.add()` — each worker polls independently without affecting other workers' unread state
- `pushToWorker(worker, msg)` helper added in the Helpers section — POST to callback_url, Authorization Bearer SWARM_SECRET, AbortSignal.timeout(5000), returns true on 2xx / false on any error

## Task Commits

1. **Task 1: Persist callback_url on worker record** - `53a430f` (feat)
2. **Task 2: Replace read:boolean with readBy:Set and add pushToWorker helper** - `c85a242` (feat)

## Files Created/Modified

- `servers/hub.mjs` — Extended with callback_url field, readBy:Set schema, updated GET route, pushToWorker helper

## Decisions Made

- `readBy` as `Set<workerId>` rather than `boolean` enables broadcast messages to be independently consumed by each recipient without state collision
- `pushToWorker` returns a boolean sentinel (not throws) so Plan 02's caller logic stays simple: check return value, fall back to store-only if false
- Push payload explicitly excludes `readBy` — it is internal hub state, not part of the message contract sent to workers

## Deviations from Plan

None - piano eseguito esattamente come scritto.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can now import and call `pushToWorker` directly from within POST /messages
- `callback_url` is available on every worker object retrieved from the Map
- `readBy` tracking is live on all new messages — Plan 02 can mark delivery via `msg.readBy.add(workerId)` after a successful push
- No blockers

---
*Phase: 03-hub-push-delivery*
*Completed: 2026-04-19*
