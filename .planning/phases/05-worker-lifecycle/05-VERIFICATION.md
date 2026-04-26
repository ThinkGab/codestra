---
phase: 05-worker-lifecycle
verified: 2026-04-26T09:06:00+02:00
status: gaps_found
score: 3/4 roadmap success criteria verified
overrides_applied: 0
gaps:
  - truth: "After a successful swarm_register call, mcp-server.mjs begins polling the hub every 10 seconds without any additional user action"
    status: failed
    reason: "The polling block at line 150 is guarded by `if (!callbackUrl)`. Because callbackUrl is always assigned a non-empty string at line 132 (`const callbackUrl = \`http://${WORKER_HOST}:${boundPort}\``), the condition is always false and setInterval never fires. The SUMMARY explicitly documents this: 'nella versione corrente del codice callbackUrl è sempre valorizzata... quindi il polling non si attiva mai in normale operazione.' WORKER-04 is structurally present but behaviourally dead."
    artifacts:
      - path: "servers/mcp-server.mjs"
        issue: "Line 150: `if (!callbackUrl)` is always false because callbackUrl is set unconditionally at line 132. The setInterval block (lines 151-160) is unreachable dead code."
    missing:
      - "Change the polling condition from `if (!callbackUrl)` to `if (callbackUrl)` to activate automatic polling after every successful registration (aligns with WORKER-04 intent), OR invert the design decision to always poll and remove the callbackUrl guard entirely, OR update the roadmap SC to reflect the intentional design that polling is a fallback-only path"
  - truth: "The polling loop runs in the background and does not block MCP tool execution"
    status: failed
    reason: "Depends on SC #2. Because the polling setInterval never starts, this criterion cannot be independently verified. The infrastructure (non-blocking setInterval pattern, async callback, silent error catch) is structurally correct — the only issue is the guard condition preventing it from ever being scheduled."
    artifacts:
      - path: "servers/mcp-server.mjs"
        issue: "Dead code at lines 150-161. setInterval never scheduled."
    missing:
      - "Fix the guard condition (same fix as gap 1 above). Once polling activates, the non-blocking pattern is already correct."
deferred: []
human_verification:
  - test: "Orphan process test — verify no daemon survives Claude exit"
    expected: "After running swarm_register and then closing the Claude Code session, the mcp-server.mjs process (and its worker HTTP server) should no longer appear in `ps aux`. No TCP port should remain bound."
    why_human: "Cannot simulate Claude Code stdin-close programmatically in this context. Requires starting a real Claude Code session with the MCP server, then closing it, and checking process table."
---

# Phase 5: Worker Lifecycle Verification Report

**Phase Goal:** Workers are self-identifying (SWARM_ID), self-polling, and leave no orphaned processes when Claude exits
**Verified:** 2026-04-26T09:06:00+02:00
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `/codestra-start-worker [hub-ip] [hub-port] [worker-port] [swarm-id]` passes SWARM_ID to mcp-server.mjs and hub registration payload includes that ID | VERIFIED | SKILL.md line 4: argument-hint includes `[swarm-id?]`; line 16: $3 param documented; line 47: swarm_register invocation instructs passing $3 as `swarmId`. mcp-server.mjs line 112: `swarmId` in schema; line 114: destructured in handler; line 141: `resolvedId = swarmId \|\| INSTANCE_ID`; line 142: `if (resolvedId) body.id = resolvedId` — ID flows into hub POST body. |
| 2 | After a successful `swarm_register` call, mcp-server.mjs begins polling the hub every 10 seconds without any additional user action | FAILED | Lines 150-161 contain the setInterval polling block but it is guarded by `if (!callbackUrl)`. callbackUrl is set unconditionally at line 132 to `http://${WORKER_HOST}:${boundPort}` — a string that is always truthy after startWorkerServer resolves. The condition is always false; setInterval never fires. |
| 3 | The polling loop runs in the background and does not block MCP tool execution | FAILED | Depends on SC #2. The loop never starts. The structural pattern (async setInterval, silent catch) is correct but unreachable. |
| 4 | When the Claude Code instance exits, the MCP daemon process terminates automatically (no orphan process) | VERIFIED (code) / HUMAN NEEDED (runtime) | cleanup() at lines 421-424: `clearInterval(pollInterval)` + `if (httpServer) httpServer.close()`. process.stdin.on('close', cleanup) at line 426 wires exit detection. Node.js process exits naturally when stdin closes and no other async work holds the event loop. Runtime confirmation requires human test. |

**Score:** 2/4 roadmap truths fully verified (SC #1 and SC #4 code-verified; SC #2 and SC #3 failed)

### Plan 01 Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | swarm_register accepts an optional swarmId parameter that overrides SWARM_ID env var in the hub POST body | VERIFIED | Lines 112, 114, 141-142 in mcp-server.mjs. resolvedId = swarmId \|\| INSTANCE_ID; body.id = resolvedId. |
| 2 | After swarm_register completes (when no callback_url fallback path is active), a pollInterval setInterval is declared at module scope | FAILED | `let pollInterval` is declared at module scope (line 101). However the polling block condition `if (!callbackUrl)` at line 150 is always false because callbackUrl is always assigned. The setInterval is never called; pollInterval remains undefined. |
| 3 | When the Claude Code stdio pipe closes, cleanup() fires: clearInterval(pollInterval) + httpServer.close() | VERIFIED | cleanup() defined lines 421-424; stdin close listener line 426. clearInterval(undefined) is safe no-op in Node.js. httpServer guarded with null check. |
| 4 | The MCP daemon exits naturally after stdin closes — no orphan process remains | VERIFIED (code) | With httpServer.close() called and no active setInterval, the event loop drains and Node.js exits naturally. Human test needed for runtime confirmation. |
| 5 | httpServer is captured from startWorkerServer result and available to cleanup | VERIFIED | Line 123: `httpServer = result.server;` — module-scope assignment inside try block. Available to cleanup() closure. |

### Plan 02 Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The skill signature documents [swarm-id?] as the fourth optional argument | VERIFIED | SKILL.md line 4: `argument-hint: [hub-ip] [hub-port] [worker-port?] [swarm-id?]` |
| 2 | The skill parameter list includes a $3 entry describing swarmId | VERIFIED | SKILL.md line 16: `- Swarm ID (\`$3\`): opzionale — ID univoco...` |
| 3 | The swarm_register invocation instructions tell Claude to pass $3 as swarmId when provided | VERIFIED | SKILL.md line 47: `- \`swarmId\`: se \`$3\` è fornito, passare il suo valore stringa; altrimenti omettere (il server usa l'env var)` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `servers/mcp-server.mjs` | swarmId param, module-scope lifecycle state, polling fallback, stdin close handler | PARTIAL — STUB (polling dead code) | File exists, 427 lines, passes `node --check`. All insertions present syntactically. Polling block structurally dead — setInterval never fires in any normal code path. |
| `skills/codestra-start-worker/SKILL.md` | Updated argument signature and swarmId invocation instructions | VERIFIED | File exists, 57 lines. All three required strings present: `swarm-id?` (1 occurrence), `swarmId` (2 occurrences), `$3` (2 occurrences). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| swarm_register handler | module-scope httpServer / pollInterval | assignment inside async handler | PARTIAL | `httpServer = result.server` at line 123 — WIRED. `pollInterval = setInterval(...)` inside `if (!callbackUrl)` at line 151 — NEVER ASSIGNED (dead code path). |
| process.stdin.on | cleanup function | event listener registration after server.connect | VERIFIED | Line 426: `process.stdin.on('close', cleanup)` — registered after `server.connect(transport)` at line 418. Correct order. |
| SKILL.md argument-hint | swarm_register swarmId param | $3 positional argument -> swarmId tool parameter | VERIFIED | SKILL.md line 4 documents [swarm-id?]; line 47 instructs passing $3 as swarmId string. mcp-server.mjs line 112 accepts it. Chain complete. |

### Data-Flow Trace (Level 4)

Not applicable — modified files are an MCP server (stdin/stdout transport) and a skill instruction document. No React/component rendering chain to trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| mcp-server.mjs valid ES module syntax | `node --check servers/mcp-server.mjs` | Exit 0, no output | PASS |
| swarmId present in schema (3+ occurrences) | `grep -c "swarmId" servers/mcp-server.mjs` | 3 | PASS |
| Module-scope let httpServer declared | `grep -n "let httpServer" servers/mcp-server.mjs` | Line 100 | PASS |
| Module-scope let pollInterval declared | `grep -n "let pollInterval" servers/mcp-server.mjs` | Line 101 | PASS |
| httpServer captured inside handler | `grep -n "httpServer = result.server" servers/mcp-server.mjs` | Line 123 | PASS |
| stdin close listener registered | `grep -n "process.stdin.on" servers/mcp-server.mjs` | Line 426 | PASS |
| Polling condition evaluation | `node -e "const c='http://localhost:1'; console.log(!c)"` | false | FAIL — setInterval block is dead code; condition `!callbackUrl` is always false |
| SKILL.md argument-hint updated | `grep "argument-hint" skills/codestra-start-worker/SKILL.md` | `[hub-ip] [hub-port] [worker-port?] [swarm-id?]` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WORKER-03 | 05-01, 05-02 | Worker accepts SWARM_ID parameter at startup | SATISFIED | swarmId param in mcp-server.mjs schema + handler; SKILL.md $3 argument documented and wired to swarm_register invocation |
| WORKER-04 | 05-01 | Worker starts automatic polling every 10s after registration | BLOCKED | setInterval block present but guarded by `if (!callbackUrl)` which is always false. Polling never starts in any normal execution path. |
| WORKER-05 | 05-01 | Exiting Claude kills the MCP daemon process | SATISFIED (code) | cleanup() + process.stdin.on('close') implemented and wired. Runtime test needed for full confirmation. |

**Orphaned requirements from REQUIREMENTS.md mapped to Phase 5:** None. WORKER-03, WORKER-04, WORKER-05 are all claimed by plans 05-01 and 05-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `servers/mcp-server.mjs` | 150 | `if (!callbackUrl)` — always-false guard on setInterval | Blocker | WORKER-04 polling never starts. callbackUrl is assigned unconditionally at line 132 before this check. pollInterval remains undefined; `clearInterval(undefined)` in cleanup is a no-op (correct) but polling was the intended behavior. |

### Human Verification Required

#### 1. Orphan Process Test

**Test:** Start a Claude Code session with `codestra` MCP server configured. Call `swarm_register`. Note the PID of the mcp-server.mjs process (`ps aux | grep mcp-server`). Then close the Claude Code window (or `exit` from the terminal session).

**Expected:** Within 1-2 seconds, the mcp-server.mjs process should no longer appear in `ps aux`. No port should remain bound (`ss -tlnp | grep <worker-port>`).

**Why human:** Cannot simulate Claude Code stdio pipe close programmatically in this verification context. This is the core WORKER-05 runtime guarantee.

---

## Gaps Summary

**1 root-cause gap blocking 2 success criteria (SC #2 and SC #3 / WORKER-04):**

The polling fallback block in `swarm_register` was implemented with an inverted condition. The intent (per CONTEXT.md D-04 and PLAN 01 task description) is to start polling only when the worker lacks a callback_url. However, in the current implementation, `callbackUrl` is **always** set unconditionally at line 132 — it is constructed from the worker's HTTP server port which is always assigned by `startWorkerServer`. The guard `if (!callbackUrl)` is therefore always false, and `setInterval` is never scheduled.

The SUMMARY documents this as a known limitation: "Il blocco di polling è condizionale su `!callbackUrl`: nella versione corrente del codice `callbackUrl` è sempre valorizzata... quindi il polling non si attiva mai in normale operazione — è predisposto come fallback strutturale per refactoring futuri."

This is acknowledged dead code that was accepted as "structural preparation for future refactoring" — but this directly contradicts WORKER-04's requirement ("Worker avvia polling automatico ogni 10s verso l'hub subito dopo la registrazione") and Roadmap SC #2 ("begins polling the hub every 10 seconds without any additional user action").

**Resolution options:**
1. Change `if (!callbackUrl)` to `if (callbackUrl)` or remove the guard entirely to always poll after registration. This satisfies WORKER-04 and SC #2 at the cost of slightly increased hub traffic (10s heartbeats from all workers).
2. Accept the current behavior as intentional and update WORKER-04 / SC #2 in REQUIREMENTS.md and ROADMAP.md to reflect that polling is only a fallback path (never active when push delivery is configured). If accepted, add an `overrides:` entry to this file.

**All other must-haves pass.** WORKER-03 (swarmId identification chain), WORKER-05 (clean shutdown via stdin close), and the SKILL.md documentation updates are fully implemented and wired correctly.

---

_Verified: 2026-04-26T09:06:00+02:00_
_Verifier: Claude (gsd-verifier)_
