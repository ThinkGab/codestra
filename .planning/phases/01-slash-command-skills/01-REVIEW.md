---
phase: 01-slash-command-skills
reviewed: 2026-04-19T14:10:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .claude-plugin/plugin.json
  - skills/codestra-start-hub/SKILL.md
  - skills/codestra-start-worker/SKILL.md
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-19T14:10:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files reviewed: the plugin manifest and two LLM skill documents. The manifest is a clean JSON descriptor with no issues. The skill files are instruction documents that guide Claude Code instances through multi-step tool invocations. One warning was found in the hub skill — an unguarded env var expansion in a shell command template that silently produces an invalid path when `CLAUDE_PLUGIN_ROOT` is unset. Two info items cover a forward-reference to a Phase 2 field in the worker skill and a minor argument-hint ordering inconsistency.

---

## Warnings

### WR-01: Unguarded `CLAUDE_PLUGIN_ROOT` expansion produces silent path error

**File:** `skills/codestra-start-hub/SKILL.md:29`
**Issue:** The bash command template uses `"${CLAUDE_PLUGIN_ROOT}/servers/hub.mjs"` without any guard. If `CLAUDE_PLUGIN_ROOT` is unset at shell evaluation time, the variable expands to the empty string and the resulting command becomes `node "/servers/hub.mjs"`, which silently targets a non-existent absolute path. The advisory note ("if not available, run `swarm_hub_start` first") appears two lines later but is not a runtime guard — the LLM may issue the command before reading that note, and the shell will not error loudly until `node` fails.
**Fix:** Add a shell-level guard to the template command so the failure is explicit:

```bash
: "${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT is not set — run swarm_hub_start first to obtain it}"
SWARM_HOST=$1 SWARM_PORT=$0 nohup node "${CLAUDE_PLUGIN_ROOT}/servers/hub.mjs" > /tmp/swarm-hub.log 2>&1 &
```

The `:?` expansion causes the shell to print the error message and exit immediately if the variable is empty or unset, preventing a silent wrong-path invocation.

---

## Info

### IN-01: `callback_url` output instruction references Phase 2 field not yet in `swarm_register` response

**File:** `skills/codestra-start-worker/SKILL.md:55-56`
**Issue:** The "Output all'utente" section tells the LLM to display `callback_url` returned by `swarm_register`. Phase 2 (worker HTTP server) has not yet been implemented; the tool does not currently return this field. When a user runs the skill against the current implementation, the LLM will either silently skip the line or attempt to surface a field that does not exist, producing confusing output.
**Fix:** Mark the line as conditional on Phase 2 availability:

```markdown
- La `callback_url` del worker HTTP server (solo se restituita da `swarm_register` — disponibile dalla Fase 2)
```

### IN-02: `argument-hint` parameter order in hub skill inverts worker skill convention

**File:** `skills/codestra-start-hub/SKILL.md:4`
**Issue:** The hub skill `argument-hint` reads `[port] [ip]` (port first, IP second). The worker skill `argument-hint` reads `[hub-ip] [hub-port] [worker-port?]` (IP first, port second). Users familiar with the worker skill — or with standard CLI conventions — may invoke the hub skill as `[ip] [port]`, silently reversing the arguments with no error.
**Fix:** Either align hub skill argument order with worker skill (`[ip?] [port?]`) and update the Caso A/B branching logic accordingly, or add an explicit callout in the description warning that hub uses reversed order compared to the worker skill.

---

_Reviewed: 2026-04-19T14:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
