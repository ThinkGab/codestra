# Phase 2: Worker HTTP Server - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 2 (1 modify major, 1 modify minor)
**Analogs found:** 2 / 2

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `servers/mcp-server.mjs` | service + server | request-response (in-process HTTP) | `servers/hub.mjs` | exact — stesso stack node:http, stesse env var, stesso pattern porta 0 |
| `skills/codestra-start-worker/SKILL.md` | config / prompt | — | `skills/codestra-start-worker/SKILL.md` (self) | self — modifica testo esistente |

---

## Pattern Assignments

### `servers/mcp-server.mjs` (service + in-process HTTP server)

**Analog primario:** `servers/hub.mjs`
**Sezioni da modificare:** import block (top), costanti env (righe 20-23), body `swarm_register` (righe 105-126), aggiungere funzioni `startWorkerServer` e `workerHandler` prima del blocco `// ── Start`.

---

**Import pattern da aggiungere** (analogo a `hub.mjs` righe 17-18):
```javascript
import http from "node:http";
```
Aggiungere dopo la riga 18 di `mcp-server.mjs` (`import { z } from "zod";`).

---

**Costanti env da aggiungere** (analogo a `hub.mjs` righe 21-22):
```javascript
// hub.mjs righe 21-22 — stesso pattern, adattato per worker
const HOST = process.env.SWARM_HOST || "0.0.0.0";
const SECRET = process.env.SWARM_SECRET || "";
```
In `mcp-server.mjs` aggiungere dopo la riga 23 (`const INSTANCE_ID = ...`):
```javascript
const WORKER_HOST = process.env.SWARM_HOST ?? "localhost";
// SECRET è già letto da SWARM_SECRET a riga 22 — nessuna duplicazione
```

---

**Handler workerHandler** (analogo a `hub.mjs` righe 58-64 `authorize()` + righe 188-203 request handler):
```javascript
// Pattern auth: hub.mjs righe 58-64
function authorize(req, res) {
  if (!SECRET) return true;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token === SECRET) return true;
  json(res, 401, { error: "Unauthorized — set SWARM_SECRET" });
  return false;
}

// Pattern readBody: hub.mjs righe 43-56
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}
```
Per il worker, `workerHandler` è più semplice (no router): solo `POST /` + `GET /health` + 404 fallback — copiare il pattern auth da `authorize()`, il pattern body da `readBody()`, ma non usare il `routes` object-router (overkill per 2 endpoint).

---

**startWorkerServer — Promise-wrapped listen(0)** (analogo a `hub.mjs` righe 205-209):
```javascript
// hub.mjs riga 205 — pattern di riferimento:
server.listen(PORT, HOST, () => {
  console.log(`...listening on http://${HOST}:${PORT}`);
});

// Adattamento per worker (Promise + porta 0):
function startWorkerServer(port = 0) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(workerHandler);
    srv.listen(port, WORKER_HOST, () => {
      resolve({ server: srv, port: srv.address().port });
    });
    srv.on("error", reject);  // cattura EADDRINUSE se $2 è occupata
  });
}
```

---

**Modifica swarm_register** (righe 98-126 di `mcp-server.mjs`):

Stato attuale (righe 102-104) — schema Zod del tool:
```javascript
{
  role: z.enum(["leader", "worker"]).optional().describe("..."),
  task: z.string().optional().describe("..."),
}
```
Aggiungere parametro `workerPort`:
```javascript
{
  role: z.enum(["leader", "worker"]).optional().describe("Role of this instance (default from env)"),
  task: z.string().optional().describe("Brief description of what this instance is working on"),
  workerPort: z.number().optional().describe("Port for the worker HTTP server (default: OS-assigned)"),
}
```

Stato attuale body handler (righe 105-126):
```javascript
async ({ role, task }) => {
  const body = {
    role: role || ROLE,
    task: task || "idle",
    cwd: process.cwd(),
  };
  if (INSTANCE_ID) body.id = INSTANCE_ID;

  const data = await hubFetch("/workers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    content: [{
      type: "text",
      text: `Registered as ${data.worker?.role} with ID: ${data.worker?.id}\n\n${JSON.stringify(data.worker, null, 2)}`,
    }],
  };
}
```
Versione modificata (pattern da RESEARCH.md Pattern 3, righe 224-252):
```javascript
async ({ role, task, workerPort }) => {
  // 1. Avvia server HTTP worker (server DEVE essere up prima del POST)
  const portArg = workerPort ? Number(workerPort) : 0;
  let boundPort;
  try {
    const result = await startWorkerServer(portArg);
    boundPort = result.port;
  } catch (err) {
    const msg = err.code === "EADDRINUSE"
      ? `Worker port ${portArg} already in use. Omit workerPort to use OS-assigned port.`
      : `Failed to start worker HTTP server: ${err.message}`;
    return { content: [{ type: "text", text: msg }], isError: true };
  }

  // 2. Costruisci callback_url
  const callbackUrl = `http://${WORKER_HOST}:${boundPort}`;

  // 3. POST all'hub con callback_url
  const body = {
    role: role || ROLE,
    task: task || "idle",
    cwd: process.cwd(),
    callback_url: callbackUrl,
  };
  if (INSTANCE_ID) body.id = INSTANCE_ID;

  const data = await hubFetch("/workers", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    content: [{
      type: "text",
      text: `Registered as ${data.worker?.role} with ID: ${data.worker?.id}\ncallback_url: ${callbackUrl}\n\n${JSON.stringify(data.worker, null, 2)}`,
    }],
  };
}
```

---

**Error handling pattern** (analogo a `hub.mjs` righe 198-202):
```javascript
// hub.mjs — try/catch nel server handler
try {
  await route.handler(req, res, route.params);
} catch (err) {
  json(res, 500, { error: err.message });
}
```
Nel `workerHandler`, wrappare l'handler `POST /` nella stessa struttura. Errori di avvio server: surfacearli come `isError: true` nel return del tool (vedi sopra).

---

**json() helper** (analogo a `hub.mjs` righe 34-41):
```javascript
// hub.mjs righe 34-41 — usare la stessa firma
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
```
Aggiungere questa funzione helper in `mcp-server.mjs` per uso in `workerHandler`.

---

### `skills/codestra-start-worker/SKILL.md` (config / prompt, modifica testo)

**Analog:** self — modifica chirurgica di 2 sezioni esistenti.

**Riga 15 attuale** (da modificare):
```
- Worker Port (`$2`): opzionale — porta per il server HTTP del worker (Fase 2). Ignorare per ora se fornito.
```
**Riga 15 nuova:**
```
- Worker Port (`$2`): opzionale — porta per il server HTTP del worker. Se fornito, passare come `workerPort` al tool `swarm_register`.
```

**Righe 42-45 attuali** (istruzioni operative — da aggiornare):
```
1. Usa il tool `swarm_register` con:
   - `role`: `"worker"` (oppure ometti se `SWARM_ROLE` è già configurata nell'env)
   - `task`: breve descrizione del lavoro che questo worker svolgerà (chiedere all'utente se non noto)
```
**Versione aggiornata:**
```
1. Usa il tool `swarm_register` con:
   - `role`: `"worker"` (oppure ometti se `SWARM_ROLE` è già configurata nell'env)
   - `task`: breve descrizione del lavoro che questo worker svolgerà (chiedere all'utente se non noto)
   - `workerPort`: se `$2` è fornito, passare il suo valore numerico; altrimenti omettere (l'OS assegnerà la porta)
```

**Righe 52-54 attuali** (output — da aggiornare):
```
- Conferma che il worker è ora registrato e in ascolto di task
- Nota: il parametro worker-port (`$2`) sarà attivo nella Fase 2 (Worker HTTP Server)
```
**Versione aggiornata:**
```
- Conferma che il worker è ora registrato e in ascolto di task
- La `callback_url` del worker HTTP server (restituita da `swarm_register`)
```

---

## Shared Patterns

### Auth (Bearer token da SWARM_SECRET)
**Source:** `servers/hub.mjs` righe 58-64
**Apply to:** `workerHandler` in `mcp-server.mjs`
```javascript
function authorize(req, res) {
  if (!SECRET) return true;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token === SECRET) return true;
  json(res, 401, { error: "Unauthorized — set SWARM_SECRET" });
  return false;
}
```
Nota: `SECRET` è già definita in `mcp-server.mjs` alla riga 22 — nessuna nuova variabile necessaria.

### Body reading (chunks pattern)
**Source:** `servers/hub.mjs` righe 43-56
**Apply to:** handler `POST /` in `workerHandler`
```javascript
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}
```

### JSON response helper
**Source:** `servers/hub.mjs` righe 34-41
**Apply to:** `workerHandler` — `GET /health`, `POST /`, errori 401/404
```javascript
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
```

### Tool error return pattern
**Source:** `servers/mcp-server.mjs` righe 87-91 (`swarm_hub_status`)
**Apply to:** gestione errori `startWorkerServer` in `swarm_register`
```javascript
return {
  content: [{ type: "text", text: `Hub not reachable at ${HUB_URL}: ${err.message}` }],
  isError: true,
};
```

---

## No Analog Found

Nessun file senza analog. Entrambi i file da modificare hanno pattern di riferimento diretti nel codebase.

---

## Metadata

**Analog search scope:** `servers/` (hub.mjs, mcp-server.mjs), `skills/codestra-start-worker/`
**Files scanned:** 3
**Pattern extraction date:** 2026-04-19
