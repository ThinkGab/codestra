# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-04-27

### Added
- **File Transport** — Upload, download, list, and delete files via the hub (`PUT/GET/DELETE /files/:swarmId/:filename`). Ideal for payloads > ~500 chars. Max 10 MB per file.
- **`codestra-file-transport` skill** — Claude-facing skill for file operations (upload, download, list, delete).
- **MCP file tools** — `file_upload`, `file_download`, `file_list`, `file_delete` exposed via MCP server.
- **`SWARM_ID` support** — Assign fixed identities to workers via `SWARM_ID` env var or `swarmId` param. Survives restarts, enables stable message routing.
- **Auto-polling heartbeat** — After `swarm_register`, worker polls hub every 10 s automatically.
- **Clean shutdown** — MCP daemon terminates cleanly on Claude exit. No orphan processes.
- **`codestra-worker-daemon` skill** — Run a worker in persistent daemon mode.

### Changed
- `swarm_register` now starts automatic polling — no manual setup needed.

## [0.1.0] - 2026-04-19

### Added
- Initial release: Hub & Spoke architecture for coordinating multiple Claude Code instances.
- HTTP hub server (`hub.mjs`) with worker registration, status tracking, and message routing.
- MCP stdio bridge (`mcp-server.mjs`) exposing `swarm_hub_start`, `swarm_hub_status`, `swarm_register`, `swarm_spawn_worker`, `swarm_list_workers`, `swarm_send_message`, `swarm_read_messages`, `swarm_update_status`, `swarm_kill_worker`.
- Skills: `codestra-start-hub`, `codestra-start-worker`, `codestra-workers`, `codestra-messages`, `codestra-broadcast`, `codestra-worker-update`, `codestra-worker-remove`, `codestra-gsd-parallel`.
- LAN-ready: `SWARM_HUB_URL` env var for multi-machine setups.
- Optional `SWARM_SECRET` for bearer token auth.
- Auto-registration via `SessionStart` hook.
