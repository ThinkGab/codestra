---
phase: 03-hub-push-delivery
plan: 02
subsystem: api
tags: [node, http, esm, hub, push, messaging, setImmediate, broadcast]

# Dependency graph
requires:
  - phase: 03-hub-push-delivery/03-01
    provides: pushToWorker helper, readBy:Set on messages, callback_url on worker records

provides:
  - POST /messages with respond-before-push pattern (setImmediate)
  - Unicast push delivery to specific worker via callback_url
  - Broadcast fan-out via Promise.allSettled to all workers with callback_url
  - Per-worker readBy marking on push success (msg.readBy.add(worker.id))
  - Silent fallback to store-and-forward on push failure

affects:
  - Future phases consuming push delivery behavior (e.g., worker-side push handling)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Respond-before-push: json(res, 201) called before setImmediate — sender response never blocked"
    - "Promise.allSettled fan-out for broadcast — one worker failure does not cancel others"
    - "Boolean sentinel from pushToWorker: true=delivered, false=silent fallback"

key-files:
  created: []
  modified:
    - servers/hub.mjs

key-decisions:
  - "setImmediate chosen over setTimeout(0) — semantically correct for 'after response is flushed'"
  - "Broadcast uses .filter(w => w.callback_url) before fan-out — workers without callback_url excluded cleanly"
  - "Unicast workers.get(msg.to) lookup — if worker not registered, push silently skipped (store-and-forward intact)"

patterns-established:
  - "setImmediate(async () => { ... }) pattern for fire-after-response async work in Node.js HTTP handlers"
  - "Promise.allSettled pattern for parallel fan-out where partial failure is acceptable"

requirements-completed:
  - HUB-02
  - HUB-03

# Metrics
duration: 1min
completed: 2026-04-19
---

# Phase 3 Plan 02: Hub Push Delivery — Respond-Before-Push Unicast and Broadcast Fan-out Summary

**POST /messages ora consegna attivamente i messaggi via setImmediate con unicast e Promise.allSettled broadcast, segnando readBy.add per push riusciti e lasciando store-and-forward invariato su fallback**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-19T00:00:03Z
- **Completed:** 2026-04-19T00:01:00Z
- **Tasks:** 2 completati (Task 1 feat + Task 2 human-verify approvato)
- **Files modified:** 1

## Accomplishments

- `POST /messages` risponde `201` al mittente prima di qualsiasi tentativo di push (respond-before-push via `setImmediate`)
- Unicast: se il worker destinatario ha `callback_url`, l'hub fa POST immediato; su 2xx `msg.readBy.add(worker.id)` previene duplicati via polling
- Broadcast: `Promise.allSettled` fan-out a tutti i worker con `callback_url`; fallimento di un singolo worker non blocca gli altri
- Push failure silenzioso: `pushToWorker` restituisce false, `readBy` non aggiornato, messaggio rimane disponibile via polling (store-and-forward intatto)

## Task Commits

1. **Task 1: Add respond-before-push with unicast and broadcast delivery** - `25aa5c6` (feat)
2. **Task 2: Verify end-to-end push delivery manually** - checkpoint:human-verify — APPROVED by user

## Files Created/Modified

- `servers/hub.mjs` — POST /messages handler esteso con setImmediate, unicast/broadcast push, readBy marking

## Decisions Made

- `setImmediate` scelto per la semantica "dopo che la risposta è stata inviata" — più corretto di `setTimeout(0)` per questo caso d'uso
- Nessuna modifica a `mcp-server.mjs` — conforme al vincolo del piano

## Deviations from Plan

None - piano eseguito esattamente come scritto.

## Issues Encountered

None.

## User Setup Required

None - nessuna configurazione di servizi esterni richiesta.

## Next Phase Readiness

- Push delivery completamente implementato e verificato lato hub
- Task 2 (checkpoint:human-verify) APPROVATO dall'utente
- Scenari verificati: unicast push, broadcast fan-out, fallback silenzioso su worker senza callback_url
- Hub pronto per fasi successive che consumano il comportamento push

## Self-Check: PASSED

- `servers/hub.mjs` FOUND
- Commit `25aa5c6` FOUND (feat: wire respond-before-push)
- `setImmediate` presente alla riga 169
- `Promise.allSettled` presente alla riga 173
- `msg.to === "broadcast"` presente alla riga 170
- `msg.readBy.add(worker.id)` presente alle righe 176 e 184
- `json(res, 201, ...)` alla riga 167 — PRIMA di setImmediate (riga 169)
- `node --check servers/hub.mjs` → SYNTAX OK
- Nessun `read: false` residuo
- Task 2 human-verify: APPROVATO dall'utente

---
*Phase: 03-hub-push-delivery*
*Completed: 2026-04-19*
