# Codestra

## What This Is

Codestra è un plugin per Claude Code che permette di coordinare più istanze Claude Code attraverso un'architettura Hub & Spoke. Un'istanza "leader" (Il Maestro) spawna e dirige worker tramite un hub HTTP centrale e un bridge MCP stdio.

## Core Value

Ogni istanza Claude Code può orchestrare o essere orchestrata senza configurazione manuale — basta installare il plugin e lanciare il comando giusto.

## Current Milestone: v1.0 — Bidirectional Swarm Commands

**Goal:** Aggiungere skill `/codestra-start-hub` e `/codestra-start-worker` che configurano e avviano istanze con comunicazione bidirezionale hub↔worker.

**Target features:**
- `/codestra-start-hub [port] [ip]` — skill che avvia l'hub con binding configurabile
- `/codestra-start-worker [hub-ip] [hub-port]` — skill che avvia worker, espone porta locale, la registra sull'hub
- Worker HTTP server per ricevere messaggi push dall'hub (bidirezionale)
- Hub aggiornato: registra `callback_url` del worker, usa push quando disponibile

## Requirements

### Validated

(None yet — first milestone)

### Active

- [ ] **CMD-01**: Utente può avviare hub con `/codestra-start-hub [port] [ip]`
- [ ] **CMD-02**: Utente può avviare worker con `/codestra-start-worker [hub-ip] [hub-port]`
- [ ] **WORKER-01**: Worker espone porta HTTP locale al momento della registrazione
- [ ] **WORKER-02**: Worker comunica `callback_url` all'hub durante `swarm_register`
- [ ] **HUB-01**: Hub registra `callback_url` per ogni worker
- [ ] **HUB-02**: Hub usa `callback_url` per push diretto al worker (bidirezionale)
- [ ] **HUB-03**: Hub fa fallback a polling se worker non ha `callback_url`

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
_Last updated: 2026-04-19 — Milestone v1.0 started_
