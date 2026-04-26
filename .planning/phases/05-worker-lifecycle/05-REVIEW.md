---
phase: 05-worker-lifecycle
reviewed: 2026-04-26T07:23:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - .claude-plugin/marketplace.json
  - .mcp.json
  - README.md
  - servers/hub.mjs
  - servers/mcp-server.mjs
  - servers/package.json
  - skills/codestra-broadcast/SKILL.md
  - skills/codestra-gsd-parallel/SKILL.md
  - skills/codestra-messages/SKILL.md
  - skills/codestra-start-worker/SKILL.md
  - skills/codestra-worker-daemon/SKILL.md
  - skills/codestra-worker-remove/SKILL.md
  - skills/codestra-worker-update/SKILL.md
  - skills/codestra-workers/SKILL.md
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-26T07:23:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The Phase 5 worker lifecycle changes are largely correct. `hub.mjs` is solid after its Phase 4 fixes — auth, SSRF guard, push delivery, and routing are all well implemented. `mcp-server.mjs` has three lifecycle additions (WORKER-03 HTTP server, WORKER-04 polling heartbeat, WORKER-05 cleanup) that are structurally sound. Seven issues were found: one critical (shell injection in `swarm_spawn_worker`), four warnings (polling with empty ID, stdout corruption of MCP transport, leaked HTTP server on re-registration, unhandled hubFetch throws in six tool handlers), and two info items (stale tool name in a skill, wrong response field in another skill).

---

## Critical Issues

### CR-01: Shell Injection via Unquoted `cwd` in `swarm_spawn_worker`

**File:** `servers/mcp-server.mjs:198`
**Issue:** The `workDir` value (user-supplied `cwd` parameter) is interpolated unquoted into the generated shell command: `` `cd ${workDir}` ``. A caller passing `cwd` as e.g. `foo; rm -rf ~` would inject arbitrary shell commands into the command string returned to the user for execution. The `task` parameter is partially escaped (double-quotes and newlines only) but backticks, `$()`, and other shell metacharacters are not stripped.

**Fix:**
```javascript
// Quote workDir and sanitize task more thoroughly
const safeWorkDir = JSON.stringify(workDir); // produces "path/with spaces" safely
const escapedTask = task
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, '\\n')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

const cmd = [
  `# Worker ${workerId} — run in a new terminal`,
  `cd ${safeWorkDir}`,
  `${envVars.join(" ")} claude --print "${escapedTask}"`,
].join("\n");
```

---

## Warnings

### WR-01: Polling Heartbeat Uses Empty String as Worker ID When No ID Is Configured

**File:** `servers/mcp-server.mjs:154`
**Issue:** `resolvedId` is `swarmId || INSTANCE_ID`. When neither the `swarmId` parameter nor the `SWARM_ID` env var is set, `resolvedId` is `""` (empty string). The guard on line 142 correctly skips adding it to the body, so the hub auto-generates an ID — but that ID is never captured back into `resolvedId`. The polling interval (line 154) then polls `/messages/?unread=true` (with empty segment), which hits the wrong route or returns no messages, silently making push-delivery polling a no-op for auto-ID workers.

**Fix:** Capture the hub-assigned ID from the registration response and use it for polling:
```javascript
const data = await hubFetch("/workers", {
  method: "POST",
  body: JSON.stringify(body),
});

// Capture hub-assigned ID if none was provided
const assignedId = resolvedId || data.worker?.id || "";

pollInterval = setInterval(async () => {
  if (!assignedId) return; // can't poll without an ID
  try {
    const msgs = await hubFetch(`/messages/${assignedId}?unread=true`);
    if (msgs.messages && msgs.messages.length > 0) {
      process.stdout.write(`[worker-poll] ${JSON.stringify(msgs.messages)}\n`);
    }
  } catch {
    // silent skip
  }
}, 10_000);
```

### WR-02: `process.stdout.write` Corrupts the MCP stdio Transport

**File:** `servers/mcp-server.mjs:156` and `servers/mcp-server.mjs:378`
**Issue:** The MCP SDK uses stdio (stdin/stdout) as its transport layer — every byte written to stdout is interpreted by the MCP host as a protocol frame. Writing `[worker-poll] ...` and `[worker-push] ...` diagnostic lines directly to `process.stdout` will corrupt the JSON-RPC framing and break the MCP connection. This affects both the polling heartbeat (line 156) and the worker HTTP push handler (line 378).

**Fix:** Write diagnostics to stderr, which is not part of the MCP transport:
```javascript
// line 156
process.stderr.write(`[worker-poll] ${JSON.stringify(msgs.messages)}\n`);

// line 378
process.stderr.write(`[worker-push] ${body}\n`);
```

### WR-03: `httpServer` and `pollInterval` Leak on Repeated `swarm_register` Calls

**File:** `servers/mcp-server.mjs:100-123` and `servers/mcp-server.mjs:152`
**Issue:** `httpServer` and `pollInterval` are module-level variables overwritten on each call to `swarm_register`. If the tool is called more than once (e.g., a worker re-registers after a task), the previous HTTP server is never closed and the previous interval is never cleared before the new ones are created. Each re-registration leaks a listening TCP port and an active timer.

**Fix:** Clear the previous resources before creating new ones:
```javascript
async ({ role, task, workerPort, swarmId }) => {
  // Clean up previous lifecycle resources if re-registering
  if (pollInterval) { clearInterval(pollInterval); pollInterval = undefined; }
  if (httpServer)   { httpServer.close(); httpServer = undefined; }

  // ... rest of handler unchanged
```

### WR-04: Six Tool Handlers Have No Error Handling — Unhandled Promise Rejections Crash the Process

**File:** `servers/mcp-server.mjs` — lines 243, 268, 294, 315-320, 338, and the `swarm_register` hubFetch call at line 144
**Issue:** `hubFetch` can throw (network error, DNS failure, hub not running). The tools `swarm_list_workers`, `swarm_send_message`, `swarm_read_messages`, `swarm_update_status`, and `swarm_kill_worker` have no try/catch around their `hubFetch` calls. An unhandled rejection in an async MCP tool handler will propagate and crash the Node.js process. `swarm_register`'s hub POST (line 144) is also unguarded — the HTTP server is already started at that point, so an error leaves an orphaned server.

**Fix:** Wrap each handler body in try/catch and return `isError: true`:
```javascript
// Example for swarm_list_workers (apply same pattern to all five):
async () => {
  try {
    const data = await hubFetch("/workers");
    if (!data.workers || data.workers.length === 0) {
      return { content: [{ type: "text", text: "No workers registered." }] };
    }
    // ... format and return
  } catch (err) {
    return {
      content: [{ type: "text", text: `Hub not reachable: ${err.message}` }],
      isError: true,
    };
  }
}
```

---

## Info

### IN-01: `codestra-worker-daemon` References Non-Existent Tool `swarm_get_messages`

**File:** `skills/codestra-worker-daemon/SKILL.md:38`
**Issue:** The daemon polling loop instruction reads: "usando il tool `swarm_get_messages` o, se non disponibile, via Bash". The tool registered in `mcp-server.mjs` is named `swarm_read_messages` (line 286). `swarm_get_messages` does not exist. Claude following this skill will skip straight to the Bash fallback, bypassing the MCP tool entirely.

**Fix:** Update the skill to reference the correct tool name:
```markdown
Ripeti ogni `$1` secondi (default 30) usando il tool `swarm_read_messages` o, se non disponibile, via Bash:
```

### IN-02: `codestra-worker-remove` Checks for `deleted` Field — Hub Returns `ok`

**File:** `skills/codestra-worker-remove/SKILL.md:30-31`
**Issue:** The output instructions say to check `deleted: true` / `deleted: false`, but `DELETE /workers/:id` in `hub.mjs` returns `{ ok: true }` on success and `{ error: "Worker not found" }` on 404 — there is no `deleted` field. An agent following this skill will never see `deleted: true` and may misreport the outcome.

**Fix:** Update the output instructions to match the actual hub response:
```markdown
- Se risposta contiene `ok: true`: "Worker `<id>` rimosso con successo."
- Se risposta 404 / `error`: "Worker `<id>` non era presente nell'hub."
- Se errore di rete: mostra l'errore raw e suggerisci di verificare `SWARM_HUB_URL`.
```

---

_Reviewed: 2026-04-26T07:23:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
