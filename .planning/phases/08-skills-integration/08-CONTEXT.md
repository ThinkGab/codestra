# Phase 8: Skills + Integration - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 consegna due artefatti:
1. `skills/codestra-file-transport/SKILL.md` — guida operativa per i Claude worker sull'uso del file transport MCP
2. Sequenza di test di integrazione two-worker documentata nel SKILL.md stesso (Worker A upload → Worker B download, contenuto identico)

Nessuna modifica a `hub.mjs` o `mcp-server.mjs`. Nessun nuovo package.

Fuori scope: binary upload, TTL automatico file, namespace isolation enforcement, test automatizzato multi-processo.

</domain>

<decisions>
## Implementation Decisions

### Naming e path dello skill
- **D-01:** Directory skill: `skills/codestra-file-transport/SKILL.md` — segue la convenzione esistente (`codestra-*`) di tutti gli skill nel progetto (codestra-messages, codestra-workers, codestra-broadcast, ecc.).

### Formato integration test
- **D-02:** Il test di integrazione è una sequenza manuale documentata dentro il SKILL.md stesso (non un file `.test.mjs` separato). Step espliciti: Worker A chiama `file_upload`, Worker B chiama `file_download` con lo stesso filename, verifica che il contenuto restituito sia identico.

### Struttura del SKILL.md
- **D-03:** Struttura "decision tree + esempi concreti":
  - Prima una regola chiara su quando usare file transport vs message passing
  - Poi esempi di tool call reali (input/output attesi)
  - Sezione limiti (text-only ≤50 KB, ephemeral, namespace per swarm)
  - Sezione handoff two-worker con sequenza step-by-step

### Lingua
- **D-04:** SKILL.md in italiano, coerente con tutti gli skill esistenti nel progetto.

### Claude's Discretion
- Wording esatto della regola decision tree (file vs messaggi)
- Numero di esempi concreti da includere (minimo: upload + download + list)
- Formato degli esempi tool call (JSON-style o prose)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Skill pattern esistente
- `skills/codestra-messages/SKILL.md` — riferimento formato: frontmatter YAML, `disable-model-invocation: true`, sezioni operative in italiano
- `skills/codestra-start-worker/SKILL.md` — riferimento struttura: argomenti, prerequisiti, istruzioni operative, output all'utente

### Requirements e roadmap
- `.planning/REQUIREMENTS.md` §Skills — FILE-11: contenuto obbligatorio del SKILL.md
- `.planning/ROADMAP.md` §Phase 8 — Success Criteria (2 criteri da soddisfare)

### MCP tools implementati (Phase 7)
- `.planning/phases/07-mcp-tool-wrappers/07-CONTEXT.md` — D-05/D-06/D-07/D-08: signature esatte dei quattro tool, response shapes, semantica paginazione
- `servers/mcp-server.mjs` — implementazione live dei tool per ricavare descrizioni accurate

### Hub routes (Phase 6 — context sulle semantiche di storage)
- `.planning/phases/06-hub-file-routes/06-CONTEXT.md` — semantica overwrite, UUID interno vs filename client, limite 10 MB hub-side

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Frontmatter pattern SKILL: `name`, `description`, `argument-hint`, `disable-model-invocation: true` — replicare identico
- Struttura directory: `skills/<skill-name>/SKILL.md` — una directory per skill

### Established Patterns
- SKILL.md: nessun codice eseguibile, solo istruzioni per il Claude worker
- Lingua italiana per tutto il testo utente
- Sezioni operative esplicite con numerazione step
- Riferimenti a tool MCP con nome esatto (`file_upload`, `file_download`, ecc.)

### Integration Points
- Nessuna modifica a codice esistente — Phase 8 è solo documentazione + test manuale
- Il SKILL.md viene caricato da Claude Code come skill quando il worker lo invoca

</code_context>

<specifics>
## Specific Ideas

- La regola "quando usare file transport vs messaggi" deve coprire almeno: dimensione payload (>qualche KB → file), struttura binaria/testo lungo, condivisione tra più worker vs comunicazione diretta
- La sequenza di test manuale deve essere abbastanza dettagliata da poter essere eseguita in 2-3 minuti con due istanze Claude Code attive

</specifics>

<deferred>
## Deferred Ideas

- Test automatizzato multi-processo (spawn hub + 2 MCP server + assertion) — troppo complesso per v1.2, da valutare in milestone futura
- SKILL.md in inglese per audience internazionale — deferred, tutti gli skill attuali sono in italiano

</deferred>

---

*Phase: 08-skills-integration*
*Context gathered: 2026-04-27*
