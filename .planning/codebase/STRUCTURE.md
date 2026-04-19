# STRUCTURE.md — Directory Layout
_Last updated: 2026-04-19_

## Tree

```
codestra/                          # repo root
├── .claude-plugin/
│   ├── plugin.json                # Claude Code plugin manifest (name, version, author, mcpServers)
│   └── plugin.jsons               # duplicate / alternate manifest (identical content)
├── assets/
│   ├── codestra-banner.svg        # README hero image
│   ├── codestra-logo.svg          # Logo mark
│   └── codestra-architecture.svg  # Architecture diagram for README
├── hooks/
│   └── hooks.json                 # SessionStart hook — auto-register with hub
├── servers/
│   ├── hub.mjs                    # HTTP hub server (main broker)
│   ├── mcp-server.mjs             # MCP stdio bridge (per-instance)
│   └── package.json               # npm manifest for servers/ only
├── skills/
│   ├── orchestrate/
│   │   ├── SKILL.md               # Orchestration skill definition (stub)
│   │   └── references/
│   │       └── patterns.md        # Advanced patterns reference (stub — only heading)
│   └── messaging/
│       └── SKILL.md               # Messaging skill definition (stub)
├── .mcp.json                      # MCP server launch config for Claude Code
├── .gitignore                     # Standard Node.js gitignore
├── LICENSE                        # MIT
└── README.md                      # Full project docs + architecture diagram
```

## Key Locations

| Path | What's there |
|:-----|:-------------|
| `servers/hub.mjs` | All hub logic: routes, router, state (workers Map, messages Array) |
| `servers/mcp-server.mjs` | All 9 MCP tool definitions, `hubFetch()` helper |
| `servers/package.json` | Only dependency: `@modelcontextprotocol/sdk` |
| `.claude-plugin/plugin.json` | Plugin manifest — read by `claude plugin install` |
| `.mcp.json` | MCP server config — env var templating with `${VAR:-default}` syntax |
| `hooks/hooks.json` | SessionStart prompt hook — instructs Claude to register on start |
| `skills/orchestrate/` | Intended skill for worker orchestration (content is a stub) |
| `skills/messaging/` | Intended skill for inter-worker messaging (content is a stub) |

## Naming Conventions

- Source files: `kebab-case.mjs` (e.g., `hub.mjs`, `mcp-server.mjs`)
- MCP tools: `swarm_<verb>_<noun>` snake_case (e.g., `swarm_hub_status`, `swarm_spawn_worker`)
- Worker IDs: 4-byte hex from `crypto.randomBytes` (e.g., `a3f9c201`) or `w-<base36-timestamp>`
- Message IDs: same 4-byte hex pattern

## Gaps / Stubs

- `skills/orchestrate/SKILL.md` — only frontmatter `---`, no content
- `skills/messaging/SKILL.md` — only frontmatter `---`, no content
- `skills/orchestrate/references/patterns.md` — only `# Advanced Orchestration Patterns` heading
- `.claude-plugin/plugin.jsons` — appears to be duplicate of `plugin.json` (same content, extra `s` in filename)
- No `node_modules/` — not installed yet (needs `npm install` in `servers/`)
- No `.planning/` directory (before this map was created)
