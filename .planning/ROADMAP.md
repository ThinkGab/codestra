# Roadmap: Codestra — Milestone v1.2: MCP File Transport

## Overview

Milestone v1.2 adds file transfer capability to the Codestra swarm. The hub gains four HTTP routes for file storage (in-memory, UUID-keyed, swarm-namespaced). The MCP server exposes those routes as four Claude-callable tools. A skill document teaches workers when and how to use file transport. Phases 6–8 continue the integer numbering from v1.1 (which ended at Phase 5).

## Phases

**Phase Numbering:**
- Integer phases (6, 7, 8): v1.2 planned milestone work (continuing from v1.1 which ended at Phase 5)
- Decimal phases: Urgent insertions if needed mid-milestone

- [x] **Phase 6: Hub File Routes** - Add readRawBody helper and four HTTP file routes to hub.mjs; UUID-keyed in-memory store; curl-testable in isolation
- [x] **Phase 7: MCP Tool Wrappers** - Add file_upload, file_download, file_list, file_delete tools to mcp-server.mjs using hubFetch(); pagination schema included from day one
- [ ] **Phase 8: Skills + Integration** - Create skills/file-transport/SKILL.md; validate end-to-end two-worker file handoff

## Phase Details

### Phase 6: Hub File Routes
**Goal**: The hub stores and serves files per swarm with no path traversal exposure and enforces a 10 MB upload ceiling
**Depends on**: Nothing (pure hub-side, independent of MCP)
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, FILE-09, FILE-10
**Success Criteria** (what must be TRUE):
  1. `curl -X PUT http://hub/files/:swarmId/report.txt` with a text body returns `{id, filename, size, mimeType, uploadedAt}` and the UUID id is a valid v4 UUID
  2. `curl http://hub/files/:swarmId/report.txt` returns `{content, offset, total_size, has_more}` and supports `?offset=N&max_bytes=M` pagination
  3. `curl http://hub/files/:swarmId` returns an array of file metadata objects; uploading two files produces a two-element array
  4. `curl -X DELETE http://hub/files/:swarmId/report.txt` returns `{deleted: true}` and a subsequent GET for that filename returns 404
  5. Uploading a body exceeding 10 MB returns HTTP 413; a client-supplied filename containing `../` is stored as opaque metadata and never interpreted as a filesystem path
**Plans**: 1 plan
Plans:
- [x] 06-01-PLAN.md — files Map + readRawBody helper + four HTTP file routes (PUT, GET single, GET list, DELETE)

### Phase 7: MCP Tool Wrappers
**Goal**: Claude workers can upload, download, list, and delete files in their swarm namespace through four MCP tools
**Depends on**: Phase 6
**Requirements**: FILE-05, FILE-06, FILE-07, FILE-08
**Success Criteria** (what must be TRUE):
  1. Calling `file_upload` with `filename` and `content` (≤50 KB text) from a running worker returns the hub's `{id, filename, size, uploadedAt}` response
  2. Calling `file_download` with `filename` returns `{content, has_more}`; calling it again with `offset` equal to the previous `total_size` returns `has_more: false`
  3. Calling `file_list` returns the same array visible via `curl http://hub/files/:swarmId`
  4. Calling `file_delete` removes the file; a subsequent `file_list` call confirms the file is absent
**Plans**: 1 plan
Plans:
- [x] 07-01-PLAN.md — module-level registeredWorkerId + four MCP file tool wrappers (file_upload, file_download, file_list, file_delete)
**UI hint**: no

### Phase 8: Skills + Integration
**Goal**: Workers have documented guidance on file transport semantics and an integration test confirms two workers can exchange a file end-to-end
**Depends on**: Phase 7
**Requirements**: FILE-11
**Success Criteria** (what must be TRUE):
  1. `skills/file-transport/SKILL.md` exists and documents: when to use file_upload/download vs. message passing, the 50 KB text-only limit, ephemeral storage semantics (hub restart loses files), and the two-worker handoff pattern (producer uploads by filename, consumer downloads by same filename)
  2. An integration test or documented manual test sequence demonstrates Worker A uploading a file and Worker B downloading it by filename within the same swarm, producing identical content
**Plans**: 1 plan
Plans:
- [ ] 08-01-PLAN.md — skills/codestra-file-transport/SKILL.md con decision tree, esempi tool call e test manuale two-worker

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Hub File Routes | 1/1 | Complete | 2026-04-26 |
| 7. MCP Tool Wrappers | 1/1 | Complete | 2026-04-27 |
| 8. Skills + Integration | 0/1 | In progress | - |
