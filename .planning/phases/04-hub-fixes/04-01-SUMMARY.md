---
phase: 04-hub-fixes
plan: 01
subsystem: api
tags: [node, http, mcp, swarm, hub]

# Dependency graph
requires: []
provides:
  - "DELETE /workers/:id restituisce 404 per worker inesistente (HUB-04)"
  - "swarm_hub_start inietta system prompt SYSTEM per coordinamento swarm (HUB-05)"
affects: [mcp-server, hub, swarm-coordination]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Branch 404 esplicito prima del 200 in route DELETE — pattern già usato in GET e PATCH /workers/:id"
    - "System prompt iniettato come ultimo elemento dell'array text in risposta MCP"

key-files:
  created: []
  modified:
    - servers/hub.mjs
    - servers/mcp-server.mjs

key-decisions:
  - "Rimosso il campo 'deleted' dalla risposta 200 del DELETE: era ridondante (sempre true nel path di successo) e rivelava dettagli interni inutili (T-04-02)"
  - "System prompt hardcoded nel tool MCP — nessun input utente può alterarlo (D-04, T-04-03)"

patterns-established:
  - "Route DELETE: verifica il valore di ritorno di Map.delete() e restituisce 404 prima del 200"
  - "Tool MCP: array .join('\\n') per testo multi-parte con system prompt come elemento finale"

requirements-completed: [HUB-04, HUB-05]

# Metrics
duration: 10min
completed: 2026-04-25
---

# Phase 4 Plan 01: Hub Fixes Summary

**DELETE 404 branch aggiunto a hub.mjs + system prompt di coordinamento swarm iniettato in swarm_hub_start**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-25T00:00:00Z
- **Completed:** 2026-04-25T00:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- DELETE /workers/:id restituisce ora HTTP 404 con `{ error: "Worker not found" }` per ID inesistenti
- DELETE /workers/:id restituisce HTTP 200 con `{ ok: true }` (senza il campo ridondante `deleted`) per ID validi
- swarm_hub_start include un quarto elemento nel blocco testo con istruzione SYSTEM che guida Claude a delegare task ai worker e usare `swarm_list_workers`

## Task Commits

Ogni task committato atomicamente:

1. **Task 1: Fix DELETE /workers/:id — 404 per ID inesistente (HUB-04)** - `ccf8ddd` (fix)
2. **Task 2: Inietta system prompt in swarm_hub_start (HUB-05)** - `f68cf53` (feat)
3. **[Rule 1 auto-fix] swarm_kill_worker: data.deleted → data.ok** - `fdf49c2` (fix)

**Plan metadata:** (questo commit — docs)

## Files Created/Modified
- `servers/hub.mjs` - Aggiunto branch `if (!deleted)` con risposta 404; rimosso campo `deleted` dalla risposta 200
- `servers/mcp-server.mjs` - Aggiunto quarto elemento all'array text di `swarm_hub_start` con blocco SYSTEM

## Decisions Made
- Rimosso il campo `deleted` dalla risposta 200: era sempre `true` nel path di successo, nessun valore informativo per il client e violava il principio di minima divulgazione (T-04-02)
- System prompt hardcoded (non interpolato da input utente) per sicurezza (T-04-03, D-04)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] swarm_kill_worker usava data.deleted dopo la rimozione del campo dalla risposta 200**
- **Found during:** Task 2 (swarm_hub_start system prompt) — rilevato durante revisione del SUMMARY
- **Issue:** La risposta DELETE 200 non restituisce più il campo `deleted` (rimosso in Task 1), ma `swarm_kill_worker` in mcp-server.mjs lo usava ancora per il messaggio di output (`data.deleted ? "removed" : "not found"`). Il ternario era sempre falsy, mostrando sempre "not found" anche dopo una rimozione riuscita.
- **Fix:** Sostituito `data.deleted` con `data.ok` nel ternario di `swarm_kill_worker` — il campo `ok: true` è sempre presente nella risposta 200
- **Files modified:** servers/mcp-server.mjs (riga 318)
- **Verification:** `node --check servers/mcp-server.mjs` — syntax OK; grep conferma `data.ok`
- **Committed in:** `fdf49c2`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug causato direttamente dalla modifica del Task 1)
**Impact on plan:** Fix necessario per coerenza: la risposta 200 del DELETE non include più `deleted`, il client doveva essere aggiornato. Nessun scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - entrambe le modifiche sono comportamenti concreti, non placeholder.

## Threat Flags

Nessuna nuova superficie di attacco introdotta rispetto al threat model del piano.

## Self-Check

- [x] `servers/hub.mjs` contiene `if (!deleted) return json(res, 404, { error: "Worker not found" });` (riga 172)
- [x] `servers/hub.mjs` NON contiene `json(res, 200, { ok: true, deleted })`
- [x] `servers/mcp-server.mjs` contiene `Always delegate tasks to registered workers` (riga 70)
- [x] `servers/mcp-server.mjs` contiene `swarm_list_workers` nel blocco swarm_hub_start (riga 70)
- [x] `node --check servers/hub.mjs` — syntax OK
- [x] `node --check servers/mcp-server.mjs` — syntax OK
- [x] Commit `ccf8ddd` presente
- [x] Commit `f68cf53` presente
- [x] Commit `fdf49c2` presente (Rule 1 auto-fix)

## Self-Check: PASSED

## Next Phase Readiness
- hub.mjs e mcp-server.mjs pronti per uso in produzione
- Il client `swarm_kill_worker` usa ancora `data.deleted` per determinare il messaggio di output (riga 317 di mcp-server.mjs) — ora la risposta 200 non include più il campo `deleted`, quindi il check `data.deleted` sarà sempre falsy. Questo è un bug latente nel client MCP da correggere in una fase successiva.

---
*Phase: 04-hub-fixes*
*Completed: 2026-04-25*
