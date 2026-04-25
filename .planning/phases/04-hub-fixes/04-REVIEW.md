---
phase: 04-hub-fixes
reviewed: 2026-04-25T21:50:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - servers/hub.mjs
  - servers/mcp-server.mjs
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-25T21:50:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Both phase-4 changes (DELETE 404 fix in `hub.mjs`, `swarm_hub_start` SYSTEM prompt injection and `swarm_kill_worker` `data.ok` check in `mcp-server.mjs`) are correctly implemented and behave as specified. No critical issues were found.

Three warnings are present: a command injection risk in `swarm_spawn_worker` (pre-existing but relevant), missing error handling on most `hubFetch` calls, and a plain-string auth comparison in the worker HTTP server. Three info items cover unquoted path interpolation, an internal naming inconsistency, and a minor `swarm_update_status` edge case.

---

## Warnings

### WR-01: Command Injection via Unescaped Task String in swarm_spawn_worker

**File:** `servers/mcp-server.mjs:172-178`
**Issue:** `escapedTask` escapes double quotes but not shell metacharacters (`$`, backticks, `\``$(...)``). The value is interpolated directly into `claude --print "${escapedTask}"` which is handed to the shell. A task string containing `$(rm -rf .)` or `` `id` `` would be expanded by the shell when the user runs the generated command.

```js
// Current — only escapes "
const escapedTask = task.replace(/"/g, '\\"').replace(/\n/g, "\\n");
// ...
`${envVars.join(" ")} claude --print "${escapedTask}"`,
```

**Fix:** Pass the task via an environment variable and reference it, so no shell expansion occurs on the content:

```js
// Set task as env var — shell never parses its content
envVars.push(`SWARM_TASK=${JSON.stringify(task)}`);   // quoted for shell
// In the command line:
`${envVars.join(" ")} claude --print "$SWARM_TASK"`,
```

Alternatively, write the task to a temp file and pass `--print "$(cat /tmp/task.txt)"` is still vulnerable; the safest path is the env-var approach above.

---

### WR-02: Most hubFetch Calls Have No Error Handling — Unhandled Rejections

**File:** `servers/mcp-server.mjs:221, 246, 297, 316`
**Issue:** `swarm_list_workers`, `swarm_send_message`, `swarm_update_status`, and `swarm_kill_worker` all call `hubFetch(...)` without a try/catch. If the hub is unreachable (ECONNREFUSED, timeout, DNS failure), the Promise rejects and the MCP tool call crashes with an unhandled exception rather than returning a user-readable error. Only `swarm_hub_status` (line 86) handles errors correctly.

```js
// Current — swarm_list_workers, line 221
const data = await hubFetch("/workers");   // throws if hub is down
```

**Fix:** Wrap each tool handler body (or the hubFetch calls) in try/catch, mirroring the pattern already used in `swarm_hub_status`:

```js
async () => {
  try {
    const data = await hubFetch("/workers");
    // ...
  } catch (err) {
    return {
      content: [{ type: "text", text: `Hub not reachable at ${HUB_URL}: ${err.message}` }],
      isError: true,
    };
  }
}
```

This affects four tools: `swarm_list_workers`, `swarm_send_message`, `swarm_update_status`, `swarm_kill_worker`.

---

### WR-03: Worker Auth Uses Plain String Comparison Instead of timingSafeEqual

**File:** `servers/mcp-server.mjs:338`
**Issue:** The worker HTTP server authenticates incoming hub pushes with `token !== SECRET` — a plain string comparison. The hub (`hub.mjs:70-75`) uses `crypto.timingSafeEqual` to prevent timing oracle attacks. The worker is inconsistent and susceptible to the same attack class, even if the practical risk on localhost is lower.

```js
// Current
if (token !== SECRET) {
```

**Fix:** Mirror the hub's pattern:

```js
import crypto from "node:crypto";
// ...
const tokenBuf  = Buffer.from(token.padEnd(SECRET.length));
const secretBuf = Buffer.from(SECRET);
if (
  tokenBuf.length !== secretBuf.length ||
  !crypto.timingSafeEqual(tokenBuf, secretBuf)
) {
  json(res, 401, { error: "Unauthorized" });
  return;
}
```

---

## Info

### IN-01: Unquoted Path Interpolations in Generated Shell Commands

**File:** `servers/mcp-server.mjs:60, 178`
**Issue:** Two generated shell command strings interpolate paths without quoting:

- Line 60: `` `${env.join(" ")} nohup node ${hubPath} > /tmp/swarm-hub.log 2>&1 &` `` — `hubPath` is unquoted; breaks if the path contains spaces.
- Line 178: `` `cd ${workDir}` `` — `workDir` (user-supplied) is unquoted; breaks on paths with spaces.

**Fix:**

```js
// Line 60
const cmd = `${env.join(" ")} nohup node "${hubPath}" > /tmp/swarm-hub.log 2>&1 &`;

// Line 178
`cd "${workDir}"`,
```

---

### IN-02: File Header Still Says "Claude Swarm" After Codestra Rebrand

**File:** `servers/mcp-server.mjs:3`
**Issue:** The file-level JSDoc comment reads `Claude Swarm — MCP Server`. The project was rebranded to Codestra (observed in phase history; `hub.mjs` line 4 already says `Codestra — Hub Server`). The name mismatch is cosmetic but creates confusion in logs and documentation.

**Fix:**

```js
/**
 * Codestra — MCP Server (stdio transport)
```

---

### IN-03: swarm_update_status Sends Empty PATCH Body if Neither status nor task Is Provided

**File:** `servers/mcp-server.mjs:293-300`
**Issue:** Both `status` and `task` are optional. If the caller provides neither, `body` remains `{}` and a PATCH request is sent with an empty payload. The hub will still respond 200 and update `lastSeen`, but the tool call becomes a no-op that silently succeeds — no user feedback that nothing changed.

**Fix:** Guard before making the request:

```js
if (!status && !task) {
  return {
    content: [{ type: "text", text: "Nothing to update — provide status and/or task." }],
  };
}
```

---

_Reviewed: 2026-04-25T21:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
