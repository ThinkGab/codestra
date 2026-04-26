# Codestra

## What This Is

Codestra è un plugin per Claude Code che permette di coordinare più istanze Claude Code attraverso un'architettura Hub & Spoke. Un'istanza "leader" (Il Maestro) spawna e dirige worker tramite un hub HTTP centrale e un bridge MCP stdio.

## Core Value

Ogni istanza Claude Code può orchestrare o essere orchestrata senza configurazione manuale — basta installare il plugin e lanciare il comando giusto.

## Current Milestone: v1.2 — MCP File Transport

**Goal:** Hub diventa canale MCP per trasferire file/artefatti tra workers, sostituendo la condivisione via filesystem locale.

**Target features:**
- Hub espone MCP tools: `file_upload`, `file_download`, `file_list`, `file_delete`
- Worker usa MCP tools per scrivere/leggere artefatti (no disco locale condiviso)
- File namespace per `swarm_id` (isolamento tra swarm diversi)
- Hub gestisce storage in-memory (coerente con filosofia v1.x)

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

### Validated (v1.2 — Phase 6)

- [x] **FILE-01**: Hub espone `PUT /files/:swarmId/:filename` — UUID-keyed, risponde con `{id, filename, size, mimeType, uploadedAt}` — Validated in Phase 06: hub-file-routes
- [x] **FILE-02**: Hub espone `GET /files/:swarmId/:filename` — paginazione `?offset=N&max_bytes=M` — Validated in Phase 06: hub-file-routes
- [x] **FILE-03**: Hub espone `GET /files/:swarmId` — lista metadata senza content — Validated in Phase 06: hub-file-routes
- [x] **FILE-04**: Hub espone `DELETE /files/:swarmId/:filename` — `{deleted: true}` — Validated in Phase 06: hub-file-routes
- [x] **FILE-09**: filename trattato come metadata opaca, nessun path traversal possibile — Validated in Phase 06: hub-file-routes
- [x] **FILE-10**: `readRawBody` separato da `readBody`, 10 MB default, HTTP 413 su overflow — Validated in Phase 06: hub-file-routes

### Out of Scope

- TLS / HTTPS — documentato: usare reverse proxy per internet
- Autenticazione avanzata (OAuth, JWT) — fuori scope v1.0
- Persistenza hub (database) — in-memory è intenzionale per v1.0
- Worker process management (kill, restart) — solo unregister dall'hub

## Context

- Plugin Claude Code installato via `claude plugin marketplace add ThinkGab/codestra && claude plugin install codestra@claude-swarm`
- Hub è un HTTP server Node.js puro (`node:http`), no framework
- MCP bridge (`mcp-server.mjs`) comunica con hub via `fetch`
- Attualmente solo pull (worker interroga hub per messaggi) — v1.0 aggiunge push hub→worker
- Skill files (`skills/orchestrate/SKILL.md`, `skills/messaging/SKILL.md`) sono stub vuoti da riempire

## Constraints

- **Tech stack**: Node.js ESM puro — no TypeScript, no bundler, no framework
- **Compatibilità**: Deve funzionare con `@modelcontextprotocol/sdk` v1.12.0
- **Networking**: Worker espone porta su LAN — deve gestire conflitti di porta con fallback automatico
- **Backward compat**: Hub esistente deve continuare a funzionare con worker senza `callback_url`

## Key Decisions

- **2026-04-19**: Comunicazione bidirezionale via HTTP callback (worker espone porta) — alternativa a WebSocket scartata per semplicità
- **2026-04-19**: Skill come file `.md` nella cartella `skills/` — Claude Code le carica come contesto

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
_Last updated: 2026-04-26 — Phase 6 Hub File Routes complete (1/3 phases v1.2)_
