---
phase: 02-worker-http-server
plan: "01"
subsystem: mcp-server
tags: [worker-http, in-process-server, callback-url, swarm-register]

dependency_graph:
  requires: []
  provides:
    - worker HTTP server in-process (node:http)
    - callback_url nel body di swarm_register
    - gestione EADDRINUSE con errore leggibile
  affects:
    - servers/mcp-server.mjs

tech_stack:
  added:
    - node:http (built-in — nessuna dipendenza aggiunta)
  patterns:
    - Promise-wrapped http.createServer().listen() con porta 0 (OS-assigned)
    - Auth Bearer replicata da hub.mjs in workerRequestHandler
    - isError: true nel MCP tool return per errori EADDRINUSE

key_files:
  modified:
    - servers/mcp-server.mjs

decisions:
  - Worker server avviato PRIMA del POST all'hub per eliminare race condition (hub potrebbe fare push immediatamente dopo registrazione)
  - Porta 0 come default per evitare conflitti — l'OS assegna una porta libera
  - WORKER_HOST letto da SWARM_HOST env (stesso nome usato dall'hub per coerenza)
  - workerRequestHandler autentica con lo stesso SWARM_SECRET del hub — nessun segreto aggiuntivo

metrics:
  duration: "~10 minuti"
  completed: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 2 Plan 01: Worker HTTP Server In-Process Summary

Worker HTTP server integrato in `swarm_register` — avvia in-process con porta OS-assigned, comunica `callback_url` all'hub, autentica push con Bearer token SWARM_SECRET.

## Tasks Completed

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 | Aggiungi import, WORKER_HOST e funzioni helper | 8e0cb00 | servers/mcp-server.mjs |
| 2 | Modifica swarm_register — workerPort, startWorkerServer, callback_url | f93ac5b | servers/mcp-server.mjs |

## What Was Built

### Task 1 — Import, costanti e funzioni helper

Aggiunti a `servers/mcp-server.mjs`:

- `import http from "node:http"` — nessuna dipendenza esterna aggiunta
- `const WORKER_HOST = process.env.SWARM_HOST ?? "localhost"` — host configurabile via env
- `function json(res, status, data)` — helper per risposte HTTP uniformi (pattern da hub.mjs)
- `function workerRequestHandler(req, res)` — gestisce `GET /health`, `POST /`, auth Bearer, 404
- `function startWorkerServer(port = 0)` — Promise-wrapped listen, risolve con `{server, port}`, gestisce EADDRINUSE

### Task 2 — swarm_register esteso

- Schema zod: aggiunto `workerPort: z.number().optional()`
- Handler: `await startWorkerServer(portArg)` prima del POST all'hub
- Body POST all'hub: include `callback_url: \`http://${WORKER_HOST}:${boundPort}\``
- Errore EADDRINUSE: restituisce `isError: true` con messaggio leggibile

## Deviations from Plan

Nessuna — piano eseguito esattamente come scritto.

## Threat Model Coverage

Tutte le minacce con disposizione `mitigate` nel piano sono state indirizzate:

| Threat ID | Stato |
|-----------|-------|
| T-02-01 | Mitigato — auth Bearer in workerRequestHandler |
| T-02-04 | Mitigato — EADDRINUSE catturato, isError: true, nessun crash |
| T-02-05 | Mitigato — stesso SWARM_SECRET usato per autenticare push in arrivo |

## Known Stubs

Nessuno — tutti i percorsi code producono risposte reali.

## Verification Results

```
node --check servers/mcp-server.mjs          → OK (exit 0)
grep "^import http from" mcp-server.mjs      → import http from "node:http";
grep -E "^function (json|workerRequestHandler|startWorkerServer)"  → 3 righe
grep "callback_url" mcp-server.mjs           → 4 match
grep "await startWorkerServer" mcp-server.mjs → 1 match
grep "EADDRINUSE" mcp-server.mjs             → 1 match
smoke test porta 0                           → OK: porta OS-assigned = 35991
```

## Self-Check: PASSED

| Item | Stato |
|------|-------|
| servers/mcp-server.mjs | FOUND |
| 02-01-SUMMARY.md | FOUND |
| Commit 8e0cb00 (Task 1) | FOUND |
| Commit f93ac5b (Task 2) | FOUND |
