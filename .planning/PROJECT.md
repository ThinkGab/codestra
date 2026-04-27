# Codestra

## What This Is

Codestra è un plugin per Claude Code che permette di coordinare più istanze Claude Code attraverso un'architettura Hub & Spoke. Un'istanza "leader" (Il Maestro) spawna e dirige worker tramite un hub HTTP centrale e un bridge MCP stdio.

## Core Value

Ogni istanza Claude Code può orchestrare o essere orchestrata senza configurazione manuale — basta installare il plugin e lanciare il comando giusto.

## Current State: v1.2 Shipped — Planning Next Milestone

Workers can now exchange file artefacts via 4 MCP tools backed by the hub's in-memory file store. The full stack (hub routes → MCP tools → skill doc) is complete. UAT manual integration tests deferred to a dedicated MCP session.

## Requirements

### Validated

- [x] **HUB-01**: Hub registra `callback_url` per ogni worker — Validated in Phase 03: hub-push-delivery
- [x] **HUB-02**: Hub usa `callback_url` per push diretto al worker (bidirezionale) — Validated in Phase 03: hub-push-delivery
- [x] **HUB-03**: Hub fa fallback a polling se worker non ha `callback_url` — Validated in Phase 03: hub-push-delivery

### Validated (v1.0)

- [x] **CMD-01**: Utente può avviare hub con `/codestra-start-hub [port] [ip]` — Validated in Phase 01
- [x] **CMD-02**: Utente può avviare worker con `/codestra-start-worker [hub-ip] [hub-port]` — Validated in Phase 01
- [x] **WORKER-01**: Worker espone porta HTTP locale al momento della registrazione — Validated in Phase 02
- [x] **WORKER-02**: Worker comunica `callback_url` all'hub durante `swarm_register` — Validated in Phase 02

### Validated (v1.1)

- [x] **WORKER-03**: Worker accetta parametro `SWARM_ID` all'avvio — Validated in Phase 05: worker-lifecycle
- [x] **WORKER-04**: Worker avvia polling automatico ogni 10s dopo registrazione all'hub — Validated in Phase 05: worker-lifecycle (gap-closure 05-03)
- [x] **WORKER-05**: Uscita da Claude killa automaticamente il demone MCP del worker — Validated in Phase 05: worker-lifecycle
- [x] **HUB-04**: Hub fix `DELETE /worker` (endpoint non funzionante) — Validated in Phase 04: hub-fixes
- [x] **HUB-05**: Hub inietta prompt a Claude all'avvio per distribuire carico verso workers — Validated in Phase 04: hub-fixes

### Validated (v1.2)

- [x] **FILE-01**: Hub espone `PUT /files/:swarmId/:filename` — UUID-keyed, risponde con `{id, filename, size, mimeType, uploadedAt}` — Validated Phase 06
- [x] **FILE-02**: Hub espone `GET /files/:swarmId/:filename` — paginazione `?offset=N&max_bytes=M` — Validated Phase 06
- [x] **FILE-03**: Hub espone `GET /files/:swarmId` — lista metadata senza content — Validated Phase 06
- [x] **FILE-04**: Hub espone `DELETE /files/:swarmId/:filename` — `{deleted: true}` — Validated Phase 06
- [x] **FILE-09**: filename trattato come metadata opaca, nessun path traversal possibile — Validated Phase 06
- [x] **FILE-10**: `readRawBody` separato da `readBody`, 10 MB default, HTTP 413 su overflow — Validated Phase 06
- [x] **FILE-05**: `file_upload` MCP tool — accetta filename + content ≤50 KB, proxies PUT hub — Validated Phase 07
- [x] **FILE-06**: `file_download` MCP tool — paginazione offset/max_bytes, restituisce content + has_more — Validated Phase 07
- [x] **FILE-07**: `file_list` MCP tool — lista file swarm corrente — Validated Phase 07
- [x] **FILE-08**: `file_delete` MCP tool — rimuove file nel swarm corrente — Validated Phase 07
- [x] **FILE-11**: `skills/codestra-file-transport/SKILL.md` — when-to-use, limiti 50 KB, ephemeral semantics, two-worker handoff — Validated Phase 08

### Out of Scope

- TLS / HTTPS — documentato: usare reverse proxy per internet
- Autenticazione avanzata (OAuth, JWT) — fuori scope v1.0
- Persistenza hub (database) — in-memory è intenzionale per v1.0
- Worker process management (kill, restart) — solo unregister dall'hub

## Context

- Plugin Claude Code installato via `claude plugin marketplace add ThinkGab/codestra && claude plugin install codestra@claude-swarm`
- Hub è un HTTP server Node.js puro (`node:http`), no framework — ~700 LOC
- MCP bridge (`mcp-server.mjs`) comunica con hub via `fetch` — ~500 LOC, 13 tool
- Hub bidirezionale: push hub→worker via callback_url, fallback polling
- File transport: 4 HTTP routes hub + 4 MCP tool wrappers + skill doc
- Skill files: `skills/orchestrate/`, `skills/messaging/`, `skills/codestra-file-transport/` (v1.2)

## Constraints

- **Tech stack**: Node.js ESM puro — no TypeScript, no bundler, no framework
- **Compatibilità**: Deve funzionare con `@modelcontextprotocol/sdk` v1.12.0
- **Networking**: Worker espone porta su LAN — deve gestire conflitti di porta con fallback automatico
- **Backward compat**: Hub esistente deve continuare a funzionare con worker senza `callback_url`

## Key Decisions

| Date | Decision | Outcome |
|------|----------|---------|
| 2026-04-19 | Comunicazione bidirezionale via HTTP callback (worker espone porta) | ✓ Funziona — WebSocket non necessario |
| 2026-04-19 | Skill come file `.md` nella cartella `skills/` | ✓ Claude Code le carica come contesto |
| 2026-04-26 | File storage in-memory (no persistenza) | ✓ Coerente con filosofia v1.x — semplice |
| 2026-04-26 | UUID come Map key, filename come metadata opaca | ✓ No path traversal possibile |
| 2026-04-26 | Paginazione schema incluso dal giorno 1 | ✓ Breaking change se retrofitted |
| 2026-04-26 | readRawBody usa rejected flag + req.resume() drain | ✓ 413 consegnato senza ECONNRESET |
| 2026-04-27 | registeredWorkerId module-level in mcp-server.mjs | ✓ Implicit namespace per tutti i file tool |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
_Last updated: 2026-04-27 after v1.2 milestone_
