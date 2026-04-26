---
phase: "06"
plan: "01"
subsystem: hub
tags: [file-storage, http-routes, in-memory, tdd, pagination]
dependency_graph:
  requires: []
  provides: [hub-file-routes]
  affects: [servers/hub.mjs]
tech_stack:
  added: [node:crypto.randomUUID, node:test]
  patterns: [in-memory Map keyed by UUID, raw body streaming with overflow guard, paginated Buffer slice]
key_files:
  created:
    - tests/task1-files-map-rawbody.test.mjs
    - tests/task2-file-routes.test.mjs
  modified:
    - servers/hub.mjs
decisions:
  - readRawBody uses rejected flag + req.resume() drain (not req.destroy()) so PUT handler can write 413 before socket closes
  - files Map keyed by UUID v4; client filename is opaque metadata string only — no filesystem path ever constructed
  - Paginated GET uses Buffer.slice + toString("utf8"); max_bytes defaults to 1000000 to align with plan spec
metrics:
  duration: "~8 minutes"
  completed_date: "2026-04-26"
  tasks_completed: 2
  files_modified: 1
  files_created: 2
---

# Phase 06 Plan 01: Hub File Routes Summary

**One-liner:** In-memory UUID-keyed file store with four HTTP routes (PUT/GET/GET-list/DELETE), 10 MB overflow guard, and paginated UTF-8 download — all within the existing hub.mjs, no new files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for files Map and readRawBody | 4700d28 | tests/task1-files-map-rawbody.test.mjs |
| 1 (GREEN) | Add files Map and readRawBody helper | 98b5a11 | servers/hub.mjs |
| 2 (RED) | Failing tests for four file route handlers | 09a0ec3 | tests/task2-file-routes.test.mjs |
| 2 (GREEN) | Add four file route handlers | db369ee | servers/hub.mjs |

## What Was Built

`servers/hub.mjs` extended with:

- **`const files = new Map()`** — module-level store keyed by UUID v4; value shape: `{id, swarmId, filename, content: Buffer, size, mimeType, uploadedAt}`
- **`readRawBody(req, maxBytes=10_485_760)`** — streams raw bytes into Buffer; rejects with `err.code = "BODY_TOO_LARGE"` on overflow; no JSON.parse
- **`PUT /files/:swarmId/:filename`** — stores file, returns `{id, filename, size, mimeType, uploadedAt}`; silently replaces duplicate swarm+filename; returns 413 on overflow
- **`GET /files/:swarmId/:filename`** — paginated download with `?offset=N&max_bytes=M`; returns `{content, offset, total_size, has_more}`
- **`GET /files/:swarmId`** — list metadata array for swarm (no `content` field); empty swarm returns `[]`
- **`DELETE /files/:swarmId/:filename`** — removes from Map, returns `{deleted: true}`; 404 if absent

All five ROADMAP.md Phase 6 success criteria verified via curl:
- SC1: PUT returns UUID v4 id — PASS
- SC2: GET paginated content — PASS
- SC3: Two uploads produce two-element list — PASS
- SC4: DELETE then GET returns 404 — PASS
- SC5: Body > 10 MB returns 413 — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 413 delivery on oversized body**
- **Found during:** Task 2 GREEN (SC5 test returned ECONNRESET instead of 413)
- **Issue:** Original `readRawBody` called `req.destroy()` immediately on overflow, closing the socket before the PUT handler could write the 413 response
- **Fix:** Replaced `req.destroy()` with a `rejected` flag guard; added `req.resume()` + drain await in the PUT handler catch block so Node.js drains remaining bytes and keeps the socket alive long enough for the JSON response to be flushed
- **Files modified:** `servers/hub.mjs` (readRawBody + PUT handler catch block)
- **Commit:** db369ee (included in the GREEN commit)

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED | 4700d28 | test(06-01) — 6 failing tests |
| Task 1 GREEN | 98b5a11 | feat(06-01) — 6 tests pass |
| Task 2 RED | 09a0ec3 | test(06-01) — 13 failing tests |
| Task 2 GREEN | db369ee | feat(06-01) — 13 tests pass |

## Known Stubs

None — all four routes are fully wired to the `files` Map with no placeholder data.

## Threat Flags

No new security surface beyond what was modeled in the plan's `<threat_model>`. All T-06-01 through T-06-07 threats addressed per plan dispositions.

## Self-Check: PASSED

All key files exist on disk. All four task commits verified in git log.
