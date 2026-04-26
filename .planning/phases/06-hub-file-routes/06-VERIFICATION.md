---
phase: 06-hub-file-routes
verified: 2026-04-26T19:58:30Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 6: Hub File Routes — Verification Report

**Phase Goal:** The hub stores and serves files per swarm with no path traversal exposure and enforces a 10 MB upload ceiling
**Verified:** 2026-04-26T19:58:30Z
**Status:** PASSED
**Re-verification:** No — verifica iniziale

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `PUT /files/:swarmId/:filename` con body testo ritorna `{id, filename, size, mimeType, uploadedAt}` dove id e UUID v4 | VERIFIED | `hub.mjs:282` — `json(res, 200, { id, filename, size, mimeType, uploadedAt })`; `hub.mjs:279` — `crypto.randomUUID()`; test SC1 passa |
| 2  | `GET /files/:swarmId/:filename` ritorna `{content, offset, total_size, has_more}` e supporta `?offset=N&max_bytes=M` | VERIFIED | `hub.mjs:297` — risposta completa con tutti i campi; paginazione via `url.searchParams`; test SC2 passa |
| 3  | `GET /files/:swarmId` ritorna array di metadata; due upload producono array a due elementi | VERIFIED | `hub.mjs:301-305` — lista filtrata per swarmId, `content` escluso; test SC3 passa |
| 4  | `DELETE /files/:swarmId/:filename` ritorna `{deleted: true}` e GET successivo ritorna 404 | VERIFIED | `hub.mjs:317` — `json(res, 200, { deleted: true })`; test SC4 passa |
| 5  | Upload body > 10 MB ritorna HTTP 413 | VERIFIED | `hub.mjs:260-264` — catch su `BODY_TOO_LARGE`, drain socket, `json(res, 413, ...)`; test SC5 passa |
| 6  | Filename con `../` salvato come metadata opaco e mai interpretato come filesystem path | VERIFIED | `hub.mjs:17-18` — nessun import `node:fs` o `node:path`; filename arriva in `params.filename` e viene salvato direttamente in Map; test path traversal passa |

**Score:** 6/6 truths verificate

---

### Required Artifacts

| Artifact | Fornisce | Status | Dettagli |
|----------|----------|--------|----------|
| `servers/hub.mjs` | `const files = new Map()` | VERIFIED | Linea 33 — dichiarazione con JSDoc completo |
| `servers/hub.mjs` | `function readRawBody` | VERIFIED | Linea 69 — default 10 MB, flag `rejected`, errore con `err.code = "BODY_TOO_LARGE"` |
| `servers/hub.mjs` | `PUT /files/:swarmId/:filename` handler | VERIFIED | Linea 255 — async, chiama `readRawBody`, usa `crypto.randomUUID()` |
| `servers/hub.mjs` | `GET /files/:swarmId/:filename` handler | VERIFIED | Linea 286 — paginazione con `offset` e `max_bytes` |
| `servers/hub.mjs` | `GET /files/:swarmId` handler | VERIFIED | Linea 301 — lista metadata senza campo `content` |
| `servers/hub.mjs` | `DELETE /files/:swarmId/:filename` handler | VERIFIED | Linea 309 — rimozione da Map, 404 se assente |

---

### Key Link Verification

| From | To | Via | Status | Dettagli |
|------|----|-----|--------|----------|
| PUT handler | files Map | `files.set(id, entry)` | WIRED | `hub.mjs:281` |
| GET single handler | files Map | `files.values()` + find | WIRED | `hub.mjs:288` |
| DELETE handler | files Map | `files.delete(found)` | WIRED | `hub.mjs:316` |
| PUT handler | readRawBody | `await readRawBody(req)` | WIRED | `hub.mjs:258` |
| PUT handler 413 guard | `err.code === BODY_TOO_LARGE` | try/catch su readRawBody | WIRED | `hub.mjs:260` — catch verifica `err.code === "BODY_TOO_LARGE"` |

---

### Data-Flow Trace (Level 4)

| Artifact | Variabile dati | Sorgente | Produce dati reali | Status |
|----------|---------------|----------|-------------------|--------|
| GET /files/:swarmId/:filename | `entry.content` | `files Map` (popolata in PUT) | Si — Buffer reale dall'upload | FLOWING |
| GET /files/:swarmId | `list` | `files Map` filtrata per swarmId | Si — metadata reali dall'upload | FLOWING |
| DELETE /files/:swarmId/:filename | `found` (ID da Map) | `files Map` iterata | Si — rimozione effettiva | FLOWING |

---

### Behavioral Spot-Checks

| Comportamento | Comando | Risultato | Status |
|---------------|---------|-----------|--------|
| 6 test Task 1 (files Map + readRawBody) | `node --test tests/task1-files-map-rawbody.test.mjs` | 6 pass, 0 fail | PASS |
| 13 test Task 2 (quattro route handlers) | `node --test tests/task2-file-routes.test.mjs` | 13 pass, 0 fail | PASS |

---

### Requirements Coverage

| REQ-ID | Piano | Descrizione | Status | Evidence |
|--------|-------|-------------|--------|----------|
| FILE-01 | 06-01 | `PUT /files/:swarmId/:filename` — salva file in memoria con UUID key | SATISFIED | `hub.mjs:255-283`; test SC1 |
| FILE-02 | 06-01 | `GET /files/:swarmId/:filename` — paginazione `?offset=N&max_bytes=M` | SATISFIED | `hub.mjs:286-298`; test SC2 |
| FILE-03 | 06-01 | `GET /files/:swarmId` — lista file swarm con metadata | SATISFIED | `hub.mjs:301-306`; test SC3 |
| FILE-04 | 06-01 | `DELETE /files/:swarmId/:filename` — rimuove per filename nel namespace swarm | SATISFIED | `hub.mjs:309-318`; test SC4 |
| FILE-09 | 06-01 | `crypto.randomUUID()` come Map key; filename e solo metadata — nessun path traversal | SATISFIED | `hub.mjs:279`; nessun import `node:fs`/`node:path`; test path traversal |
| FILE-10 | 06-01 | `readRawBody` separato da `readBody`, default 10 MB, HTTP 413 su overflow | SATISFIED | `hub.mjs:69-88`; `hub.mjs:260-264`; test SC5 |

Tutti e 6 i requirement ID dichiarati nel PLAN sono presenti in REQUIREMENTS.md con `Phase 6 / 06-01` e marcati Complete. Nessun requirement orfano rilevato.

---

### Anti-Patterns Found

Nessuno. Scansione completa su `servers/hub.mjs`:
- Nessun TODO/FIXME/PLACEHOLDER
- Nessun `return null` / `return []` / `return {}` hollow nelle route
- Nessun handler stub (ogni handler esegue logica reale)
- Import limitati a `node:http` e `node:crypto` — assenza totale di `node:fs` e `node:path` confermata

---

### Human Verification Required

Nessun elemento richiede verifica umana. Tutti i comportamenti osservabili sono stati verificati programmaticamente tramite la suite di test integrata e ispezione diretta del codice.

---

## Gaps Summary

Nessun gap. Tutti i 6 must-haves verificati. I 4 TDD gate (2 RED + 2 GREEN) hanno commit verificati in git log (`4700d28`, `98b5a11`, `09a0ec3`, `db369ee`). Il fix per la consegna del 413 (drain socket invece di `req.destroy()`) e correttamente documentato nel SUMMARY e presente nel codice.

---

_Verified: 2026-04-26T19:58:30Z_
_Verifier: Claude (gsd-verifier)_
