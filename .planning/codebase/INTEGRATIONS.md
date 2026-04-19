# INTEGRATIONS.md — External Integrations
_Last updated: 2026-04-19_

## Model Context Protocol (MCP)

- **SDK:** `@modelcontextprotocol/sdk` v1.12.0
- **Transport:** stdio (`StdioServerTransport`) — Claude Code spawns `mcp-server.mjs` as local subprocess
- **Server name:** `claude-swarm` v0.1.0
- **Config file:** `.mcp.json` — tells Claude Code how to launch the MCP server
- **No external MCP registries** — self-contained plugin

## Claude Code Plugin System

- **Manifest:** `.claude-plugin/plugin.json` — declares name, version, author, `mcpServers` pointer
- **Install command:** `claude plugin install codestra.plugin`
- **Hook system:** `hooks/hooks.json` SessionStart hook — on every session start, Claude calls `swarm_hub_status` then `swarm_register`

## Swarm Hub (Internal HTTP API)

The hub is an **internal service**, not an external integration — but it's the core inter-process communication layer:

- **Protocol:** HTTP/1.1 REST (plain Node.js `http` module)
- **Default URL:** `http://localhost:7800`
- **LAN use:** bind to `0.0.0.0`, accessible via LAN IP
- **Auth:** Bearer token (`Authorization: Bearer <SWARM_SECRET>`) — optional

### Hub Endpoints

| Method | Path | Description |
|:-------|:-----|:------------|
| GET | `/health` | Status, worker count, uptime |
| POST | `/workers` | Register/update worker |
| GET | `/workers` | List all workers |
| GET | `/workers/:id` | Get single worker |
| PATCH | `/workers/:id` | Update worker status/task |
| DELETE | `/workers/:id` | Unregister worker |
| POST | `/messages` | Send message |
| GET | `/messages/:workerId` | Read messages (supports `?unread=true`) |

## No External Services

- No database (all state in-memory: `Map` + `Array` in `hub.mjs`)
- No cloud APIs
- No auth providers (OAuth, etc.)
- No webhook endpoints
- No telemetry / analytics

## LAN Networking

- Hub binds `0.0.0.0` by default — reachable from other LAN machines
- Workers on remote machines set `SWARM_HUB_URL=http://<hub-ip>:7800`
- No TLS built-in — HTTPS requires reverse proxy in front of hub
