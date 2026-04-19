---
phase: 02-worker-http-server
reviewed: 2026-04-19T12:44:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - servers/mcp-server.mjs
  - skills/codestra-start-worker/SKILL.md
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-04-19T12:44:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Revisione delle modifiche di Fase 2: server HTTP worker in-process (`startWorkerServer`, `workerRequestHandler`, `json`) e aggiornamento del tool `swarm_register` con invio di `callback_url` all'hub. Il codice implementa correttamente il pattern di porta OS-assigned e il controllo auth Bearer. Sono stati rilevati un problema critico (corruzione del canale stdio MCP), tre warning (errori non gestiti, hubFetch senza controllo status), e due info (ridondanza e interpolazione shell nel SKILL.md).

---

## Critical Issues

### CR-01: `process.stdout.write` in `workerRequestHandler` corrompe il canale MCP

**File:** `servers/mcp-server.mjs:355`
**Issue:** Il server MCP usa il trasporto stdio (`StdioServerTransport`). L'SDK MCP legge e scrive su `stdout` con il protocollo JSON-RPC framing. Chiamare `process.stdout.write(...)` direttamente da dentro il request handler inietta testo non strutturato nel flusso, corrompendo ogni frame MCP successivo e rendendo il server inutilizzabile dopo il primo messaggio push ricevuto.
**Fix:** Redirigere il logging su `stderr` (che è separato dal canale MCP) oppure su un file di log:
```js
// Sostituire riga 355:
process.stderr.write(`[worker-push] ${body}\n`);
```

---

## Warnings

### WR-01: `hubFetch` non controlla lo status HTTP — errori 4xx/5xx silenti

**File:** `servers/mcp-server.mjs:33-35`
**Issue:** `res.json()` viene chiamato incondizionatamente indipendentemente dallo status HTTP. Se l'hub risponde con 4xx o 5xx, il corpo viene parsato come JSON valido ma contiene un oggetto errore — nessuna eccezione viene lanciata. I chiamanti accedono poi a campi come `data.worker?.id` (riga 144) che risultano `undefined` senza alcun messaggio di errore utile.
**Fix:**
```js
async function hubFetch(path, options = {}) {
  const url = `${HUB_URL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hub ${path} responded ${res.status}: ${text}`);
  }
  return res.json();
}
```

### WR-02: `swarm_register` non gestisce errori di `hubFetch` — crash non controllato

**File:** `servers/mcp-server.mjs:136-148`
**Issue:** La chiamata `hubFetch("/workers", { method: "POST", ... })` a riga 136 non è racchiusa in un try/catch. Se l'hub non è raggiungibile, risponde con un errore, o la connessione viene interrotta, l'eccezione non gestita propaga fuori dal handler del tool MCP. Il server non restituisce `isError: true` al modello e il comportamento dipende dall'SDK (probabile crash del processo o risposta MCP malformata).
**Fix:**
```js
let data;
try {
  data = await hubFetch("/workers", {
    method: "POST",
    body: JSON.stringify(body),
  });
} catch (err) {
  return {
    content: [{ type: "text", text: `Registration failed: ${err.message}` }],
    isError: true,
  };
}
return {
  content: [
    {
      type: "text",
      text: `Registered as ${data.worker?.role} with ID: ${data.worker?.id}\ncallback_url: ${callbackUrl}\n\n${JSON.stringify(data.worker, null, 2)}`,
    },
  ],
};
```

### WR-03: `startWorkerServer` — pattern Promise fragile senza flag `settled`

**File:** `servers/mcp-server.mjs:374-390`
**Issue:** Il listener `srv.on("error", ...)` viene registrato dopo `srv.listen(...)`. In Node.js, se l'evento `error` scatta in modo sincrono durante `listen` (raro ma possibile su alcune piattaforme con porte privilegiate), il listener potrebbe non essere ancora attaccato, causando un `UnhandledPromiseRejection` invece di un `reject` controllato. Inoltre, non c'è un flag `settled` per prevenire doppia risoluzione in caso di comportamenti imprevisti.
**Fix:** Registrare il listener `error` prima di chiamare `listen`:
```js
function startWorkerServer(port = 0) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(workerRequestHandler);
    let settled = false;
    srv.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (err.code === "EADDRINUSE") {
        reject(new Error(
          `Worker port ${port} already in use. Omit workerPort to use an OS-assigned port.`
        ));
      } else {
        reject(err);
      }
    });
    srv.listen(port, WORKER_HOST, () => {
      if (settled) return;
      settled = true;
      resolve({ server: srv, port: srv.address().port });
    });
  });
}
```

---

## Info

### IN-01: `Number(workerPort)` ridondante — `workerPort` è già tipizzato `z.number()`

**File:** `servers/mcp-server.mjs:112`
**Issue:** `const portArg = workerPort ? Number(workerPort) : 0;` — Zod garantisce che `workerPort` sia già un `number` o `undefined`. Il cast `Number(...)` è un no-op che aggiunge confusione sul tipo atteso.
**Fix:**
```js
const portArg = workerPort ?? 0;
```

### IN-02: Interpolazione shell `${1:-7800}` non espansa in SKILL.md

**File:** `skills/codestra-start-worker/SKILL.md:21,53`
**Issue:** La sintassi `${1:-7800}` è valida in bash ma non viene interpolata quando il file viene usato come prompt per un modello LLM. Il modello riceverà letteralmente la stringa `${1:-7800}` invece del valore di default atteso. Stessa issue alla riga 53 con `${1:-7800}`.
**Fix:** Sostituire con prosa esplicita:
```markdown
// Riga 21 — da:
punti a `http://$0:${1:-7800}`
// a:
punti a `http://$0:$1` (porta default `7800` se `$1` non specificato)

// Riga 53 — da:
URL dell'hub a cui è connesso: `http://$0:${1:-7800}`
// a:
URL dell'hub a cui è connesso: `http://$0:$1` (default porta `7800`)
```

---

_Reviewed: 2026-04-19T12:44:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
