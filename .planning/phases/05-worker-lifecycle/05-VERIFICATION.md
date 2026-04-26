---
phase: 05-worker-lifecycle
verified: 2026-04-26T09:38:00+02:00
status: human_needed
score: 4/4 roadmap success criteria verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/4
  gaps_closed:
    - "After a successful swarm_register call, mcp-server.mjs begins polling the hub every 10 seconds without any additional user action"
    - "The polling loop runs in the background and does not block MCP tool execution"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Orphan process test — verifica che nessun daemon sopravviva all'uscita di Claude"
    expected: "Dopo aver eseguito swarm_register e chiuso la sessione Claude Code, il processo mcp-server.mjs (e il suo worker HTTP server) non deve comparire in `ps aux`. Nessuna porta TCP deve restare aperta."
    why_human: "Non è possibile simulare la chiusura dello stdin di Claude Code in modo programmatico. Richiede avviare una sessione reale con il MCP server, chiuderla, e verificare la tabella dei processi."
---

# Phase 5: Worker Lifecycle — Re-Verification Report

**Phase Goal:** Workers are self-identifying (SWARM_ID), self-polling, and leave no orphaned processes when Claude exits
**Verified:** 2026-04-26T09:38:00+02:00
**Status:** human_needed
**Re-verification:** Si — dopo chiusura gap (piano 05-03)

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `/codestra-start-worker [hub-ip] [hub-port] [worker-port] [swarm-id]` passa SWARM_ID a mcp-server.mjs e il payload di registrazione hub include quell'ID | VERIFIED | SKILL.md riga 4: argument-hint include `[swarm-id?]`; riga 16: parametro $3 documentato con fallback a `SWARM_ID` env; riga 47: istruzione operativa passa $3 come `swarmId`. mcp-server.mjs riga 112: `swarmId` nello schema Zod; riga 114: destructurato nell'handler; riga 141: `resolvedId = swarmId \|\| INSTANCE_ID`; riga 142: `if (resolvedId) body.id = resolvedId` — ID entra nel body del POST all'hub. |
| 2 | Dopo una chiamata `swarm_register` riuscita, mcp-server.mjs avvia polling all'hub ogni 10 secondi senza azioni aggiuntive | VERIFIED | Piano 05-03 ha rimosso il guard `if (!callbackUrl)`. Riga 152: `pollInterval = setInterval(async () => {` eseguito incondizionatamente dopo `await hubFetch("/workers", ...)` a riga 144. Nessuna occorrenza di `if.*callbackUrl` nel file. Commento a riga 149-151 conferma intento: "WORKER-04 heartbeat dopo ogni registrazione riuscita". |
| 3 | Il loop di polling gira in background senza bloccare l'esecuzione dei tool MCP | VERIFIED | `setInterval` con callback `async` a riga 152. Il loop non blocca l'event loop di Node.js; le chiamate `hubFetch` avvengono fuori dalla catena sincrona dei tool MCP. Errori catturati silenziosamente (riga 158-160) — nessun crash del server MCP. |
| 4 | Quando l'istanza Claude Code che ha avviato mcp-server.mjs esce, il processo daemon MCP termina automaticamente (nessun processo orfano) | VERIFIED (codice) / HUMAN NEEDED (runtime) | `cleanup()` a righe 421-424: `clearInterval(pollInterval)` + `if (httpServer) httpServer.close()`. `process.stdin.on('close', cleanup)` a riga 426, registrato dopo `server.connect(transport)` a riga 418. Con il server HTTP chiuso e nessun setInterval attivo, l'event loop si svuota e Node.js esce naturalmente. Conferma runtime richiede test umano. |

**Score:** 4/4 — tutte le truth roadmap verificate a livello di codice

### Gap Closure

| Gap precedente | Status nel precedente | Status attuale | Fix applicato |
|---|---|---|---|
| SC #2: polling mai avviato (`if (!callbackUrl)` sempre false) | FAILED | VERIFIED | Piano 05-03 (commit 2fe52d9): rimosso guard, `pollInterval = setInterval(...)` ora incondizionato |
| SC #3: loop non verificabile (dipendente da SC #2) | FAILED | VERIFIED | Risolto transitivamente dalla chiusura del gap SC #2 |

### Plan Must-Have Truths

#### Piano 05-01

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | swarm_register accetta parametro opzionale swarmId che fa override su SWARM_ID env nel body hub POST | VERIFIED | Riga 112: schema Zod `swarmId: z.string().optional()`; riga 141: `resolvedId = swarmId \|\| INSTANCE_ID`; riga 142: `body.id = resolvedId` |
| 2 | Dopo swarm_register, pollInterval setInterval è dichiarato a scope di modulo e avviato | VERIFIED | `let pollInterval` riga 101 (scope modulo); `pollInterval = setInterval(...)` riga 152 — eseguito incondizionatamente dopo hub POST riuscito |
| 3 | Quando la pipe stdio di Claude si chiude, cleanup() esegue clearInterval(pollInterval) + httpServer.close() | VERIFIED | cleanup() righe 421-424; listener riga 426. `clearInterval(undefined)` è no-op sicuro in Node.js |
| 4 | Il daemon MCP esce naturalmente dopo chiusura stdin — nessun processo orfano | VERIFIED (codice) | httpServer.close() libera il server HTTP; clearInterval libera il timer; event loop si svuota |
| 5 | httpServer catturato da startWorkerServer e disponibile a cleanup | VERIFIED | Riga 123: `httpServer = result.server;` — assegnazione a scope di modulo dentro il try block |

#### Piano 05-02

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | La firma della skill documenta [swarm-id?] come quarto argomento opzionale | VERIFIED | SKILL.md riga 4: `argument-hint: [hub-ip] [hub-port] [worker-port?] [swarm-id?]` |
| 2 | La lista parametri della skill include voce $3 che descrive swarmId | VERIFIED | SKILL.md riga 16: `- Swarm ID (\`$3\`): opzionale — ID univoco da assegnare a questo worker...` |
| 3 | Le istruzioni di invocazione swarm_register dicono a Claude di passare $3 come swarmId quando fornito | VERIFIED | SKILL.md riga 47: `- \`swarmId\`: se \`$3\` è fornito, passare il suo valore stringa; altrimenti omettere` |

#### Piano 05-03 (gap-closure)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dopo ogni swarm_register riuscito, il polling parte sempre — non condizionato a callbackUrl | VERIFIED | Nessuna occorrenza di `if.*callbackUrl` nel file; `pollInterval = setInterval(...)` a riga 152 in posizione incondizionata |
| 2 | setInterval viene assegnato a pollInterval ogni volta che la registrazione all'hub ha successo | VERIFIED | Riga 152: assegnazione diretta dopo `await hubFetch("/workers", ...)` senza guard |
| 3 | Il blocco di polling non è racchiuso in nessun guard if(!callbackUrl) né equivalente | VERIFIED | `grep -c "if (!callbackUrl)"` → 0 risultati |
| 4 | Il commento descrive il polling come heartbeat permanente, non come fallback | VERIFIED | Righe 149-151: "WORKER-04: avvia polling heartbeat dopo ogni registrazione riuscita. [...] il polling parte sempre — non è un fallback." |

### Required Artifacts

| Artifact | Atteso | Status | Dettagli |
|----------|--------|--------|---------|
| `servers/mcp-server.mjs` | swarmId param, lifecycle state a scope modulo, polling incondizionato, stdin close handler | VERIFIED | 426 righe, `node --check` esce 0. swarmId: 3 occorrenze; resolvedId: 3 occorrenze; pollInterval = setInterval: 1 occorrenza; clearInterval: 1 occorrenza; process.stdin.on: 1 occorrenza. Nessun guard if(!callbackUrl). |
| `skills/codestra-start-worker/SKILL.md` | Firma aggiornata e istruzioni invocazione swarmId | VERIFIED | 58 righe. argument-hint con [swarm-id?]; $3 documentato 2 volte; swarmId menzionato 2 volte. |

### Key Link Verification

| From | To | Via | Status | Dettagli |
|------|----|-----|--------|---------|
| swarm_register handler | module-scope pollInterval | assegnazione diretta dopo hub POST | VERIFIED | Riga 152: `pollInterval = setInterval(...)` — incondizionato, immediatamente dopo `await hubFetch("/workers", ...)` |
| swarm_register handler | module-scope httpServer | assegnazione in try block | VERIFIED | Riga 123: `httpServer = result.server;` — disponibile a cleanup() |
| process.stdin.on('close') | cleanup() | event listener dopo server.connect | VERIFIED | Riga 426: listener registrato dopo `await server.connect(transport)` a riga 418 |
| SKILL.md argument-hint | swarm_register swarmId param | argomento posizionale $3 → parametro tool | VERIFIED | SKILL.md riga 4 documenta [swarm-id?]; riga 47 istruisce passaggio come stringa; mcp-server.mjs riga 112 accetta il param |

### Data-Flow Trace (Level 4)

Non applicabile — i file modificati sono un server MCP (trasporto stdio) e un documento di istruzioni skill. Non esiste catena di rendering React/componenti da tracciare.

### Behavioral Spot-Checks

| Comportamento | Comando | Risultato | Status |
|---------------|---------|-----------|--------|
| Sintassi ES module valida | `node --check servers/mcp-server.mjs` | Exit 0, nessun output | PASS |
| swarmId nel schema (3+ occorrenze) | `grep -c "swarmId" servers/mcp-server.mjs` | 3 | PASS |
| pollInterval = setInterval incondizionato | `grep -n "pollInterval = setInterval" servers/mcp-server.mjs` | Riga 152 | PASS |
| Guard if(!callbackUrl) rimosso | `grep -c "if (!callbackUrl)" servers/mcp-server.mjs` | 0 | PASS |
| let httpServer a scope modulo | `grep -n "^let httpServer" servers/mcp-server.mjs` | Riga 100 | PASS |
| let pollInterval a scope modulo | `grep -n "^let pollInterval" servers/mcp-server.mjs` | Riga 101 | PASS |
| httpServer catturato nell'handler | `grep -n "httpServer = result.server" servers/mcp-server.mjs` | Riga 123 | PASS |
| stdin close listener registrato | `grep -n "process.stdin.on" servers/mcp-server.mjs` | Riga 426 | PASS |
| SKILL.md argument-hint aggiornato | `grep "argument-hint" skills/codestra-start-worker/SKILL.md` | `[hub-ip] [hub-port] [worker-port?] [swarm-id?]` | PASS |
| commit 05-03 esiste nel repo | `git show --oneline 2fe52d9` | `fix(05-03): remove dead if(!callbackUrl) guard — WORKER-04 polling now unconditional` | PASS |

### Requirements Coverage

| Requisito | Piano | Descrizione | Status | Evidence |
|-----------|-------|-------------|--------|---------|
| WORKER-03 | 05-01, 05-02 | Worker accetta parametro SWARM_ID all'avvio | SATISFIED | swarmId nel schema e handler mcp-server.mjs; SKILL.md $3 documentato e collegato a swarm_register |
| WORKER-04 | 05-01, 05-03 | Worker avvia polling automatico ogni 10s dopo registrazione | SATISFIED | setInterval a riga 152 eseguito incondizionatamente dopo hub POST riuscito; guard rimosso da piano 05-03 |
| WORKER-05 | 05-01 | Uscita da Claude killa automaticamente il processo daemon MCP | SATISFIED (codice) / HUMAN NEEDED (runtime) | cleanup() + process.stdin.on('close') implementati e collegati; test runtime richiede verifica umana |

**Nota REQUIREMENTS.md:** Le checkbox e la colonna Status nella tabella di traceability in `.planning/REQUIREMENTS.md` mostrano ancora "Pending" per WORKER-03/04/05. Il file non e' stato aggiornato dal codice eseguito in questa fase. Questo e' un problema di documentazione, non di implementazione — l'implementazione e' verificata come completa.

### Anti-Patterns Found

Nessun anti-pattern bloccante rilevato nel codebase corrente.

| File | Riga | Pattern | Severita | Impatto |
|------|------|---------|----------|---------|
| `servers/mcp-server.mjs` | 152 | `pollInterval = setInterval(...)` mai cancellato se swarm_register viene chiamato due volte | Warning | Leak minore: chiamate multiple a swarm_register sovrascriverebbero pollInterval senza fare clearInterval sul precedente. Non bloccante per il goal della fase. |

### Human Verification Required

#### 1. Orphan Process Test

**Test:** Avviare Claude Code con il MCP server configurato, eseguire `swarm_register` (con un hub attivo o ignorando l'errore), poi chiudere la sessione Claude Code. Verificare con `ps aux | grep mcp-server` e `ss -tlnp` che il processo e le porte siano stati liberati.
**Expected:** Dopo la chiusura di Claude Code, nessun processo `mcp-server.mjs` appare in `ps aux`. Nessuna porta TCP (quella del worker HTTP server) rimane in ascolto.
**Why human:** Non e' possibile simulare la chiusura dello stdin di Claude Code in modo programmatico in questo contesto. Richiede una sessione reale Claude Code con il MCP server attivo.

---

_Verificato: 2026-04-26T09:38:00+02:00_
_Verifier: Claude (gsd-verifier) — Re-verification dopo gap-closure piano 05-03_
