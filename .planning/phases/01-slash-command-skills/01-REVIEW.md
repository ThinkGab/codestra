---
phase: 01-slash-command-skills
reviewed: 2026-04-19T09:58:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .claude-plugin/plugin.json
  - skills/codestra-start-hub/SKILL.md
  - skills/codestra-start-worker/SKILL.md
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-19T09:58:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the plugin manifest and both slash command skill prompt templates against the actual MCP server tool contracts (`servers/mcp-server.mjs`) and hub server (`servers/hub.mjs`).

The manifest is minimal and sound. The skill templates are generally well-structured, but cross-referencing them against the actual tool implementations reveals four correctness/clarity issues that could cause Claude to behave incorrectly at runtime, plus three minor quality items.

No security vulnerabilities were found. Argument interpolation ($0, $1, $2) is used for read-only construction of URLs and env vars — no command injection risk beyond what is inherent in any bash-constructing prompt template.

---

## Warnings

### WR-01: `swarm_hub_start` port parameter type mismatch — skill passes string, tool expects number

**File:** `skills/codestra-start-hub/SKILL.md:21`

**Issue:** The skill instructs Claude to call `swarm_hub_start` with `port=$0`, where `$0` is the raw string argument typed by the user (e.g., `"7800"`). The MCP tool schema declares `port` as `z.number().optional()`. Passing a string where a number is expected will cause a Zod validation error and the tool call will fail at runtime.

**Fix:** The skill should instruct Claude to parse `$0` as an integer before passing it to the tool, or make the expected type explicit:

```
- Se solo `$0` fornito: chiama `swarm_hub_start` con `port=parseInt($0)` (numero intero).
```

Alternatively, add a note: "Assicurati di passare `port` come numero (es. `port: 7800`), non come stringa."

---

### WR-02: Caso B bash command uses hardcoded relative path `hub.mjs`, but `swarm_hub_start` resolves path dynamically via `import.meta.url`

**File:** `skills/codestra-start-hub/SKILL.md:29`

**Issue:** In Caso B (when `$1` is present), the skill bypasses the `swarm_hub_start` tool and tells Claude to build and run a bash command directly, hardcoding the hub path as:

```bash
SWARM_HOST=$1 SWARM_PORT=$0 nohup node "${CLAUDE_SKILL_DIR}/../../servers/hub.mjs" > /tmp/swarm-hub.log 2>&1 &
```

But when the `swarm_hub_start` tool constructs the command, it resolves the path at runtime using `new URL("./hub.mjs", import.meta.url).pathname` (mcp-server.mjs line 57), which produces the absolute path to `hub.mjs` regardless of the caller's working directory. The skill's `${CLAUDE_SKILL_DIR}/../../servers/hub.mjs` path traversal is fragile — it depends on `CLAUDE_SKILL_DIR` being set and the directory structure being exactly two levels deep. If the plugin is installed differently or `CLAUDE_SKILL_DIR` is not set, the command will fail silently (`nohup` swallows the error).

**Fix:** Instruct Claude to obtain the hub path from the tool's output when possible, or use `${CLAUDE_PLUGIN_ROOT}/servers/hub.mjs` (which is how `.mcp.json` references the MCP server) for consistency:

```bash
SWARM_HOST=$1 SWARM_PORT=$0 nohup node "${CLAUDE_PLUGIN_ROOT}/servers/hub.mjs" > /tmp/swarm-hub.log 2>&1 &
```

Also add a fallback note: "Se `CLAUDE_PLUGIN_ROOT` non è disponibile, usa il percorso assoluto restituito dal tool `swarm_hub_start` (eseguilo prima per ottenere il path)."

---

### WR-03: Worker skill JSON snippet contains un-interpolated shell syntax that will be shown literally to the user

**File:** `skills/codestra-start-worker/SKILL.md:26-35`

**Issue:** The `.mcp.json` snippet shown to the user contains `${1:-7800}`:

```json
{
  "mcpServers": {
    "codestra": {
      "env": {
        "SWARM_HUB_URL": "http://$0:${1:-7800}"
      }
    }
  }
}
```

Two problems:
1. The JSON key is `"codestra"` but the actual MCP server is registered as `"claude-swarm"` in `.mcp.json` (line 3). Updating the wrong key will have no effect.
2. `${1:-7800}` is bash parameter expansion syntax. It is not valid inside a JSON string value that a user will paste into `.mcp.json` — JSON parsers do not evaluate shell syntax. The user must see a concrete URL like `http://192.168.1.10:7800`.

**Fix:** Instruct Claude to substitute the actual values before showing the snippet:

```
Mostra all'utente il JSON con i valori già interpolati:
{
  "mcpServers": {
    "claude-swarm": {
      "env": {
        "SWARM_HUB_URL": "http://<hub-ip>:<hub-port>"
      }
    }
  }
}
```

Also fix the server key from `"codestra"` to `"claude-swarm"` to match the real `.mcp.json`.

---

### WR-04: `swarm_register` role field — skill hardcodes `"worker"` but tool accepts optional role defaulting from env

**File:** `skills/codestra-start-worker/SKILL.md:42-43`

**Issue:** The skill instructs Claude to call `swarm_register` with `role: "worker"` unconditionally. However, `swarm_register` in mcp-server.mjs (line 102-103) declares `role` as optional and falls back to the `SWARM_ROLE` env var when omitted. If a user's `.mcp.json` already sets `SWARM_ROLE=leader` (e.g., for a leader instance that also registers), the skill's forced `"worker"` overrides the configured role silently. This is a logic correctness issue — the skill should either omit the role (letting env win) or document the override behavior.

**Fix:** Change the instruction to:

```
1. Usa il tool `swarm_register` con:
   - `role`: `"worker"` (oppure ometti per usare il valore di SWARM_ROLE dall'env)
   - `task`: breve descrizione del lavoro che questo worker svolgerà (chiedere all'utente se non noto)
```

---

## Info

### IN-01: `plugin.json` — missing `skills` field pointing to skill directory

**File:** `.claude-plugin/plugin.json:1-8`

**Issue:** The manifest has no `skills` field. If the Claude plugin loader discovers skills by convention from a `skills/` directory adjacent to the plugin root, this is fine. But if the loader requires explicit registration, skills will be silently ignored. The field is absent with no comment explaining why.

**Fix:** Add a `skills` field if the plugin loader supports/requires it, e.g.:

```json
"skills": "./skills"
```

If discovery is purely convention-based, add an inline comment in documentation to clarify the intentional omission.

---

### IN-02: Hub skill does not mention `secret` parameter of `swarm_hub_start`

**File:** `skills/codestra-start-hub/SKILL.md:12-14`

**Issue:** The `swarm_hub_start` tool accepts a `secret` parameter (`z.string().optional()`) for setting `SWARM_SECRET`. The skill's parameter list only documents `port` ($0) and `ip` ($1). A user who wants to start a secured hub has no way to pass the secret via the slash command. This is a completeness gap relative to the tool contract.

**Fix:** Either extend the `argument-hint` to `[port] [ip] [secret]` and document `$2` as the secret parameter, or add a note explaining that `SWARM_SECRET` must be set via env var in `.mcp.json` instead.

---

### IN-03: Worker skill's `$2` (worker-port) is accepted as input but immediately discarded with no validation

**File:** `skills/codestra-start-worker/SKILL.md:15`

**Issue:** The skill documents `$2` as the worker port for Phase 2, and instructs Claude to "Ignorare per ora se fornito." Silently ignoring a user-supplied argument with no acknowledgment could confuse users who provide it expecting effect. This is a UX clarity issue, not a bug.

**Fix:** Add an explicit instruction to tell the user when `$2` is provided:

```
- Se `$2` è fornito: informa l'utente che il parametro worker-port sarà attivo nella Fase 2 e verrà ignorato per ora.
```

---

_Reviewed: 2026-04-19T09:58:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
