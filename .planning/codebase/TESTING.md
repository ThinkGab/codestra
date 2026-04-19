# TESTING.md — Testing
_Last updated: 2026-04-19_

## Status: No Tests

There are **zero test files** in this codebase. No test framework is configured.

## What's Missing

- No test framework (Jest, Vitest, Mocha, etc.)
- No test scripts in `servers/package.json`
- No `__tests__/`, `test/`, or `*.test.mjs` files
- No CI configuration (no `.github/workflows/`, no `.circleci/`)
- No coverage tooling

## Testable Units (if tests were added)

### Hub (`servers/hub.mjs`)

| Function | Test type | Notes |
|:---------|:----------|:------|
| `json(res, status, data)` | Unit | Pure-ish, needs mock `res` |
| `readBody(req)` | Unit | Needs mock stream |
| `authorize(req, res)` | Unit | Check with/without SECRET |
| `generateId()` | Unit | Returns 8-char hex |
| `matchRoute(method, path)` | Unit | Exact + parameterized routes |
| Route handlers | Integration | Needs live HTTP or supertest-style |

### MCP Server (`servers/mcp-server.mjs`)

| Area | Test type | Notes |
|:-----|:----------|:------|
| `hubFetch()` | Unit | Mock `fetch`, verify auth header |
| Tool: `swarm_register` | Integration | Needs mock hub |
| Tool: `swarm_spawn_worker` | Unit | Verify command string generation |
| Tool: `swarm_send_message` | Integration | Needs mock hub |

## Recommended Approach (if adding tests)

- **Framework:** Vitest (ESM-native, fast, no config for basic use)
- **HTTP testing:** Use Node.js `fetch` against a real hub started in test setup, or mock `fetch`
- **MCP testing:** Mock `hubFetch` at module boundary

```bash
# Setup example
cd servers
npm install --save-dev vitest
```

## Manual Testing

Currently only manual testing via:
1. Start hub: `node servers/hub.mjs`
2. `curl http://localhost:7800/health`
3. Launch Claude Code with plugin and observe MCP tool calls
