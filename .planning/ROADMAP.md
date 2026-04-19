# Roadmap: Codestra — Milestone v1.0: Bidirectional Swarm Commands

## Overview

Codestra is a Claude Code plugin for multi-agent swarm orchestration. Milestone v1.0 delivers bidirectional communication between the hub and worker instances. The three phases build in dependency order: first the slash command skills that let users invoke the system, then the worker HTTP server that enables workers to receive push delivery, then the hub-side push logic that uses those worker endpoints.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Slash Command Skills** - SKILL.md content for `/codestra-start-hub` and `/codestra-start-worker` *(completed 2026-04-19)*
- [ ] **Phase 2: Worker HTTP Server** - Worker starts local HTTP server and registers its callback_url with the hub
- [ ] **Phase 3: Hub Push Delivery** - Hub POSTs to worker callback_url with silent fallback to polling

## Phase Details

### Phase 1: Slash Command Skills
**Goal**: Users can invoke `/codestra-start-hub` and `/codestra-start-worker` from Claude Code with correct arguments
**Depends on**: Nothing (first phase)
**Requirements**: CMD-01, CMD-02
**Success Criteria** (what must be TRUE):
  1. User can run `/codestra-start-hub` and Claude Code presents correct port/ip argument guidance
  2. User can run `/codestra-start-hub [port] [ip]` and the skill content directs Claude to start the hub with the specified binding
  3. User can run `/codestra-start-worker [hub-ip] [hub-port] [worker-port?]` and the skill content directs Claude to register this instance as a worker
  4. Both skill files exist under `skills/` and are surfaced as Claude Code slash commands via the plugin manifest
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md — Rinomina skill directory, aggiorna manifest (name: codestra), scrivi SKILL.md per hub e worker

### Phase 2: Worker HTTP Server
**Goal**: A worker instance starts a local HTTP server on slash command execution and communicates its callback_url to the hub during registration
**Depends on**: Phase 1
**Requirements**: WORKER-01, WORKER-02, WORKER-03
**Success Criteria** (what must be TRUE):
  1. After `/codestra-start-worker` is invoked, `mcp-server.mjs` starts an HTTP server bound to a port (OS-assigned by default, or a custom port if specified)
  2. The worker's actual bound port is discoverable after server start (OS-assigned port 0 resolves to a real port)
  3. The `swarm_register` call to the hub includes a `callback_url` field containing `http://<host>:<port>`
  4. Worker HTTP server stays running and can receive inbound HTTP requests on its bound port
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Estende mcp-server.mjs con HTTP server in-process, workerRequestHandler, startWorkerServer, modifica swarm_register
- [ ] 02-02-PLAN.md — Aggiorna SKILL.md codestra-start-worker: attiva workerPort, rimuove note placeholder Fase 1

### Phase 3: Hub Push Delivery
**Goal**: The hub delivers messages to workers via HTTP POST to their callback_url, falling back to the polling model when unavailable or unreachable
**Depends on**: Phase 2
**Requirements**: HUB-01, HUB-02, HUB-03
**Success Criteria** (what must be TRUE):
  1. When a worker registers with a `callback_url`, the hub stores that URL in the worker's record in the in-memory Map
  2. When a message is sent to a worker that has a `callback_url`, the hub POSTs the message payload to that URL
  3. When the hub POST to `callback_url` fails (network error, non-2xx response), the message remains available via the existing polling endpoint without surfacing an error to the sender
  4. When a worker has no `callback_url` set, the hub silently uses store-and-forward (polling model) unchanged
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Slash Command Skills | 1/1 | Complete | 2026-04-19 |
| 2. Worker HTTP Server | 0/? | Not started | - |
| 3. Hub Push Delivery | 0/? | Not started | - |
