# CONCERNS.md — Technical Concerns
_Last updated: 2026-04-19_

## High Priority

### No Persistence (Hub State Lost on Restart)
- All worker registrations and messages stored in-memory (`Map` + `Array`)
- Hub restart wipes all state — workers must re-register, messages are lost
- **Impact:** Any in-flight multi-agent task is broken if hub crashes
- **Files:** `servers/hub.mjs:26-28`

### No Message Queue Bounds
- `messages` array in `servers/hub.mjs:28` grows unbounded
- Long-running hub with heavy messaging will leak memory
- No TTL, no max-size, no cleanup
- **Files:** `servers/hub.mjs:28`, `hub.mjs:139`

### Skill Files Are Stubs
- `skills/orchestrate/SKILL.md` — only frontmatter `---`, no usable content
- `skills/messaging/SKILL.md` — same, empty stub
- `skills/orchestrate/references/patterns.md` — only heading
- Claude Code loads these as skill context; empty stubs provide no guidance
- **Impact:** Orchestration and messaging skills don't actually help Claude

## Security

### Hub Open by Default (No Auth)
- `SWARM_SECRET` is optional — hub runs unauthenticated if not set
- Default bind `0.0.0.0` exposes hub to entire LAN
- Any LAN device can register workers, send messages, read all messages
- **Files:** `servers/hub.mjs:21,58-64`
- README does warn about this — but default is insecure

### No TLS
- HTTP only — credentials and messages travel in plaintext on LAN
- README notes: "for internet use, put behind reverse proxy with HTTPS"
- **Concern:** Even on LAN, messages contain task instructions which may be sensitive

### No Rate Limiting
- `/workers` POST and `/messages` POST have no rate limits
- Malicious LAN actor could flood hub with registrations/messages

### Worker Identity Not Verified
- Any process can register as any worker ID (including overwriting existing workers)
- `POST /workers` with existing `id` updates that worker — no ownership check
- **Files:** `servers/hub.mjs:88-93`

## Code Quality

### Duplicate Plugin Manifest
- `.claude-plugin/plugin.json` and `.claude-plugin/plugin.jsons` have identical content
- The `plugin.jsons` filename is likely a typo (`s` suffix)
- **Files:** `.claude-plugin/plugin.json`, `.claude-plugin/plugin.jsons`

### No Input Validation on Hub Routes
- Route handlers read body fields without validation
- Missing `from`/`to`/`body` fields on `/messages` checked, but other routes aren't
- Worker `role`, `status` fields accept any string — not validated against enum
- **Files:** `servers/hub.mjs:109-117` (PATCH handler accepts any status string)

### Worker Spawn Uses Shell Command Return Pattern
- `swarm_spawn_worker` returns a shell command string for Claude to execute
- Relies on Claude Code running the Bash command — not deterministic
- If Claude doesn't run the command, worker is stuck in `status=spawning`
- **Files:** `servers/mcp-server.mjs:130-188`

### `plugin.jsons` File
- Unknown whether Claude Code plugin system reads `.jsons` extension
- Likely dead file — should be removed or renamed

## Missing Features

- No worker heartbeat / TTL — stale workers stay in registry forever
- No message history limits
- No worker-to-worker direct communication without hub
- Skills (`orchestrate`, `messaging`) are placeholders with no content
- No health monitoring for workers from leader's perspective
- No structured result collection pattern (workers send freeform message bodies)
