---
phase: 06-hub-file-routes
fixed_at: 2026-04-27T13:43:37Z
review_path: .planning/phases/06-hub-file-routes/06-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-04-27T13:43:37Z
**Source review:** .planning/phases/06-hub-file-routes/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Binary file content corrupted on GET via UTF-8 decode

**Files modified:** `servers/hub.mjs`
**Commit:** 432af5a
**Applied fix:** In `GET /files/:swarmId/:filename`, replaced `slice.toString("utf8")` with `slice.toString("base64")` and added `encoding: "base64"` to the JSON response. Callers decode with `Buffer.from(content, "base64")`. The response shape is now `{ content, encoding, offset, total_size, has_more }`.

### WR-02: Oversized upload keeps socket open for entire body duration before 413 is sent

**Files modified:** `servers/hub.mjs`
**Commit:** ca7b2c7
**Applied fix:** Added `req.destroy()` in `readRawBody` immediately after `rejected = true`, before constructing and rejecting with the `BODY_TOO_LARGE` error. This matches the pattern used in `readBody`. Removed the drain-and-wait block (`req.resume()` + `await new Promise(...)`) from the PUT handler since the socket is aborted immediately and no draining is needed.

---

_Fixed: 2026-04-27T13:43:37Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
