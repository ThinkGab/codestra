# CONVENTIONS.md — Code Conventions
_Last updated: 2026-04-19_

## Language & Module Style

- Plain JavaScript ESM — `import`/`export`, no CommonJS `require`
- No TypeScript. JSDoc `@type` annotations used sparingly in `hub.mjs`
- Top-level `await` used in `mcp-server.mjs` (ESM feature)
- Shebang lines on both server files: `#!/usr/bin/env node`

## File Organization

- Each server file is a single self-contained module — no imports between them
- Section headers via comment blocks: `// ── Section Name ──────`
- Constants declared at top after imports
- State declared immediately after constants

## Naming

- **Variables/functions:** camelCase (`hubFetch`, `readBody`, `matchRoute`, `generateId`)
- **Constants:** `SCREAMING_SNAKE_CASE` (`PORT`, `HOST`, `SECRET`, `HUB_URL`, `ROLE`)
- **MCP tool names:** `swarm_<verb>_<noun>` snake_case
- **HTTP routes:** string keys `"METHOD /path"` (e.g., `"POST /workers"`, `"GET /workers/:id"`)

## Error Handling

- Hub: all route handlers wrapped in try/catch → `json(res, 500, { error: err.message })`
- Auth failure: `json(res, 401, { error: "..." })` + return false
- 404: `json(res, 404, { error: "Not found" })`
- Body parse failure: silently falls back to `{}` (in `readBody`)
- MCP tools: `try/catch` in `swarm_hub_status` returns `isError: true` response
- `swarm_spawn_worker`: pre-registration failure silently swallowed (comment explains why)

## Response Format

- Hub always responds with JSON via `json(res, status, data)` helper
- Success shape: `{ ok: true, <entity>: {...} }` or `{ <entities>: [...] }`
- Error shape: `{ error: "message string" }`
- MCP tools return: `{ content: [{ type: "text", text: "..." }] }`

## Async Patterns

- `async/await` throughout — no raw Promise chains
- `readBody()` returns a Promise (event-based body accumulation)
- `hubFetch()` wraps native `fetch` with auth headers

## Code Style (inferred — no config)

- 2-space indentation
- Double quotes for strings
- Trailing commas in multi-line objects/arrays
- Arrow functions for callbacks and route handlers
- Destructuring assignment used for params (`{ port, secret }`, `{ from, to, body }`)
- Template literals for string interpolation
- Ternary operators for simple conditionals

## Comments

- Block comment at file top: purpose, usage, environment variables
- Section dividers: `// ── Name ──────` pattern
- Inline comments explaining non-obvious decisions (e.g., why pre-register failure is swallowed)
