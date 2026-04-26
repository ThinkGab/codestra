# Phase 5: Worker Lifecycle - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Workers diventano self-identifying (SWARM_ID passato come arg al skill), self-polling (solo come fallback se no callback_url), e lasciano zero processi orfani quando Claude Code esce.

File coinvolti: `servers/mcp-server.mjs` (logica principale), `skills/codestra-start-worker/SKILL.md` (signature aggiornata).

</domain>

<decisions>
## Implementation Decisions

### WORKER-03: SWARM_ID delivery
- **D-01:** Aggiungere `swarmId` come parametro opzionale a `swarm_register` tool — stesso pattern di `workerPort`. Il skill passa `$3` come `swarmId` al tool call. Nessun restart di Claude Code richiesto.
- **D-02:** Se `swarmId` è passato al tool, ha priorità su `process.env.SWARM_ID` (INSTANCE_ID) nella costruzione del body dell'hub POST.
- **D-03:** Il skill `codestra-start-worker` aggiorna la signature a `[hub-ip] [hub-port] [worker-port?] [swarm-id?]` e passa `$3` come `swarmId` se presente.

### WORKER-04: Auto-polling
- **D-04:** Il polling si avvia automaticamente dopo `swarm_register` **solo se il worker non ha una `callback_url` attiva** — cioè solo come fallback. Se la registrazione include `callback_url` (caso default), il polling non parte.
- **D-05:** Intervallo: 10 secondi (`setInterval`).
- **D-06:** Messaggi ricevuti via poll → `process.stdout.write(`[worker-poll] ${body}\n`)` — stesso pattern del push handler esistente.
- **D-07:** Il riferimento all'intervallo è salvato in una variabile (`pollInterval`) per poterlo cancellare al cleanup.

### WORKER-05: Shutdown detection & cleanup
- **D-08:** Meccanismo di rilevamento uscita: `process.stdin.on('close', cleanup)` — quando Claude Code chiude le pipe stdio, il callback scatta automaticamente.
- **D-09:** Il cleanup fa: `clearInterval(pollInterval)` + `httpServer.close()`. Questo permette a Node.js di uscire naturalmente senza processi orfani.
- **D-10:** Nessuna chiamata DELETE all'hub al shutdown — troppo fragile nel path di uscita (hub potrebbe già essere down).

### Polling error handling
- **D-11:** Errori di rete durante il poll: silent skip (swallow). Il poll riprova al ciclo successivo. Zero output su stderr durante operazione normale.

### Claude's Discretion
- Posizione esatta del `process.stdin.on('close')` nel codice (prima o dopo `server.connect(transport)` — il planner decide)
- Naming del campo nel body: `id` vs `swarmId` (seguire il pattern già esistente in mcp-server.mjs)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core files
- `servers/mcp-server.mjs` — File principale; `swarm_register` tool, `startWorkerServer`, pattern di risposta tool, INSTANCE_ID da env
- `skills/codestra-start-worker/SKILL.md` — Skill da aggiornare: signature args e istruzioni operative

### Requirements
- `.planning/REQUIREMENTS.md` — WORKER-03, WORKER-04, WORKER-05 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `INSTANCE_ID = process.env.SWARM_ID` in mcp-server.mjs: già letto; D-02 aggiunge override da param
- `swarm_register` tool: già accetta `workerPort` come param runtime — aggiungere `swarmId` stesso modo
- `startWorkerServer()`: ritorna `{server, port}` — il riferimento `server` è usato per `server.close()` al cleanup
- `process.stdout.write('[worker-push] ...)` in workerRequestHandler: pattern da replicare per poll output

### Established Patterns
- Tool params opzionali con `z.string().optional()` o `z.number().optional()` — seguire per `swarmId`
- Body hub POST costruito come oggetto poi `JSON.stringify` — aggiungere campo `id` condizionalmente

### Integration Points
- `swarm_register` handler (riga ~118): dopo `startWorkerServer()`, prima del POST all'hub — qui aggiungere logica swarmId e avvio polling condizionale
- Fine di mcp-server.mjs (dopo `await server.connect(transport)`): qui aggiungere `process.stdin.on('close', cleanup)`

</code_context>

<specifics>
## Specific Ideas

Nessun riferimento specifico — implementazione standard seguendo pattern esistenti.

</specifics>

<deferred>
## Deferred Ideas

- De-registrazione dall'hub (`DELETE /workers/:id`) al shutdown — valutare per v1.2 se serve cleanup automatico della lista workers
- Reconnect automatico se hub va down durante la sessione — fuori scope v1.1 (già in REQUIREMENTS.md Out of Scope)

</deferred>

---

*Phase: 05-worker-lifecycle*
*Context gathered: 2026-04-26*
