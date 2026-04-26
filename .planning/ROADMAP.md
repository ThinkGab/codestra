# Roadmap: Codestra — Milestone v1.1: Worker Lifecycle & Hub Improvements

## Overview

Milestone v1.1 completes the worker lifecycle (SWARM_ID propagation, automatic polling, clean shutdown) and fixes two hub-side gaps (DELETE route correctness, load-distribution system prompt). Both phases are independent of each other in delivery but Phase 5 (worker-side) benefits from a working hub DELETE, so Phase 4 executes first.

## Phases

**Phase Numbering:**
- Integer phases (4, 5): v1.1 planned milestone work (continuing from v1.0 which ended at Phase 3)
- Decimal phases: Urgent insertions if needed mid-milestone

- [x] **Phase 4: Hub Fixes** - Fix DELETE /worker/:id and inject load-distribution system prompt at hub startup (2026-04-25)
- [ ] **Phase 5: Worker Lifecycle** - Worker accepts SWARM_ID at startup, starts automatic polling after registration, and kills its MCP daemon on Claude exit

## Phase Details

### Phase 4: Hub Fixes
**Goal**: The hub correctly removes workers on DELETE and instructs Claude to distribute load across registered workers at startup
**Depends on**: Nothing (server-side fixes, independent)
**Requirements**: HUB-04, HUB-05
**Success Criteria** (what must be TRUE):
  1. After calling `DELETE /worker/:id`, the worker is absent from subsequent `GET /workers` responses and receives no further messages
  2. A `DELETE /worker/:id` for an unknown ID returns a clear error response (not a silent success or crash)
  3. When `hub.mjs` starts, it injects a system prompt into the Claude session instructing it to delegate tasks to registered workers rather than executing them directly
  4. The injected prompt is visible as a tool result or assistant message in the Claude Code session immediately after hub startup
**Plans**: 1 plan
Plans:
- [x] 04-01-PLAN.md — Fix DELETE 404 + inject swarm_hub_start system prompt (2026-04-25)

### Phase 5: Worker Lifecycle
**Goal**: Workers are self-identifying (SWARM_ID), self-polling, and leave no orphaned processes when Claude exits
**Depends on**: Phase 4
**Requirements**: WORKER-03, WORKER-04, WORKER-05
**Success Criteria** (what must be TRUE):
  1. Running `/codestra-start-worker [hub-ip] [hub-port] [worker-port] [swarm-id]` passes the SWARM_ID argument to `mcp-server.mjs` and the hub registration payload includes that ID
  2. After a successful `swarm_register` call, `mcp-server.mjs` begins polling the hub every 10 seconds without any additional user action
  3. The polling loop runs in the background and does not block MCP tool execution
  4. When the Claude Code instance that started `mcp-server.mjs` exits, the MCP daemon process terminates automatically (no orphan process left behind)
**Plans**: 2 plans
Plans:
- [ ] 05-01-PLAN.md — Add swarmId param, conditional polling, and stdin-close cleanup to mcp-server.mjs (WORKER-03, WORKER-04, WORKER-05)
- [ ] 05-02-PLAN.md — Update codestra-start-worker SKILL.md signature and invocation instructions (WORKER-03)

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. Hub Fixes | 1/1 | Complete | 2026-04-25 |
| 5. Worker Lifecycle | 0/2 | Not started | - |
