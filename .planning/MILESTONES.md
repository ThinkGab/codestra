# MILESTONES.md

## Active

### v1.2 — MCP File Transport
**Status:** In progress
**Started:** 2026-04-26
**Goal:** Hub diventa canale MCP per trasferire file/artefatti tra workers, sostituendo la condivisione via filesystem locale.

## Completed (recent)

### v1.1 — Worker Lifecycle & Hub Improvements
**Status:** Complete
**Started:** 2026-04-25
**Completed:** 2026-04-26
**Goal:** Completare ciclo di vita worker (SWARM_ID, polling automatico, shutdown pulito) e fixare Hub (delete worker, load distribution prompt).

## Completed

### v1.0 — Bidirectional Swarm Commands
**Status:** Complete
**Started:** 2026-04-19
**Completed:** 2026-04-25
**Goal:** Skill `/codestra-start-hub` e `/codestra-start-worker` con comunicazione bidirezionale hub↔worker.
**Phases:** 3 (Slash Command Skills, Worker HTTP Server, Hub Push Delivery)
