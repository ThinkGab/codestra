# Phase 6: Hub File Routes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 06-hub-file-routes
**Areas discussed:** Overwrite behavior, mimeType source, Content format GET, readRawBody error API

---

## Overwrite behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Sostituisce | Elimina vecchio UUID entry, crea nuovo UUID. Filename univoco nel swarm. | ✓ |
| 409 Conflict | Rifiuta il secondo PUT. Worker deve DELETE prima di re-uploadare. | |
| Accumula (multi-version) | Crea nuovo UUID accanto al vecchio. Apre versioning futuro. | |

**User's choice:** Sostituisce silenziosamente
**Notes:** Semantica file naturale. Coerente con il fatto che overwrite history è in Future Requirements.

---

## mimeType source

| Option | Description | Selected |
|--------|-------------|----------|
| Content-Type header | Usa req.headers['content-type'], default 'application/octet-stream'. | ✓ |
| Sempre text/plain | Hub ignora il header, memorizza sempre 'text/plain'. | |
| Query param ?mimeType= | Client passa mimeType esplicito nell'URL. | |

**User's choice:** Content-Type header del client request
**Notes:** Hub resta agnostico al tipo di contenuto — decide il client.

---

## Content format GET

| Option | Description | Selected |
|--------|-------------|----------|
| Stringa UTF-8 | Buffer.toString('utf8') prima di JSON.stringify. Curl-friendly. | ✓ |
| Base64 | encode in base64. Binary-safe, future-proof. | |
| Claude's discretion | Lascia decidere all'agente. | |

**User's choice:** Stringa UTF-8
**Notes:** Coerente con vincolo text-only di v1.2 al livello MCP (Phase 7).

---

## readRawBody error API

| Option | Description | Selected |
|--------|-------------|----------|
| Claude's discretion | throw con codice riconoscibile; PUT handler invia 413. | ✓ |
| Ritorna null | readRawBody ritorna null su overflow. | |
| Throw typed error | Throw con class custom TooLargeError esplicita. | |

**User's choice:** Claude's discretion
**Notes:** Pattern naturale atteso: throw + catch nel PUT handler.

---

## Claude's Discretion

- Meccanismo interno 413 in readRawBody
- Default max_bytes per paginazione GET file

## Deferred Ideas

- Binary upload (two-step protocol)
- TTL automatico file in-memory
- Namespace isolation enforcement
- File overwrite history / versioning
