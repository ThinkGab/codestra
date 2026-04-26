# Phase 5: Worker Lifecycle - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 2
**Analogs found:** 2 / 2 (both files are self-analogs — modify in place)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `servers/mcp-server.mjs` | service + middleware | request-response + event-driven | itself (modify in place) | exact |
| `skills/codestra-start-worker/SKILL.md` | config / instruction | n/a | itself (modify in place) | exact |

---

## Pattern Assignments

### `servers/mcp-server.mjs` — three insertion points

#### Analog: itself. All patterns below are extracted from the current file.

---

#### INSERTION A — Add `swarmId` param to `swarm_register` tool schema (lines 101–108)

**Existing optional-param pattern** (lines 105–107):
```js
role: z.enum(["leader", "worker"]).optional().describe("Role of this instance (default from env)"),
task: z.string().optional().describe("Brief description of what this instance is working on"),
workerPort: z.number().optional().describe("Port for the worker HTTP server (default: OS-assigned)"),
```
Add after `workerPort`:
```js
swarmId: z.string().optional().describe("Swarm ID for this instance (overrides SWARM_ID env var)"),
```
- Same `z.string().optional()` form as other optional string params.
- Destructure `swarmId` in the handler signature alongside `{ role, task, workerPort }`.

---

#### INSERTION B — Use `swarmId` param in body construction and start conditional polling (lines 109–149)

**Existing `INSTANCE_ID` / body pattern** (lines 129–135):
```js
const body = {
  role: role || ROLE,
  task: task || "idle",
  cwd: process.cwd(),
  callback_url: callbackUrl,
};
if (INSTANCE_ID) body.id = INSTANCE_ID;
```
Replace/extend to honour D-02 (param takes priority over env):
```js
const resolvedId = swarmId || INSTANCE_ID;   // param wins
if (resolvedId) body.id = resolvedId;
```

**Existing `startWorkerServer` return value** (lines 115–117):
```js
const result = await startWorkerServer(portArg);
boundPort = result.port;
```
The `result` object also exposes `result.server` — save it for cleanup:
```js
let httpServer;
// inside the try block:
const result = await startWorkerServer(portArg);
boundPort  = result.port;
httpServer = result.server;
```

**Conditional polling — after the hub POST** (after line 140, before `return`):

Pattern to follow for stdout output (line 356):
```js
process.stdout.write(`[worker-push] ${body}\n`);
```
Poll output must mirror this exactly but with `[worker-poll]` prefix (D-06):
```js
// D-04: only start polling if no callback_url was registered
let pollInterval;
if (!callbackUrl) {
  pollInterval = setInterval(async () => {
    try {
      const msgs = await hubFetch(`/messages/${resolvedId}?unread=true`);
      if (msgs.messages && msgs.messages.length > 0) {
        process.stdout.write(`[worker-poll] ${JSON.stringify(msgs.messages)}\n`);
      }
    } catch {
      // D-11: silent skip on network error
    }
  }, 10_000); // D-05: 10 s interval
}
```
Note: in the current code `callbackUrl` is always set (it equals `http://${WORKER_HOST}:${boundPort}`), so the poll branch is a fallback that only fires if `startWorkerServer` is skipped or `callbackUrl` is deliberately left empty in a future refactor. The variable must still be declared at handler scope so `cleanup` can reference it.

---

#### INSERTION C — Declare `cleanup` function and attach `process.stdin.on('close')` (after line 396)

**Existing tail of file** (lines 393–397):
```js
// ── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
```

`httpServer` and `pollInterval` must be in a scope accessible to `cleanup`. Because the handler is an async closure, the cleanest approach is to hoist them to module scope as `let` variables (declared before the `server.tool(...)` call for `swarm_register`):

```js
// ── Module-level lifecycle state ─────────────────────────────────────────────
let httpServer;      // set by swarm_register handler
let pollInterval;    // set by swarm_register handler (polling fallback only)
```

Then after `await server.connect(transport)`:
```js
// ── Shutdown detection (D-08, D-09) ─────────────────────────────────────────
function cleanup() {
  clearInterval(pollInterval);   // no-op if undefined
  if (httpServer) httpServer.close();
}

process.stdin.on('close', cleanup);
```
- `clearInterval(undefined)` is safe in Node.js (no-op).
- `httpServer.close()` stops accepting new connections; in-flight requests complete normally, then Node exits.
- No hub DELETE call (D-10).

---

### `skills/codestra-start-worker/SKILL.md` — two targeted changes

#### Analog: itself.

**Existing frontmatter** (lines 1–6):
```yaml
---
name: codestra-start-worker
description: Registra questa istanza Claude Code come worker nel Swarm Hub Codestra. Specificare l'indirizzo IP e la porta dell'hub. Il worker-port è opzionale (sarà utilizzato nella Fase 2 per comunicazione push bidirezionale).
argument-hint: [hub-ip] [hub-port] [worker-port?]
disable-model-invocation: true
---
```
Change 1 — update `argument-hint` (line 4):
```yaml
argument-hint: [hub-ip] [hub-port] [worker-port?] [swarm-id?]
```

**Existing param list** (lines 13–15):
```
- Hub IP (`$0`): ...
- Hub Port (`$1`): ...
- Worker Port (`$2`): opzionale — porta per il server HTTP del worker. Se fornito, passare come `workerPort` al tool `swarm_register`. Se omesso, l'OS assegna automaticamente una porta libera.
```
Change 2 — add `$3` entry after the `$2` block:
```
- Swarm ID (`$3`): opzionale — ID univoco da assegnare a questo worker. Se fornito, passare come `swarmId` al tool `swarm_register`. Se omesso, il MCP server usa `SWARM_ID` dall'env (se configurata).
```

**Existing `swarm_register` invocation instructions** (lines 42–45):
```
1. Usa il tool `swarm_register` con:
   - `role`: `"worker"` ...
   - `task`: ...
   - `workerPort`: se `$2` è fornito, passare il suo valore numerico; altrimenti omettere
```
Change 3 — add `swarmId` line after `workerPort`:
```
   - `swarmId`: se `$3` è fornito, passare il suo valore stringa; altrimenti omettere (il server usa l'env var)
```

---

## Shared Patterns

### Optional tool parameter registration
**Source:** `servers/mcp-server.mjs` lines 105–107
**Apply to:** `swarmId` param addition in `swarm_register`
```js
paramName: z.string().optional().describe("..."),
```

### Stdout write for push/poll messages
**Source:** `servers/mcp-server.mjs` line 356
**Apply to:** poll interval callback output
```js
process.stdout.write(`[worker-push] ${body}\n`);
// mirror as:
process.stdout.write(`[worker-poll] ${JSON.stringify(msgs.messages)}\n`);
```

### Hub POST body construction with conditional `id` field
**Source:** `servers/mcp-server.mjs` lines 129–135
**Apply to:** `swarmId` override logic (D-02)
```js
if (INSTANCE_ID) body.id = INSTANCE_ID;
// replace with:
const resolvedId = swarmId || INSTANCE_ID;
if (resolvedId) body.id = resolvedId;
```

### `startWorkerServer` return value
**Source:** `servers/mcp-server.mjs` lines 375–391
```js
// returns Promise<{server: http.Server, port: number}>
const result = await startWorkerServer(portArg);
// result.server → http.Server instance (use for httpServer.close())
// result.port   → actual bound port
```

---

## No Analog Found

None. Both files are fully present and provide all pattern context needed.

---

## Metadata

**Analog search scope:** `servers/`, `skills/codestra-start-worker/`
**Files scanned:** 2 (mcp-server.mjs 397 lines, SKILL.md 56 lines)
**Pattern extraction date:** 2026-04-26
