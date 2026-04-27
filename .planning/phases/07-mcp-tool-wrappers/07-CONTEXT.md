# Phase 7: MCP Tool Wrappers - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 aggiunge a `servers/mcp-server.mjs` quattro MCP tool: `file_upload`, `file_download`, `file_list`, `file_delete`. Sono proxy sottili verso le route HTTP del hub (già implementate in Phase 6) tramite `hubFetch()`. Nessuna modifica a hub.mjs. Nessun nuovo package.

Fuori scope: SKILL.md (Phase 8), TLS, auth avanzata, binary upload, cross-swarm namespace access.

</domain>

<decisions>
## Implementation Decisions

### swarmId acquisition
- **D-01:** Aggiungere `let registeredWorkerId` come variabile module-level (stesso pattern di `httpServer` e `pollInterval`). Il valore viene catturato in `swarm_register` quando la registrazione ha successo (`assignedId`). I quattro file tool usano `registeredWorkerId` implicitamente — nessun parametro `swarmId` esposto al LLM caller.
- **D-02:** Se `registeredWorkerId` è vuoto al momento della chiamata (worker non ancora registrato), il tool restituisce `isError: true` con messaggio chiaro ("call swarm_register first").

### file_download response format
- **D-03:** `file_download` restituisce una singola content item di tipo `text` con il JSON string dell'intera risposta hub: `{content, offset, total_size, has_more}`. Il LLM worker può parsare `has_more` e calcolare il prossimo `offset` per chiamate multi-chunk.

### hubFetch adaptation per upload raw
- **D-04:** Nessuna modifica a `hubFetch`. `file_upload` usa `hubFetch(path, { method: "PUT", body: content, headers: { "Content-Type": mimeType || "text/plain" } })`. Lo spread `{ ...headers, ...options.headers }` già presente in hubFetch sovrascrive `Content-Type: application/json` — comportamento già supportato.

### Tool signatures (derivate da REQUIREMENTS)
- **D-05:** `file_upload(filename, content, mimeType?)` — content string ≤50 KB. Proxy a `PUT /files/:swarmId/:filename`. Risponde con JSON dell'hub `{id, filename, size, mimeType, uploadedAt}`.
- **D-06:** `file_download(filename, offset?, max_bytes?)` — offset default 0, max_bytes default 25000 (rispetto limite token MCP). Proxy a `GET /files/:swarmId/:filename?offset=N&max_bytes=M`. Risponde con JSON `{content, offset, total_size, has_more}`.
- **D-07:** `file_list()` — nessun param. Proxy a `GET /files/:swarmId`. Risponde con JSON array `[{id, filename, size, mimeType, uploadedAt}]`.
- **D-08:** `file_delete(filename)` — Proxy a `DELETE /files/:swarmId/:filename`. Risponde con `{deleted: true}` o errore.

### Error handling
- **D-09:** Pattern esistente: try/catch intorno a `hubFetch`, `isError: true` su errore network. In aggiunta: se l'hub restituisce `{error: "..."}` nel JSON (4xx), rilevare e restituire `isError: true` con il messaggio dell'hub. Questo protegge da 404 (file non trovato) e altri errori semantici.

### Claude's Discretion
- Formato esatto del testo di successo per file_upload (e.g., JSON prettificato vs summary)
- Messaggio per file_list vuota (array vuoto vs "No files in swarm")

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source
- `servers/mcp-server.mjs` — Codebase esistente: `hubFetch` helper, pattern `server.tool(...)`, module-level vars (`httpServer`, `pollInterval`, `registeredWorkerId` da aggiungere), error handling pattern

### Requirements
- `.planning/REQUIREMENTS.md` §MCP Tools — FILE-05, FILE-06, FILE-07, FILE-08
- `.planning/ROADMAP.md` §Phase 7 — Success Criteria (4 test case)

### Hub routes (Phase 6 — già implementate)
- `.planning/phases/06-hub-file-routes/06-CONTEXT.md` — Decisioni D-03/D-04/D-05/D-06: contratti esatti delle route hub, response shapes, paginazione, semantica overwrite

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hubFetch(path, options)` — già supporta header override via `options.headers`. Body raw: basta non chiamare JSON.stringify, passare string direttamente.
- `server.tool(name, description, schema, handler)` — pattern standard per tutti i tool esistenti
- Error handling template: `try { ... } catch (err) { return { content: [{type:"text", text: ...}], isError: true } }`
- Module-level vars (`httpServer`, `pollInterval`) — pattern già consolidato per state condiviso tra tool handlers

### Established Patterns
- Tool descriptions sono verbose e in inglese (stile imperativo: "Upload a file...", "Download content...")
- Schema Zod: `.optional()` per params opzionali, `.describe("...")` per ogni campo
- Tool handlers: async arrow function, return `{ content: [{type: "text", text: string}] }`

### Integration Points
- `swarm_register` handler: aggiungere `registeredWorkerId = assignedId` dopo la registrazione riuscita (riga ~168 del file attuale)
- Nuovi tool da inserire dopo `swarm_kill_worker` e prima del blocco `// ── Worker HTTP Server ──`
- `hubFetch` non richiede modifiche

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond those captured in decisions above — open to standard Node.js approaches.

</specifics>

<deferred>
## Deferred Ideas

- Binary file upload (two-step: metadata via MCP, bytes via HTTP direct) — Future requirement, out of scope v1.2
- swarmId come parametro esplicito override — potrebbe essere utile per cross-swarm access, ma fuori scope (namespace isolation non è enforcement obiettivo v1.2)
- file_upload content validation (50 KB enforcement nel tool lato MCP) — Claude's discretion se aggiungere validazione client-side oltre al 413 hub-side

</deferred>

---

*Phase: 07-mcp-tool-wrappers*
*Context gathered: 2026-04-27*
