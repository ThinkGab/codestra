# REQUIREMENTS.md — Milestone v1.2: MCP File Transport

## Milestone Requirements

### Hub File Routes

- [ ] **FILE-01**: Hub espone `PUT /files/:swarmId/:filename` — salva file in memoria con UUID key, filename come metadata, risponde con `{id, filename, size, mimeType, uploadedAt}`
- [ ] **FILE-02**: Hub espone `GET /files/:swarmId/:filename` — supporta paginazione via `?offset=N&max_bytes=M`; risponde con `{content, offset, total_size, has_more}`
- [ ] **FILE-03**: Hub espone `GET /files/:swarmId` — lista tutti i file del swarm con `[{id, filename, size, mimeType, uploadedAt}]`
- [ ] **FILE-04**: Hub espone `DELETE /files/:swarmId/:filename` — rimuove file per filename nel namespace swarm; risponde con `{deleted: true}`
- [ ] **FILE-09**: Hub usa `crypto.randomUUID()` come Map key; filename client è solo metadata — nessun path traversal possibile
- [ ] **FILE-10**: Hub ha helper `readRawBody(req, limit)` separato da `readBody` per route upload (default 10 MB); risponde HTTP 413 su overflow

### MCP Tools

- [ ] **FILE-05**: `file_upload` tool in mcp-server.mjs — accetta `filename`, `content` (testo ≤50 KB), `mimeType` opzionale; usa swarm_id del worker come namespace; proxy a PUT hub
- [ ] **FILE-06**: `file_download` tool — accetta `filename`, `offset` (default 0), `max_bytes` (default 25000 per rispettare limite token MCP); restituisce content + has_more per paginazione
- [ ] **FILE-07**: `file_list` tool — restituisce lista file swarm corrente; proxy a GET /files/:swarmId
- [ ] **FILE-08**: `file_delete` tool — accetta `filename`; rimuove file nel swarm corrente; proxy a DELETE hub

### Skills

- [ ] **FILE-11**: `skills/file-transport/SKILL.md` creato con istruzioni per workers: quando usare file_upload/download, limiti size (testo ≤50 KB), semantica ephemeral (hub restart = file persi), pattern two-worker handoff via filename condiviso

## Future Requirements

- Binary file upload via two-step protocol (metadata via MCP, bytes via direct HTTP) — MVP limita a testo ≤50 KB
- TTL automatico per file in-memory (cleanup su timeout)
- Namespace isolation enforcement (ora qualsiasi worker può leggere file di altri swarm — accettabile su LAN trusted)
- File overwrite history / versioning

## Out of Scope

- TLS / HTTPS — usare reverse proxy per internet
- Autenticazione avanzata (OAuth, JWT)
- Persistenza su disco (database) — in-memory è intenzionale
- Streaming upload/download (chunked transfer)
- Binary file upload in v1.2 — solo testo ≤50 KB per limitazione LLM tool args

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| FILE-01 | Phase 6 | — | Pending |
| FILE-02 | Phase 6 | — | Pending |
| FILE-03 | Phase 6 | — | Pending |
| FILE-04 | Phase 6 | — | Pending |
| FILE-09 | Phase 6 | — | Pending |
| FILE-10 | Phase 6 | — | Pending |
| FILE-05 | Phase 7 | — | Pending |
| FILE-06 | Phase 7 | — | Pending |
| FILE-07 | Phase 7 | — | Pending |
| FILE-08 | Phase 7 | — | Pending |
| FILE-11 | Phase 8 | — | Pending |
