---
plan: 05-01
phase: 05-worker-lifecycle
status: complete
requirements: [WORKER-03, WORKER-04, WORKER-05]
commits:
  - b9f2b65: "feat(05-01): hoist lifecycle state + swarmId param in swarm_register"
  - 544500f: "feat(05-01): add polling fallback (WORKER-04) and stdin-close cleanup (WORKER-05)"
---

## Summary

Implementati tutti e tre i comportamenti del ciclo di vita dei worker in `servers/mcp-server.mjs`: il parametro opzionale `swarmId` è stato aggiunto alla tool `swarm_register` (con priorità su `INSTANCE_ID` env var per la costruzione del body hub POST); le variabili `httpServer` e `pollInterval` sono state hoistate a scope di modulo prima della dichiarazione `swarm_register`; un loop di polling opzionale a 10 secondi viene avviato dopo la registrazione solo se `callbackUrl` è assente (percorso di fallback); la funzione `cleanup()` fa `clearInterval(pollInterval)` e `httpServer.close()`, ed è agganciata a `process.stdin.on('close')` dopo `server.connect(transport)` per garantire l'uscita pulita del daemon MCP senza processi orfani.

## Key Files

### Modified
- `servers/mcp-server.mjs` — aggiunto parametro `swarmId` a schema e handler di `swarm_register`; hoistate `let httpServer` e `let pollInterval` a scope di modulo (prima di `swarm_register`); catturato `result.server` in `httpServer` dentro il try block; sostituito `if (INSTANCE_ID) body.id = INSTANCE_ID` con `resolvedId = swarmId || INSTANCE_ID`; aggiunto blocco polling condizionale `if (!callbackUrl)` dopo hubFetch POST; aggiunta funzione `cleanup()` e listener `process.stdin.on('close', cleanup)` al fondo del file

## Key Decisions

- Le variabili di modulo `let httpServer` e `let pollInterval` sono posizionate alla riga 100, prima della tool `swarm_register` (riga 105) ma dopo le tool `swarm_hub_start` (riga 46) e `swarm_hub_status` (riga 80). Il piano indicava di inserirle "before the first `server.tool(` call" ma l'intent reale (confermato da PATTERNS.md INSERTION C) era che fossero accessibili alla closure `swarm_register`. La posizione scelta (tra hub_status e swarm_register) soddisfa l'intent funzionale senza riorganizzare la struttura del file.
- Il blocco di polling è condizionale su `!callbackUrl`: nella versione corrente del codice `callbackUrl` è sempre valorizzata (deriva da `startWorkerServer`), quindi il polling non si attiva mai in normale operazione — è predisposto come fallback strutturale per refactoring futuri.
- Nessuna chiamata DELETE all'hub nel cleanup (D-10): troppo fragile nel path di uscita.

## Self-Check

| Criterio | Stato |
|----------|-------|
| `swarm_register` accetta `swarmId` opzionale che fa override su `SWARM_ID` env var | PASSA — `resolvedId = swarmId \|\| INSTANCE_ID` alla riga 141 |
| Dopo `swarm_register`, `pollInterval` è dichiarato a scope di modulo | PASSA — `let pollInterval` alla riga 101 |
| Quando stdin si chiude, `cleanup()` esegue `clearInterval(pollInterval)` + `httpServer.close()` | PASSA — listener alla riga 424 |
| Il daemon MCP esce naturalmente dopo chiusura stdin (nessun processo orfano) | PASSA — cleanup libera server HTTP e timer |
| `httpServer` catturato da `startWorkerServer` e disponibile a cleanup | PASSA — `httpServer = result.server` alla riga 123 |
| `node --check servers/mcp-server.mjs` esce 0 | PASSA — verificato |
| `grep -c "swarmId"` >= 3 | PASSA — 3 occorrenze |
| `grep -c "resolvedId"` >= 2 | PASSA — 3 occorrenze |
| `grep -c "setInterval"` == 1 | PASSA |
| `grep -c "clearInterval"` == 1 | PASSA |
| `grep "process.stdin.on"` == 1 | PASSA |

## Self-Check: PASSED
