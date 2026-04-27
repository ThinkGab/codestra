# MILESTONES.md

## Active

*(nessun milestone attivo — v1.2 completato, v1.3 non ancora avviato)*

## Completed

### v1.2 — MCP File Transport
**Status:** ✅ Complete
**Started:** 2026-04-26
**Completed:** 2026-04-27
**Goal:** Hub diventa canale MCP per trasferire file/artefatti tra workers, sostituendo la condivisione via filesystem locale.
**Phases:** 3 (Hub File Routes, MCP Tool Wrappers, Skills Integration)
**Plans:** 3 | **LOC added:** ~190 Node.js ESM
**Key deliverables:**
- In-memory UUID-keyed file store — 4 HTTP routes, 10 MB guard, paginated download
- 4 MCP file tools (file_upload/download/list/delete) via registeredWorkerId namespace
- SKILL.md operativo — when-to-use, limiti 50 KB, ephemeral semantics, two-worker handoff pattern
**Known deferred items at close:** 10 (see STATE.md Deferred Items — require dedicated MCP session)

### v1.1 — Worker Lifecycle & Hub Improvements
**Status:** ✅ Complete
**Started:** 2026-04-25
**Completed:** 2026-04-26
**Goal:** Completare ciclo di vita worker (SWARM_ID, polling automatico, shutdown pulito) e fixare Hub (delete worker, load distribution prompt).

### v1.0 — Bidirectional Swarm Commands
**Status:** ✅ Complete
**Started:** 2026-04-19
**Completed:** 2026-04-25
**Goal:** Skill `/codestra-start-hub` e `/codestra-start-worker` con comunicazione bidirezionale hub↔worker.
**Phases:** 3 (Slash Command Skills, Worker HTTP Server, Hub Push Delivery)
