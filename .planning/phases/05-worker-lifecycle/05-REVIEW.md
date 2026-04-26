---
phase: 05-worker-lifecycle
reviewed: 2026-04-26T09:02:00+02:00
depth: standard
files_reviewed: 2
files_reviewed_list:
  - servers/mcp-server.mjs
  - skills/codestra-start-worker/SKILL.md
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-04-26T09:02:00+02:00
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the Phase 5 changes: `swarmId` optional param on `swarm_register`, module-scope lifecycle state (`httpServer`, `pollInterval`), conditional polling loop, `cleanup()` function, and SKILL.md update for `$3`.

The SKILL.md update is correct and complete. The mcp-server.mjs changes contain one structural dead-code bug that permanently disables the polling fallback path, plus two resource-leak bugs related to the HTTP server lifecycle, and a cleanup gap where the hub is not deregistered on shutdown.

## Warnings

### WR-01: Polling fallback is permanently dead code

**File:** `servers/mcp-server.mjs:150`
**Issue:** `callbackUrl` is assigned on line 132 as `` `http://${WORKER_HOST}:${boundPort}` ``. `WORKER_HOST` defaults to `"localhost"` and `boundPort` is always a positive integer returned by the OS-assigned port. The string is never falsy. The condition `if (!callbackUrl)` on line 150 can never be true, so `setInterval` never executes and `pollInterval` is never set. The entire polling branch (lines 151–161) is dead code.

**Fix:**
```js
// Option A: remove the condition entirely and always start polling
// (not recommended — polling is meant as a fallback only)

// Option B: correct the guard to check whether the server actually started
// with a callback URL (the intended semantic):
// The condition should have been checking whether the hub accepted the
// callback_url, not whether the local variable is truthy.
// If polling is never needed because callback_url is always registered,
// delete lines 150–161 and remove the pollInterval module-scope variable.

// Option C (if polling fallback is intentional for future use):
// Introduce an explicit boolean flag rather than relying on string truthiness:
let usePolling = false; // set to true when callbackUrl cannot be used
if (usePolling) {
  pollInterval = setInterval(async () => { ... }, 10_000);
}
```

---

### WR-02: HTTP server leaks when `swarm_register` is called more than once

**File:** `servers/mcp-server.mjs:120-123`
**Issue:** Every call to `swarm_register` unconditionally starts a new HTTP server via `startWorkerServer()` and assigns the result to the module-scope `httpServer`. If the tool is called a second time, the previous server is overwritten with no reference remaining to close it. The leaked server continues to hold its port. `cleanup()` will only close the last-assigned server.

**Fix:**
```js
// Guard at the top of the swarm_register handler:
if (httpServer) {
  return {
    content: [{ type: "text", text: "Already registered. Call swarm_kill_worker to deregister first." }],
    isError: true,
  };
}
```

---

### WR-03: HTTP server leaks when hub POST fails after server starts

**File:** `servers/mcp-server.mjs:120-147`
**Issue:** The HTTP server starts and `httpServer` is assigned (lines 121–123) before the hub POST on line 144. If `hubFetch("/workers", ...)` throws (hub unreachable, non-JSON response), the unhandled rejection propagates out of the tool handler. The server is listening on a port with no way to close it until `cleanup()` runs. The tool never returned `isError: true`, so Claude receives a generic error with no actionable information.

**Fix:**
```js
let data;
try {
  data = await hubFetch("/workers", {
    method: "POST",
    body: JSON.stringify(body),
  });
} catch (err) {
  httpServer.close();
  httpServer = undefined;
  return {
    content: [{ type: "text", text: `Hub registration failed: ${err.message}` }],
    isError: true,
  };
}
```

---

### WR-04: `cleanup()` does not deregister the worker from the hub

**File:** `servers/mcp-server.mjs:421-424`
**Issue:** `cleanup()` closes the local HTTP server and clears the polling interval but does not call `DELETE /workers/{id}` on the hub. When Claude Code exits, the worker remains visible to `swarm_list_workers` as a ghost entry with stale status. Any message sent to it by the leader will be silently undeliverable.

**Fix:**
```js
// Store the registered worker ID at module scope after successful registration:
let registeredWorkerId;
// In swarm_register, after successful hub POST:
registeredWorkerId = data.worker?.id;

// In cleanup():
function cleanup() {
  clearInterval(pollInterval);
  if (httpServer) httpServer.close();
  if (registeredWorkerId) {
    // Fire-and-forget; process may exit before this completes,
    // but it improves best-effort cleanup:
    hubFetch(`/workers/${registeredWorkerId}`, { method: "DELETE" }).catch(() => {});
  }
}
```

---

## Info

### IN-01: Magic number for polling interval

**File:** `servers/mcp-server.mjs:160`
**Issue:** The polling interval `10_000` ms is an inline magic number inside the dead polling branch. If the branch is resurrected, the interval value will be hard to find and tune.
**Fix:** Define `const POLL_INTERVAL_MS = 10_000;` near the top of the file with the other constants and reference it here.

---

### IN-02: Latent bug inside dead polling block — empty `resolvedId` in URL

**File:** `servers/mcp-server.mjs:153`
**Issue:** If WR-01 is fixed and the polling branch becomes reachable, `resolvedId` may be an empty string when neither `swarmId` param nor `SWARM_ID` env var is set. The fetch URL becomes `/messages/?unread=true`, which is unlikely to be a valid hub endpoint.
**Fix:** Validate that `resolvedId` is non-empty before starting the poll interval, or obtain it from `data.worker.id` returned by the hub POST (which is the authoritative ID regardless of what was requested).

---

### IN-03: SKILL.md output section does not confirm `swarmId` back to the user

**File:** `skills/codestra-start-worker/SKILL.md:53-58`
**Issue:** The `## Output all'utente` section instructs Claude to show the worker ID and callback URL, but does not mention echoing back the `swarmId` that was passed as `$3`. If a user passes an explicit ID and the hub assigns a different one (e.g. conflict), the discrepancy is invisible.
**Fix:** Add a bullet: "Se `$3` è stato fornito, mostra l'ID richiesto e quello effettivamente assegnato dall'hub per confermare che corrispondono."

---

_Reviewed: 2026-04-26T09:02:00+02:00_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
