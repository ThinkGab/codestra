# Phase 6: Hub File Routes - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 aggiunge al solo `servers/hub.mjs`:
- Helper `readRawBody(req, limit)` che restituisce raw Buffer (no JSON parse), limite default 10 MB, lancia errore su overflow
- 4 route HTTP per file storage: PUT, GET (con paginazione), GET lista, DELETE
- In-memory store UUID-keyed, namespace per swarmId
- Nessuna dipendenza da mcp-server.mjs — curl-testabile in isolamento

Fuori scope: MCP tools (Phase 7), SKILL.md (Phase 8), TLS, auth avanzata, persistenza disco.

</domain>

<decisions>
## Implementation Decisions

### File Store (in-memory)
- **D-01:** Store strutturato come `Map<uuid, {id, swarmId, filename, content (Buffer), size, mimeType, uploadedAt}>` — UUID come key, filename come metadata opaco (nessun path traversal possibile per design)
- **D-02:** Filename univoco per swarm — PUT con filename già esistente nel swarm **sostituisce** silenziosamente (elimina vecchio UUID entry, crea nuovo UUID). Nessun 409, nessun versionamento.

### Routes
- **D-03:** `PUT /files/:swarmId/:filename` — legge body con `readRawBody`, mimeType da `Content-Type` header request, default `application/octet-stream` se header assente. Risponde `{id, filename, size, mimeType, uploadedAt}`.
- **D-04:** `GET /files/:swarmId/:filename` — supporta `?offset=N&max_bytes=M`; il campo `content` è **stringa UTF-8** (Buffer decoded con `.toString('utf8')`). Risponde `{content, offset, total_size, has_more}`.
- **D-05:** `GET /files/:swarmId` — lista tutti i file del swarm (no content, solo metadata). Risponde array `[{id, filename, size, mimeType, uploadedAt}]`.
- **D-06:** `DELETE /files/:swarmId/:filename` — rimuove per filename nel swarm namespace. Risponde `{deleted: true}`, 404 se non trovato.

### readRawBody helper
- **D-07:** Firma: `readRawBody(req, maxBytes = 10_485_760)` — ritorna `Promise<Buffer>`. Su overflow: comportamento a **Claude's discretion** (pattern naturale: distrugge il request e lancia un errore con codice riconoscibile; PUT handler lo cattcha e invia HTTP 413). Separato da `readBody` che resta JSON-only.

### Paginazione
- **D-08:** Default paginazione GET file: `offset=0`, `max_bytes=1_000_000` (1 MB) se non specificato nel query param.

### Claude's Discretion
- Meccanismo interno di segnalazione 413 in `readRawBody` (throw typed error vs codice custom — agente sceglie)
- Default `max_bytes` per paginazione (1 MB suggerito, agente può aggiustare)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source
- `servers/hub.mjs` — Codebase esistente: pattern `routes` object, `matchRoute`, `readBody`, `json()`, `authorize()`, `generateId()` — tutti riutilizzabili o da cui derivare

### Requirements
- `.planning/REQUIREMENTS.md` §Hub File Routes — FILE-01, FILE-02, FILE-03, FILE-04, FILE-09, FILE-10
- `.planning/ROADMAP.md` §Phase 6 — Success Criteria (5 curl test cases, incluso 413 e path traversal)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `json(res, status, data)` helper — usare per tutte le risposte file
- `readBody(req, maxBytes)` — pattern di riferimento per `readRawBody` (stessa struttura, senza JSON.parse)
- `authorize(req, res)` — già applicato globalmente nel server handler, file routes ne beneficiano automaticamente
- `matchRoute` — già supporta path multi-segment (es. `/files/:swarmId/:filename` = 4 parti) senza modifiche
- `crypto` già importato — `crypto.randomUUID()` disponibile per UUID v4

### Established Patterns
- Route handlers registrati in oggetto `routes` come `"METHOD /path": handler` — aggiungere le 4 route allo stesso oggetto
- State in-memory come variabili module-level (`workers` Map, `messages` Array) — aggiungere `files` Map allo stesso livello
- URL parsing via `new URL(req.url, ...)` per query params — già usato in `GET /messages/:workerId`

### Integration Points
- Nessun integration point con MCP (phase 7 farà `hubFetch()` alle nuove route)
- Router esistente non richiede modifiche per gestire i nuovi path

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond those captured in decisions above — open to standard Node.js approaches.

</specifics>

<deferred>
## Deferred Ideas

- Binary file upload (two-step protocol: metadata via MCP, bytes via HTTP) — Future requirement, out of scope v1.2
- TTL automatico per file in-memory — Future requirement
- Namespace isolation enforcement (un worker può leggere file di altri swarm) — accettabile su LAN trusted, Future requirement
- File overwrite history / versioning — Future requirement

</deferred>

---

*Phase: 06-hub-file-routes*
*Context gathered: 2026-04-26*
