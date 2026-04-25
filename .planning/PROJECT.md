# Codestra

## What This Is

Codestra è un plugin per Claude Code che permette di coordinare più istanze Claude Code attraverso un'architettura Hub & Spoke. Un'istanza "leader" (Il Maestro) spawna e dirige worker tramite un hub HTTP centrale e un bridge MCP stdio.

## Core Value

Ogni istanza Claude Code può orchestrare o essere orchestrata senza configurazione manuale — basta installare il plugin e lanciare il comando giusto.

## Current Milestone: v1.1 — Worker Lifecycle & Hub Improvements

**Goal:** Completare il ciclo di vita del worker (SWARM_ID, polling automatico, shutdown pulito) e fixare comportamenti Hub difettosi.

**Target features:**
- Worker accetta parametro `SWARM_ID` all'avvio (identificatore esplicito dello swarm)
- Worker avvia polling automatico ogni 10s dopo la registrazione all'hub
- Uscita da Claude → kill automatico del demone MCP del worker
- Hub: fix `DELETE /worker` (endpoint non funzionante)
- Hub: all'avvio inietta prompt Claude per distribuire carico verso workers (non orchestrare da solo se non specificato)

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

### Active (v1.1)

- [ ] **WORKER-03**: Worker accetta parametro `SWARM_ID` all'avvio
- [ ] **WORKER-04**: Worker avvia polling automatico ogni 10s dopo registrazione all'hub
- [ ] **WORKER-05**: Uscita da Claude killa automaticamente il demone MCP del worker
- [x] **HUB-04**: Hub fix `DELETE /worker` (endpoint non funzionante) — Validated in Phase 04: hub-fixes
- [x] **HUB-05**: Hub inietta prompt a Claude all'avvio per distribuire carico verso workers — Validated in Phase 04: hub-fixes

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
_Last updated: 2026-04-25 — Milestone v1.1 started: worker lifecycle & hub improvements_
