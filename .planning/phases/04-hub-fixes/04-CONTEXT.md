# Phase 4: Hub Fixes - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix two gaps in hub.mjs: (1) DELETE /workers/:id returns a proper 404 for unknown IDs, and (2) the `swarm_hub_start` MCP tool result includes a load-distribution system prompt that instructs Claude to delegate tasks to registered workers.

</domain>

<decisions>
## Implementation Decisions

### HUB-04: DELETE unknown ID response
- **D-01:** `DELETE /workers/:id` for an unknown ID returns HTTP 404 + `{ error: "Worker not found" }` (not 200 with `deleted: false`)
- **D-02:** `mcp-server.mjs` requires no changes — `swarm_kill_worker` already checks `data.deleted` (undefined = falsy) and returns "not found" correctly

### HUB-05: System prompt injection
- **D-03:** The system prompt is delivered as part of the `swarm_hub_start` tool result text in `mcp-server.mjs` — no new hub routes, no new MCP tools required
- **D-04:** The prompt is hardcoded in `mcp-server.mjs` (no env var, no configurability)
- **D-05:** Tone is brief and directive (2-3 lines): instruct Claude to delegate tasks to registered workers, mention `swarm_list_workers` to discover available workers

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core files
- `servers/hub.mjs` — Hub server; DELETE route at line 170 needs 404 fix
- `servers/mcp-server.mjs` — MCP server; `swarm_hub_start` tool at line 46 receives the prompt addition

### Requirements
- `.planning/REQUIREMENTS.md` — HUB-04 and HUB-05 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `json(res, status, data)` helper in hub.mjs: used for all responses, supports any status code — use for the 404 response
- `swarm_hub_start` tool in mcp-server.mjs (line 46): already returns multi-line text array joined with `\n` — append prompt text to this array

### Established Patterns
- All 404 responses in hub.mjs use `json(res, 404, { error: "..." })` — follow same pattern
- Tool results use `content: [{ type: "text", text: "..." }]` pattern throughout

### Integration Points
- DELETE route in hub.mjs line 170–173: replace `json(res, 200, { ok: true, deleted })` with 404 branch when `!deleted`
- `swarm_hub_start` return statement in mcp-server.mjs (line 62–72): add system prompt lines to the text array

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following existing patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-hub-fixes*
*Context gathered: 2026-04-25*
