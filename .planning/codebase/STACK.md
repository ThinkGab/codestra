# STACK.md — Technology Stack
_Last updated: 2026-04-19_

## Runtime & Language

- **Runtime:** Node.js (ESM modules — `"type": "module"` in `servers/package.json`)
- **Language:** JavaScript (plain JS, no TypeScript)
- **Module format:** ES Modules (`import`/`export`), shebang `#!/usr/bin/env node`

## Framework & Core Libraries

| Package | Version | Role |
|:--------|:--------|:-----|
| `@modelcontextprotocol/sdk` | `^1.12.0` | MCP server + stdio transport |
| `zod` | (peer dep via MCP SDK) | Tool input schema validation |
| `node:http` | built-in | Hub HTTP server (no Express) |
| `node:crypto` | built-in | Worker ID generation (`randomBytes`) |

## Build & Tooling

- **No build step** — plain Node.js, no bundler, no transpilation
- **No TypeScript / tsconfig**
- **No linter config** (no `.eslintrc`, `.prettier`, etc.)
- **No test framework** (no Jest, Vitest, Mocha)
- **Scripts (in `servers/package.json`):**
  - `npm run hub` → `node hub.mjs`
  - `npm run mcp` → `node mcp-server.mjs`

## Claude Code Plugin System

- Plugin manifest: `.claude-plugin/plugin.json`
- MCP server config: `.mcp.json` (loaded by Claude Code on plugin install)
- Skills: `skills/orchestrate/SKILL.md`, `skills/messaging/SKILL.md`
- Hooks: `hooks/hooks.json` (SessionStart auto-register)

## Environment Variables

| Variable | Default | Where used |
|:---------|:--------|:-----------|
| `SWARM_PORT` | `7800` | `servers/hub.mjs` |
| `SWARM_HOST` | `0.0.0.0` | `servers/hub.mjs` |
| `SWARM_SECRET` | `""` | both servers |
| `SWARM_HUB_URL` | `http://localhost:7800` | `servers/mcp-server.mjs` |
| `SWARM_ROLE` | `worker` | `servers/mcp-server.mjs` |
| `SWARM_ID` | `""` | `servers/mcp-server.mjs` |

## Version

- Plugin version: `0.1.0` (in `.claude-plugin/plugin.json` and `servers/package.json`)
