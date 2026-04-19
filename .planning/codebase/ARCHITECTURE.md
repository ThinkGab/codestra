# ARCHITECTURE.md — System Architecture
_Last updated: 2026-04-19_

## Pattern: Hub & Spoke Multi-Agent Orchestration

Codestra is a **Claude Code plugin** that enables multiple Claude Code instances to coordinate via a central hub. The pattern is called "Hub & Spoke" (branded "Il Maestro / Orchestra").

```
┌──────────────────┐
│   IL MAESTRO     │  SWARM_ROLE=leader
│  (Leader)        │
│  Claude Code     │
└────────┬─────────┘
         │ MCP (stdio)
         │ mcp-server.mjs
         ▼
┌────────────────────┐
│    SWARM HUB       │  hub.mjs — HTTP :7800
│  in-memory state   │  workers: Map<id, Worker>
│  workers + msgs    │  messages: Message[]
└──┬─────┬─────┬─────┘
   │     │     │
┌──▼──┐ ┌▼───┐ ┌▼────┐
│ W1  │ │ W2 │ │ W3  │  SWARM_ROLE=worker
│ mcp │ │mcp │ │ mcp │  each has mcp-server.mjs
└─────┘ └────┘ └─────┘
```

## Layers

### 1. Plugin Layer (Claude Code integration)
- `.claude-plugin/plugin.json` — plugin manifest
- `.mcp.json` — MCP server launch config
- `hooks/hooks.json` — lifecycle hooks (SessionStart)
- `skills/` — Claude skill definitions (orchestrate, messaging)

### 2. MCP Bridge Layer (`servers/mcp-server.mjs`)
- Runs as local subprocess per Claude Code instance (stdio transport)
- Exposes 9 MCP tools to Claude Code
- Calls Hub REST API via `hubFetch()` helper
- Stateless — all state lives in the hub

### 3. Hub Layer (`servers/hub.mjs`)
- Central HTTP broker, one instance per swarm
- Owns all runtime state: worker registry + message queue
- Plain Node.js `http` — no framework
- Custom path-parameterized router (`matchRoute()`)
- Optional Bearer auth via `SWARM_SECRET`

## Data Flow

**Worker registration:**
```
Claude starts → SessionStart hook → swarm_register tool call →
mcp-server.mjs → POST /workers → hub stores in Map → returns worker ID
```

**Spawning a worker:**
```
Leader calls swarm_spawn_worker(task, cwd) →
mcp-server.mjs pre-registers worker in hub (status=spawning) →
returns shell command: SWARM_* env vars + `claude --print "<task>"` →
Leader runs command in new terminal / Bash
```

**Messaging:**
```
Sender calls swarm_send_message(from, to, body) →
POST /messages → hub stores in Array →
Recipient calls swarm_read_messages(workerId) →
GET /messages/:workerId?unread=true → marks read, returns
```

## Orchestration Patterns (documented)

1. **Fan-Out / Fan-In** — split task N-ways, parallel workers, leader collects
2. **Sequential Pipeline** — chain workers, each stage depends on prior
3. **Supervised Retry** — leader retries failed workers (max 3 attempts)

## Key Design Decisions

- **No persistence** — hub state is in-memory; restart clears everything
- **No process management** — `swarm_spawn_worker` returns a shell command, doesn't exec it (Claude Code runs it via Bash)
- **MCP as only interface** — all orchestration flows through MCP tools, no direct HTTP from Claude
- **Stateless MCP server** — `mcp-server.mjs` has no local state; hub is source of truth
- **Optional auth** — hub works without `SWARM_SECRET` (fine for trusted LAN)

## Entry Points

| Entry | Purpose |
|:------|:--------|
| `servers/hub.mjs` | Start hub: `SWARM_SECRET=x node hub.mjs` |
| `servers/mcp-server.mjs` | Started by Claude Code via `.mcp.json` config |
