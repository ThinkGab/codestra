# Phase 2: Worker HTTP Server - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Aggiungere a `mcp-server.mjs` la capacità di avviare un server HTTP locale in-process quando `swarm_register` viene invocato, e includere il `callback_url` nel payload di registrazione all'hub.

</domain>

<decisions>
## Implementation Decisions

### Avvio HTTP Server
- **D-01:** Il server HTTP del worker si avvia **inside `swarm_register`** — automaticamente, in-process con `mcp-server.mjs`. Nessun tool separato, nessun passo aggiuntivo nel SKILL.md.
- **D-02:** `swarm_register` avvia prima il server HTTP, ottiene la porta assegnata (porta 0 → OS assegna porta reale), poi fa POST a hub con `callback_url` incluso nel body.

### Host del callback_url
- **D-03:** L'host del `callback_url` è letto da **`SWARM_HOST` env var** (stessa usata dall'hub). Default `localhost` se non configurata.
- **D-04:** `callback_url` formato: `http://${SWARM_HOST ?? 'localhost'}:${boundPort}`

### Handler messaggi in push
- **D-05:** Quando l'hub fa POST al worker HTTP server, il server **stampa il messaggio su stdout** del processo `mcp-server.mjs`. Nessuna notifica attiva, nessun tool aggiuntivo. Claude Code vede l'output nel log della sessione.
- **D-06:** Endpoint worker: `POST /` — riceve il payload, stampa, risponde `200 OK`.

### Lifetime del server
- **D-07:** Il server HTTP del worker è **in-process con `mcp-server.mjs`** — nasce e muore con il processo MCP. Nessun nohup, nessun processo zombie.

### Porta
- **D-08:** Porta di default: `0` (OS-assigned). Se `$2` è fornito nel comando `/codestra:codestra-start-worker`, usare quella porta. La porta effettiva viene scoperta dopo il bind (`server.address().port`).

### Autenticazione worker server
- **D-09:** Claude's Discretion — autenticazione via `SWARM_SECRET` se presente (stessa logica dell'hub), oppure no-auth per ora. Coerente con il resto del sistema.

### Claude's Discretion
- Gestione errori se il server non riesce a bindare la porta (porta occupata)
- Health check endpoint sul worker server (`GET /health`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Server source files (da estendere, NON sostituire)
- `servers/mcp-server.mjs` — MCP server da estendere: aggiungere HTTP server in-process e modificare `swarm_register`
- `servers/hub.mjs` — Hub reference: pattern di binding porta 0 e lettura `SWARM_HOST`

### Requirements
- `.planning/REQUIREMENTS.md` — WORKER-01, WORKER-02, WORKER-03 (obiettivi della fase)

### Planning context
- `.planning/phases/01-slash-command-skills/01-01-PLAN.md` — skill worker aggiornata (Fase 1): `$2` già documentato come worker-port per Fase 2

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hub.mjs` porta 0 pattern: `server.listen(0, host, () => { const port = server.address().port; ... })` — stesso pattern da usare nel worker server
- `hub.mjs` SWARM_HOST/SWARM_PORT/SWARM_SECRET env vars — il worker riusa SWARM_HOST per l'host del callback_url
- `mcp-server.mjs` `swarm_register` tool (righe 98-126) — da modificare per avviare server e aggiungere `callback_url` al POST body

### Established Patterns
- Node.js ESM only — nessun TypeScript, nessun framework
- Nessuna dipendenza esterna oltre `@modelcontextprotocol/sdk` — il server HTTP del worker usa `node:http` built-in
- `swarm_register` corrente: POST `/workers` con body `{role, task, cwd, id?}` — aggiungere `callback_url` al body

### Integration Points
- `swarm_register` in `mcp-server.mjs` è il punto di ingresso — avvia server HTTP, poi chiama hub
- Hub `POST /workers` handler in `hub.mjs` — nella Fase 3 salverà `callback_url`; per ora lo riceve ma lo ignora (campo extra, no breaking change)

</code_context>

<specifics>
## Specific Ideas

- Pattern consigliato: avviare il server HTTP con porta 0, aspettare l'evento `listening`, poi procedere con la registrazione all'hub — evita race condition
- `callback_url` nel worker è sufficiente per Fase 2; la Fase 3 (Hub Push Delivery) implementa il lato hub che usa quella URL

</specifics>

<deferred>
## Deferred Ideas

- TLS sul worker server — out of scope v1.0
- WebSocket push — out of scope v1.0
- Kill remoto del worker server tramite hub — out of scope v1.0

</deferred>

---

*Phase: 02-worker-http-server*
*Context gathered: 2026-04-19*
