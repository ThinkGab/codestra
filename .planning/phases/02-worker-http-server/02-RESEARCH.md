# Phase 2: Worker HTTP Server - Research

**Researched:** 2026-04-19
**Domain:** Node.js `node:http` in-process server, porta 0 OS-assigned, integrazione con MCP server stdio
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Il server HTTP del worker si avvia inside `swarm_register` — automaticamente, in-process con `mcp-server.mjs`. Nessun tool separato.
- **D-02:** `swarm_register` avvia prima il server HTTP, ottiene la porta assegnata (porta 0 → OS assegna porta reale), poi fa POST a hub con `callback_url` incluso nel body.
- **D-03:** L'host del `callback_url` è letto da `SWARM_HOST` env var. Default `localhost` se non configurata.
- **D-04:** `callback_url` formato: `http://${SWARM_HOST ?? 'localhost'}:${boundPort}`
- **D-05:** Quando l'hub fa POST al worker HTTP server, il server stampa il messaggio su stdout del processo `mcp-server.mjs`. Nessuna notifica attiva.
- **D-06:** Endpoint worker: `POST /` — riceve payload, stampa, risponde `200 OK`.
- **D-07:** Il server HTTP del worker è in-process con `mcp-server.mjs` — nasce e muore con il processo MCP.
- **D-08:** Porta di default: `0` (OS-assigned). Se `$2` è fornito nel comando `/codestra:codestra-start-worker`, usare quella porta.
- **D-09:** Autenticazione via `SWARM_SECRET` se presente (stessa logica dell'hub), oppure no-auth.
- Nessuna dipendenza esterna — usare `node:http` built-in.
- Node.js ESM only, nessun TypeScript.

### Claude's Discretion

- Gestione errori se il server non riesce a bindare la porta (porta occupata, es. `$2` specificato ma già in uso).
- Health check endpoint sul worker server (`GET /health`).

### Deferred Ideas (OUT OF SCOPE)

- TLS sul worker server
- WebSocket push
- Kill remoto del worker server tramite hub
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORKER-01 | Worker avvia un HTTP server locale al momento dell'esecuzione di `/codestra-start-worker` | Pattern porta 0 verificato: `server.listen(0, host, callback)` — il server parte dentro `swarm_register` già invocato da SKILL.md |
| WORKER-02 | Worker porta è configurabile — default porta assegnata dall'OS (port 0), opzione porta custom | `server.listen(port ?? 0, ...)` dove `port` viene dal parametro `$2` del SKILL.md già documentato come `worker-port` |
| WORKER-03 | Worker comunica la propria `callback_url` all'hub durante la registrazione | `callback_url` aggiunto al body del POST `/workers` esistente — no breaking change sull'hub |
</phase_requirements>

---

## Summary

La fase 2 consiste in una modifica chirurgica a `servers/mcp-server.mjs`: aggiungere un server HTTP `node:http` in-process che parte dentro `swarm_register`, aspetta il bind (evento `listening`), ricava la porta effettiva con `server.address().port`, costruisce `callback_url`, e la include nel corpo del POST di registrazione all'hub.

Tutto il pattern necessario esiste già nel codebase: `hub.mjs` usa già `server.listen(PORT, HOST, callback)` e legge `SWARM_HOST`/`SWARM_SECRET` da env var. Il worker riutilizza gli stessi idiomi con porta 0 invece di una porta fissa.

Il server worker non richiede un router completo: un singolo handler `POST /` per i messaggi push, un `GET /health` opzionale, e reject di tutto il resto con `404`. L'autenticazione replica la funzione `authorize()` già presente in `hub.mjs`.

**Raccomandazione primaria:** Estrarre la logica di avvio server in una funzione `startWorkerServer(port)` che ritorna una Promise con `{ server, port }` — chiamarla all'inizio di `swarm_register` e attendere prima del POST all'hub.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Avvio HTTP server worker | MCP Server process | — | In-process con mcp-server.mjs, D-07 |
| Binding porta OS-assigned | OS / Node.js runtime | — | `listen(0)` delega al kernel |
| Costruzione `callback_url` | MCP Server process | — | Legge `SWARM_HOST` env + porta bound, D-03/D-04 |
| Ricezione push dall'hub | Worker HTTP server (in-process) | — | `POST /` handler, D-06 |
| Stampa push su stdout | Worker HTTP server handler | — | `process.stdout.write(...)`, D-05 |
| Auth richieste in arrivo | Worker HTTP server handler | — | Stessa logica `SWARM_SECRET` dell'hub, D-09 |
| Comunicazione `callback_url` all'hub | `swarm_register` tool | Hub `POST /workers` | Campo aggiuntivo nel body, backward-compatible |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:http` | built-in (Node 20.20.1) | HTTP server in-process | Già usato in hub.mjs, zero dipendenze aggiuntive, D-decision locked |

### Supporting

Nessuna dipendenza aggiuntiva necessaria. `node:http`, `node:crypto` (già importato in hub.mjs se necessario per ID), e le env var già presenti in mcp-server.mjs sono sufficienti.

**Dipendenze già presenti in mcp-server.mjs:**
- `@modelcontextprotocol/sdk` — già in uso, non toccare
- `zod` — già in uso per la validazione parametri tool
- `node:http` — da aggiungere come import ESM

**Installation:** nessuna — `node:http` è built-in.

**Version verification:** Node.js 20.20.1 verificato sul sistema. [VERIFIED: `node --version` eseguito]

---

## Architecture Patterns

### System Architecture Diagram

```
/codestra:codestra-start-worker $0 $1 $2
        │
        ▼
  SKILL.md handler
  (legge $0=hub-ip, $1=hub-port, $2=worker-port?)
        │
        ▼
  swarm_register tool (mcp-server.mjs)
        │
        ├─── 1. startWorkerServer(workerPort ?? 0)
        │           │
        │           ▼
        │    http.createServer(handler)
        │    .listen(port, host, () => resolve({server, port}))
        │           │
        │           ▼ OS assegna porta reale
        │    boundPort = server.address().port
        │
        ├─── 2. callback_url = `http://${SWARM_HOST ?? 'localhost'}:${boundPort}`
        │
        ├─── 3. POST /workers → Hub
        │    body: { role, task, cwd, id?, callback_url }
        │           │
        │           ▼ (Fase 3 usa callback_url; ora lo ignora)
        │         Hub salva worker record
        │
        └─── 4. return risultato a Claude (worker ID + callback_url)

Push in arrivo (Fase 3):
  Hub → POST http://localhost:{boundPort}/
           │
           ▼
    handler: legge body, process.stdout.write(payload), 200 OK
```

### Recommended Project Structure

Nessuna nuova directory. Tutto in `servers/mcp-server.mjs`:

```
servers/
├── mcp-server.mjs    # Modificare: aggiungere import node:http,
│                     # funzione startWorkerServer(), modificare swarm_register
└── hub.mjs           # Invariato (riferimento pattern)
```

### Pattern 1: Avvio server con porta 0 (Promise-wrapped)

**Cosa fa:** Avvia `http.createServer`, bind su porta 0, risolve con porta effettiva quando pronto.
**Quando usare:** All'inizio di `swarm_register`, prima del POST all'hub.

```javascript
// Source: verificato con Node.js 20.20.1 [VERIFIED: test locale]
import http from "node:http";

const WORKER_HOST = process.env.SWARM_HOST ?? "localhost";

function startWorkerServer(port = 0) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(workerHandler);
    srv.listen(port, WORKER_HOST, () => {
      resolve({ server: srv, port: srv.address().port });
    });
    srv.on("error", reject);
  });
}
```

### Pattern 2: Handler POST / con autenticazione

**Cosa fa:** Riceve push dall'hub, autentica con SWARM_SECRET, stampa su stdout, risponde 200.
**Quando usare:** Come requestListener passato a `http.createServer`.

```javascript
// Source: derivato da authorize() in hub.mjs [VERIFIED: codebase grep]
function workerHandler(req, res) {
  // Auth
  if (SECRET) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (token !== SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // GET /health (Claude's Discretion)
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, role: "worker" }));
    return;
  }

  // POST / — ricevi messaggio push, stampa su stdout
  if (req.method === "POST" && req.url === "/") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      process.stdout.write(`[worker-push] ${body}\n`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
}
```

### Pattern 3: Integrazione in swarm_register

**Cosa fa:** Avvia il server prima del POST, aggiunge `callback_url` al body.
**Quando usare:** Sostituisce il corpo attuale di `swarm_register` (righe 105-126 di mcp-server.mjs).

```javascript
// Source: mcp-server.mjs righe 105-126 + estensione [VERIFIED: codebase read]
async ({ role, task, workerPort }) => {
  // 1. Avvia server HTTP worker
  const workerPortArg = workerPort ? Number(workerPort) : 0;
  const { port: boundPort } = await startWorkerServer(workerPortArg);

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

### Anti-Patterns da Evitare

- **Avviare il server dopo il POST all'hub:** race condition — l'hub potrebbe tentare push prima che il server sia pronto. Il server DEVE essere up prima del POST.
- **Usare `server.listen(port)` senza callback:** non c'è garanzia che la porta sia assegnata prima di chiamare `server.address().port`. Usare sempre il callback di `listen`.
- **Leggere `server.address().port` fuori dal callback `listening`:** restituisce `null` se il server non è ancora in ascolto.
- **Porta globale mutabile:** non salvare la porta in una variabile globale modificabile — passarla come closure o parametro.
- **Dimenticare `srv.on('error', reject)`:** senza questo, un `EADDRINUSE` su porta custom ($2) causa un unhandled rejection invece di un errore gestito.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing body HTTP | Parser custom con Buffer | Pattern `chunks.push` + `Buffer.concat` già in hub.mjs | Edge case con chunk splitting — il pattern consolidato gestisce correttamente |
| Router URL | Router custom con regex | Semplice `if (req.method && req.url)` — solo 2 endpoint | Overkill per 2 route; nessuna dipendenza |
| Bearer token auth | Logica custom | Copia esatta di `authorize()` da hub.mjs | Consistenza con il resto del sistema |
| Porta OS-assigned | Retry su porte random | `listen(0)` — il kernel gestisce | Atomic, sicuro, zero collisioni |

**Key insight:** Il server worker ha solo 2 endpoint (`POST /` e `GET /health`). Non serve nessun framework né router — `if/else` su method+url è la soluzione corretta per questa complessità.

---

## Common Pitfalls

### Pitfall 1: `server.address()` restituisce `null`

**Cosa va storto:** Si chiama `server.address().port` prima che il server sia in ascolto — TypeError: Cannot read properties of null.
**Perché accade:** `listen()` è asincrono; `address()` ritorna `null` fino all'evento `listening`.
**Come evitare:** Leggere `server.address().port` SOLO dentro il callback di `listen()` o nell'handler dell'evento `listening`. [VERIFIED: test locale Node 20.20.1]
**Segnali d'allarme:** TypeError a runtime su `server.address().port` durante `swarm_register`.

### Pitfall 2: EADDRINUSE su porta custom ($2)

**Cosa va storto:** L'utente specifica `$2=8080` ma quella porta è già occupata — il server non parte, `swarm_register` fallisce senza messaggio chiaro.
**Perché accade:** `srv.on('error', reject)` non è gestito o l'errore non viene surfaced al tool.
**Come evitare:** Gestire `EADDRINUSE` esplicitamente nella Promise reject, restituire un messaggio leggibile: `"Worker port ${port} already in use. Omit $2 to use OS-assigned port."` [VERIFIED: error code `EADDRINUSE` confermato con test locale]
**Segnali d'allarme:** `swarm_register` hangs o unhandled rejection nei log.

### Pitfall 3: Race condition server non ancora up quando hub fa push

**Cosa va storto:** Il server HTTP viene avviato dopo il POST all'hub — l'hub riceve `callback_url` e tenta subito un push, ma il server non è ancora in ascolto.
**Perché accade:** Ordine sbagliato delle operazioni in `swarm_register`.
**Come evitare:** Sempre: `await startWorkerServer()` → costruisci `callback_url` → poi `POST /workers`. Mai invertire. [ASSUMED — race condition teorica; non testabile senza hub reale, ma l'ordine è architetturalmente corretto]
**Segnali d'allarme:** Push falliti nella Fase 3 con `ECONNREFUSED`.

### Pitfall 4: SWARM_HOST usato come bind address del worker

**Cosa va storto:** `SWARM_HOST` in `hub.mjs` è il bind address dell'hub (default `0.0.0.0`). Se riusato direttamente come bind address del worker, il server worker si lega a `0.0.0.0` — funziona, ma `callback_url` con `0.0.0.0` non è raggiungibile dall'hub.
**Perché accade:** Confusione tra bind address e host pubblico.
**Come evitare:** Usare `SWARM_HOST ?? 'localhost'` come HOST nella `callback_url`, non come bind address. Per il bind del server worker, usare `'0.0.0.0'` o `'localhost'` separatamente se serve. Nella maggior parte dei casi (LAN, stesso host), `localhost` per entrambi è corretto.
**Segnali d'allarme:** `callback_url` = `http://0.0.0.0:PORT` nel record del worker sull'hub.

### Pitfall 5: workerPort come stringa invece di numero

**Cosa va storto:** `$2` dal SKILL.md arriva come stringa. `server.listen("8080", ...)` funziona in Node.js ma è inconsistente. Se il tool zod schema accetta `string`, passarlo a `listen()` direttamente può dare comportamenti inattesi.
**Perché accade:** I parametri degli slash command sono sempre stringhe.
**Come evitare:** `Number(workerPort)` o `parseInt(workerPort, 10)` prima di passare a `listen()`. Validare che sia un numero valido (1-65535) se specificato.

---

## Code Examples

### Esempio completo: startWorkerServer funzione

```javascript
// Source: pattern hub.mjs adattato + verificato [VERIFIED: Node 20.20.1]
import http from "node:http";

const WORKER_HOST = process.env.SWARM_HOST ?? "localhost";
const SECRET = process.env.SWARM_SECRET || "";

function workerRequestHandler(req, res) {
  // Auth check (D-09)
  if (SECRET) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (token !== SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // Health check (Claude's Discretion)
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Push handler (D-05, D-06)
  if (req.method === "POST" && req.url === "/") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      process.stdout.write(`[worker-push] ${body}\n`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
}

/**
 * Avvia il worker HTTP server.
 * @param {number} [port=0] - Porta (0 = OS-assigned)
 * @returns {Promise<{server: http.Server, port: number}>}
 */
function startWorkerServer(port = 0) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(workerRequestHandler);
    srv.listen(port, WORKER_HOST, () => {
      resolve({ server: srv, port: srv.address().port });
    });
    srv.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(
          `Worker port ${port} already in use. Omit the worker-port argument to use an OS-assigned port.`
        ));
      } else {
        reject(err);
      }
    });
  });
}
```

### Modifica a swarm_register (diff concettuale)

```javascript
// Source: mcp-server.mjs righe 98-126 [VERIFIED: codebase read]

// AGGIUNGERE al top del file (dopo gli import esistenti):
import http from "node:http";
const WORKER_HOST = process.env.SWARM_HOST ?? "localhost";

// MODIFICARE la definizione di swarm_register:
server.tool(
  "swarm_register",
  "Register this Claude Code instance with the hub...",
  {
    role: z.enum(["leader", "worker"]).optional(),
    task: z.string().optional(),
    workerPort: z.number().optional().describe("Port for worker HTTP server (default: OS-assigned)"),
  },
  async ({ role, task, workerPort }) => {
    // NUOVO: avvia server HTTP worker prima del POST
    const { port: boundPort } = await startWorkerServer(workerPort ?? 0);
    const callbackUrl = `http://${WORKER_HOST}:${boundPort}`;

    const body = {
      role: role || ROLE,
      task: task || "idle",
      cwd: process.cwd(),
      callback_url: callbackUrl,  // NUOVO campo
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
);
```

### Aggiornamento SKILL.md codestra-start-worker (sezione $2)

```markdown
<!-- Sostituire la nota "Ignorare per ora" con istruzioni operative reali -->
- Worker Port (`$2`): opzionale — porta per il server HTTP del worker. Se omesso, il sistema usa una porta assegnata automaticamente dall'OS.

<!-- Passare $2 a swarm_register come workerPort -->
Usa il tool `swarm_register` con:
- `role`: "worker"
- `task`: descrizione del lavoro
- `workerPort`: valore numerico di `$2` (se fornito)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Worker solo polling (GET /messages) | Worker con HTTP push receiver | Fase 2 | Elimina polling; hub può pushare direttamente |
| swarm_register senza callback_url | swarm_register con callback_url nel body | Fase 2 | Hub già lo accetta (campo extra ignorato) |
| SKILL.md nota "worker-port sarà usato in Fase 2" | SKILL.md rimuove la nota e attiva workerPort | Fase 2 | SKILL.md va aggiornato |

**Da deprecare/aggiornare:**
- Riga 15 di `codestra-start-worker/SKILL.md`: "Ignorare per ora se fornito" → sostituire con istruzioni operative reali per `$2`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Il hub `POST /workers` ignora silenziosamente campi extra come `callback_url` senza errori (Fase 3 lo usa, Fase 2 lo include ma l'hub non lo processa) | Integration Points | Basso — hub.mjs letto: costruisce worker object con campi noti, ignora il resto |
| A2 | Race condition server/push è teoricamente possibile se hub fa push immediatamente dopo registrazione | Pitfall 3 | Basso — Fase 3 non esiste ancora; quando implementata, l'ordine `await startWorkerServer()` prima del POST previene il problema |
| A3 | `SWARM_HOST` è adatto come host nella `callback_url` del worker (stesso host su cui il worker è raggiungibile dall'hub) | D-03/D-04 | Medio — in setup multi-host il worker potrebbe essere su un IP diverso da SWARM_HOST; per v1.0 LAN use case è corretto |

---

## Open Questions

1. **workerPort come parametro del tool vs env var**
   - Cosa sappiamo: D-08 dice che `$2` overrida la porta; `swarm_register` accetta già parametri opzionali via zod.
   - Cosa non è chiaro: se `workerPort` debba essere parametro dello schema zod di `swarm_register` (da passare esplicitamente) oppure letto da una env var `SWARM_PORT` analoga a `SWARM_HUB_URL`.
   - Raccomandazione: aggiungere `workerPort` allo schema zod — coerente con come gli altri parametri (`role`, `task`) sono gestiti nel tool. Il SKILL.md lo passa come argomento esplicito.

2. **Aggiornamento SKILL.md per $2**
   - Cosa sappiamo: SKILL.md attuale dice "Ignorare per ora se fornito" per `$2`.
   - Cosa non è chiaro: se aggiornare SKILL.md è dentro scope di questa fase o separato.
   - Raccomandazione: includerlo come task di questa fase — senza aggiornamento il `$2` non viene mai passato a `swarm_register`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `node:http` server | ✓ | v20.20.1 | — |
| `node:http` | Worker HTTP server | ✓ | built-in | — |
| `SWARM_HOST` env var | callback_url host | opzionale | — | default `localhost` |
| `SWARM_SECRET` env var | Auth worker server | opzionale | — | no-auth (D-09) |

[VERIFIED: `node --version` → v20.20.1 eseguito sul sistema target]

---

## Validation Architecture

> `config.json` non trovato — sezione inclusa con validazione manuale.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Nessuno (progetto Node.js ESM puro, no test framework configurato) |
| Config file | nessuno |
| Quick run command | `node -e "<inline test>"` |
| Full suite command | verifica manuale via curl + MCP tool invocation |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WORKER-01 | Server HTTP parte quando `swarm_register` è invocato | smoke | `node -e "import('./servers/mcp-server.mjs')"` (verifica avvio senza crash) | ❌ Wave 0 |
| WORKER-02 | Porta 0 → OS assegna porta reale; $2 overrida | unit | `node -e "/* test startWorkerServer(0) e startWorkerServer(9876) */"` | ❌ Wave 0 |
| WORKER-03 | callback_url inclusa nel body del POST /workers | integration | curl mock o intercettazione fetch | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node -e "const h=require('node:http'); const s=h.createServer(()=>{}); s.listen(0,'localhost',()=>{console.log('port:',s.address().port);s.close();})"` — verifica bind porta 0
- **Per wave merge:** verifica manuale: avvia hub, invoca `swarm_register`, controlla che `callback_url` compaia nel record worker
- **Phase gate:** `swarm_register` completa senza errori + worker record contiene `callback_url` valida

### Wave 0 Gaps

- [ ] Test inline per `startWorkerServer(0)` — verifica porta OS-assigned
- [ ] Test inline per `startWorkerServer(9876)` — verifica porta custom
- [ ] Test inline per EADDRINUSE — verifica messaggio errore leggibile
- [ ] Verifica end-to-end: hub up → swarm_register → GET /workers → callback_url presente

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — nessun login utente |
| V3 Session Management | no | n/a |
| V4 Access Control | parziale | Bearer token `SWARM_SECRET` — stesso pattern hub |
| V5 Input Validation | yes | Validazione `workerPort` (1-65535, numero intero) |
| V6 Cryptography | no | Token non è crittografato — segreto condiviso in chiaro su LAN (by design per v1.0) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Push non autorizzato al worker (injection di comandi tramite payload) | Tampering | `SWARM_SECRET` bearer token check; payload stampato su stdout (non eseguito) |
| Port scanning del worker (scoperta porta) | Information Disclosure | Accettato per v1.0 LAN use case; porta effimera OS-assigned aumenta oscurità |
| Forged callback_url nell'hub (Fase 3) | Spoofing | Fuori scope Fase 2 — sarà problema della Fase 3 |

---

## Sources

### Primary (HIGH confidence)

- `servers/hub.mjs` (codebase) — pattern `server.listen(PORT, HOST, callback)`, `authorize()`, `readBody()`, gestione env var — letto e verificato [VERIFIED: codebase read]
- `servers/mcp-server.mjs` (codebase) — struttura `swarm_register`, `hubFetch`, env var disponibili — letto e verificato [VERIFIED: codebase read]
- Node.js 20.20.1 `node:http` — `server.listen(0)`, `server.address()`, eventi `listening`/`error` — [VERIFIED: test eseguiti localmente]

### Secondary (MEDIUM confidence)

- `.planning/phases/02-worker-http-server/02-CONTEXT.md` — decisioni locked D-01..D-09 — letto [VERIFIED]
- `.planning/REQUIREMENTS.md` — WORKER-01..03 — letto [VERIFIED]
- `skills/codestra-start-worker/SKILL.md` — parametro `$2` già documentato come `worker-port` — letto [VERIFIED]

### Tertiary (LOW confidence)

Nessuna fonte di bassa confidenza utilizzata in questo research.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `node:http` built-in verificato sul sistema, pattern già in codebase
- Architecture: HIGH — codebase completo letto, pattern derivati direttamente da hub.mjs
- Pitfalls: HIGH — testati localmente (EADDRINUSE, server.address() null, port-0 binding)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stack stabile — Node.js built-in, nessuna dipendenza esterna)
