---
phase: 02-worker-http-server
verified: 2026-04-19T12:50:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Verificare che il worker HTTP server rimanga in ascolto per tutta la durata della sessione MCP"
    expected: "Dopo swarm_register, il server HTTP del worker deve restare attivo e rispondere a richieste successive anche dopo che swarm_register ha restituito il risultato"
    why_human: "Il test richiede l'esecuzione del server MCP stdio in una sessione reale e l'invio di una richiesta HTTP al boundPort dopo la registrazione — non verificabile con grep o analisi statica"
  - test: "Verificare che passare workerPort come $2 nello slash command faccia atterrare il valore numerico corretto in swarm_register"
    expected: "Eseguire /codestra-start-worker localhost 7800 9090 deve far sì che Claude invochi swarm_register con workerPort: 9090, e che il server sia in ascolto sulla porta 9090"
    why_human: "Richiede invocazione reale dello slash command con interpolazione $2 e osservazione del tool call effettuato da Claude"
---

# Fase 2: Worker HTTP Server — Rapporto di Verifica

**Goal della fase:** Un'istanza worker avvia un HTTP server locale al momento dell'esecuzione dello slash command e comunica la propria callback_url all'hub durante la registrazione
**Verificato:** 2026-04-19T12:50:00Z
**Stato:** human_needed
**Re-verifica:** No — verifica iniziale

---

## Raggiungimento del Goal

### Verità Osservabili

| # | Verità | Stato | Evidenza |
|---|--------|-------|----------|
| 1 | Invocare swarm_register avvia un HTTP server locale in-process prima di fare POST all'hub | VERIFIED | `await startWorkerServer(portArg)` alla riga 115, `await hubFetch("/workers", ...)` alla riga 136 — ordine garantito, awaitStart pos 334 < hubFetch pos 909 nel corpo dell'handler |
| 2 | La porta effettiva del worker è quella assegnata dall'OS (porta 0) o quella specificata dall'utente | VERIFIED | `startWorkerServer(port = 0)` riga 374, `srv.address().port` riga 378 restituisce la porta reale; smoke test conferma porta OS-assigned = 33311 |
| 3 | Il body del POST /workers contiene il campo callback_url nel formato `http://<SWARM_HOST>:<boundPort>` | VERIFIED | Riga 125: `` const callbackUrl = `http://${WORKER_HOST}:${boundPort}`; `` — riga 132: `callback_url: callbackUrl` nel body JSON |
| 4 | Il server worker risponde 200 OK a POST / (push dall'hub) e stampa il payload su stdout | VERIFIED | Righe 349-362: handler `POST /` legge body con `req.on('data')`, scrive `process.stdout.write`, risponde `json(res, 200, { ok: true })` |
| 5 | Il server worker risponde 200 OK a GET /health con `{ok: true}` | VERIFIED | Righe 344-347: `if (req.method === "GET" && req.url === "/health")` → `json(res, 200, { ok: true, role: "worker" })` |
| 6 | Se la porta custom è occupata (EADDRINUSE), swarm_register restituisce un messaggio di errore leggibile invece di crashare | VERIFIED | Righe 381-384: `err.code === "EADDRINUSE"` → `reject(new Error("Worker port ${port} already in use..."))` — riga 118-121: catch restituisce `isError: true` con messaggio leggibile |
| 7 | La descrizione di $2 nel SKILL.md non dice più 'Ignorare per ora' ma spiega che va passato come workerPort | VERIFIED | Riga 15 SKILL.md: "Se fornito, passare come `workerPort` al tool `swarm_register`" — nessuna occorrenza di "Ignorare per ora" (grep = 0 match) |
| 8 | Le istruzioni operative includono workerPort come parametro di swarm_register | VERIFIED | Riga 45 SKILL.md: `` `workerPort`: se `$2` è fornito, passare il suo valore numerico; altrimenti omettere (l'OS assegnerà la porta) `` |
| 9 | L'output all'utente mostra la callback_url invece della nota 'sarà attivo nella Fase 2' | VERIFIED | Riga 55 SKILL.md: "La `callback_url` del worker HTTP server (restituita da `swarm_register` nella risposta)" — nessuna occorrenza di "sarà attivo nella Fase 2" |

**Punteggio:** 9/9 verità verificate

---

### Artifact Richiesti

| Artifact | Fornisce | L1: Esiste | L2: Sostanziale | L3: Collegato | Stato |
|----------|----------|-----------|-----------------|---------------|-------|
| `servers/mcp-server.mjs` | Worker HTTP server in-process | SI (396 righe) | SI — 3 funzioni reali, logica completa | SI — usata in `swarm_register` | VERIFIED |
| `servers/mcp-server.mjs` — `function startWorkerServer(` | Avvio server con porta OS | SI (riga 374) | SI — Promise-wrapped, gestisce EADDRINUSE | SI — chiamata con `await` riga 115 | VERIFIED |
| `servers/mcp-server.mjs` — `function workerRequestHandler(` | Handler messaggi push | SI (riga 333) | SI — gestisce POST /, GET /health, auth Bearer, 404 | SI — passato a `http.createServer()` riga 376 | VERIFIED |
| `servers/mcp-server.mjs` — `import http from "node:http"` | Import node:http | SI (riga 19) | SI | SI — usato in `http.createServer` riga 376 | VERIFIED |
| `servers/mcp-server.mjs` — `SWARM_HOST ?? "localhost"` | Costante WORKER_HOST | SI (riga 25) | SI | SI — usata in `callbackUrl` riga 125 | VERIFIED |
| `skills/codestra-start-worker/SKILL.md` | Skill aggiornata con workerPort | SI | SI — 3 modifiche applicate, placeholder rimossi | SI — istruzioni operative fanno riferimento a `swarm_register(workerPort)` | VERIFIED |

---

### Verifica Key Links

| Da | A | Via | Stato | Dettaglio |
|----|---|-----|-------|-----------|
| `swarm_register` handler | `startWorkerServer()` | `await` prima del POST all'hub | WIRED | Riga 115: `const result = await startWorkerServer(portArg)` — prima di `hubFetch` riga 136 |
| `startWorkerServer()` | `server.address().port` | callback di `listen()` | WIRED | Riga 378: `resolve({ server: srv, port: srv.address().port })` — dentro callback di `srv.listen()` |
| body POST /workers | `callback_url` | campo JSON nel body | WIRED | Riga 132: `callback_url: callbackUrl` — `callbackUrl` costruita con `WORKER_HOST:boundPort` riga 125 |
| `skills/codestra-start-worker/SKILL.md` | `swarm_register(workerPort)` | istruzioni operative riga 45 | WIRED | "passare il suo valore numerico" come `workerPort` — allineato con schema zod `z.number().optional()` riga 106 |

---

### Data-Flow Trace (Level 4)

Non applicabile — `mcp-server.mjs` è un server MCP stdio, non un componente che renderizza dati dinamici. Il flusso dati critico (porta OS-assigned → callback_url → body POST hub) è verificato nei key links sopra.

---

### Behavioral Spot-Checks

| Comportamento | Comando | Risultato | Stato |
|---------------|---------|-----------|-------|
| Sintassi file valida | `node --check servers/mcp-server.mjs` | exit 0 | PASS |
| Porta OS-assigned risolve a porta reale | smoke test `startWorkerServer(0)` | porta 33311 | PASS |
| `import http` presente | grep `^import http from` | riga 19 | PASS |
| 3 funzioni helper presenti | grep `^function (json\|workerRequest\|startWorker)` | righe 324, 333, 374 | PASS |
| `callback_url` nel body POST | grep `callback_url` in `swarm_register` | righe 124, 127, 132, 144 | PASS |
| `EADDRINUSE` gestito | grep `EADDRINUSE` | riga 381 | PASS |
| `isError: true` nel catch | grep `isError.*true` | presente | PASS |
| Placeholder obsoleti rimossi da SKILL.md | grep `Ignorare per ora` / `sarà attivo nella Fase 2` | 0 match | PASS |

---

### Copertura Requisiti

| Req ID | Piano | Descrizione | Stato | Evidenza |
|--------|-------|-------------|-------|----------|
| WORKER-01 | 02-01 | Worker avvia un HTTP server locale al momento dell'esecuzione di `/codestra-start-worker` | SATISFIED | `startWorkerServer()` chiamata in `swarm_register` con `await` — server attivo prima del POST all'hub |
| WORKER-02 | 02-01, 02-02 | Worker porta è configurabile — default: porta assegnata dall'OS (port 0), opzione di specificare porta custom | SATISFIED | Schema zod `workerPort: z.number().optional()` riga 106; SKILL.md istruzioni operative guidano Claude a passare `$2` come `workerPort` |
| WORKER-03 | 02-01 | Worker comunica la propria `callback_url` (es. `http://<host>:<port>`) all'hub durante la registrazione | SATISFIED | `callback_url: callbackUrl` nel body POST `/workers` riga 132; formato `http://${WORKER_HOST}:${boundPort}` riga 125 |

Tutti e 3 i requisiti della fase sono soddisfatti. Nessun requisito orfano: REQUIREMENTS.md mappa WORKER-01, WORKER-02, WORKER-03 a Phase 2 — tutti presenti nei PLAN frontmatter (02-01-PLAN.md dichiara tutti e 3; 02-02-PLAN.md dichiara WORKER-01, WORKER-02).

---

### Anti-Pattern Rilevati

Nessuno. Scansione su `servers/mcp-server.mjs` e `skills/codestra-start-worker/SKILL.md`:
- Nessun TODO/FIXME/HACK/PLACEHOLDER
- Nessun `return null` / `return {}` / `return []` non giustificato
- Nessun testo placeholder ("Ignorare per ora", "sarà attivo nella Fase 2") residuo

---

### Verifica Umana Richiesta

#### 1. Worker HTTP server rimane attivo dopo swarm_register

**Test:** Avviare il MCP server (`node servers/mcp-server.mjs` con variabili env corrette), invocare il tool `swarm_register`, poi fare `curl http://localhost:<boundPort>/health` dove `<boundPort>` è la porta riportata nella risposta del tool.
**Atteso:** `{"ok":true,"role":"worker"}` con status 200 — il server deve rispondere anche dopo che `swarm_register` ha completato la sua esecuzione.
**Perché umano:** Richiede sessione MCP attiva e verifica runtime del server persistente — non verificabile con analisi statica.

#### 2. Interpolazione $2 come workerPort nello slash command

**Test:** Eseguire `/codestra-start-worker localhost 7800 9090` in Claude Code, osservare se Claude invoca `swarm_register` con `workerPort: 9090` e se il server è in ascolto sulla porta 9090 (verificabile con `ss -tlnp | grep 9090`).
**Atteso:** Claude chiama `swarm_register` con `workerPort: 9090`; la risposta include `callback_url: http://localhost:9090`.
**Perché umano:** Richiede invocazione reale dello slash command con interpolazione `$2` e verifica del tool call effettivo.

---

### Sommario Gap

Nessun gap. Tutti i 9 must-have verificati, tutti i 4 success criteria del ROADMAP soddisfatti, tutti i 3 requisiti (WORKER-01, WORKER-02, WORKER-03) coperti con evidenza nel codice.

Il blocco per il passaggio allo stato `passed` sono 2 verifiche comportamentali runtime che richiedono una sessione MCP attiva — non eseguibili con analisi statica.

---

_Verificato: 2026-04-19T12:50:00Z_
_Verificatore: Claude (gsd-verifier)_
