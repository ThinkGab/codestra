# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.2 — MCP File Transport

**Shipped:** 2026-04-27
**Phases:** 3 | **Plans:** 3 | **Sessions:** ~4

### What Was Built
- In-memory UUID-keyed file store in hub.mjs — 4 HTTP routes, 10 MB guard, paginated download
- 4 MCP file tools in mcp-server.mjs (file_upload/download/list/delete) via registeredWorkerId implicit namespace
- `skills/codestra-file-transport/SKILL.md` — 228 lines, when-to-use, limiti, esempi JSON, two-worker handoff pattern

### What Worked
- TDD (RED→GREEN per task) mantenne implementazione pulita senza over-engineering
- Plan-checker prima dell'esecuzione eliminò ambiguità: piano 07-01 eseguito verbatim senza deviazioni
- Sequential JSON-RPC client per E2E (invece di naive printf pipe) risolse race condition elegantemente
- Fase 8 (SKILL.md) completata in 3 minuti — documentazione come primo-cittadino pagava dividendi

### What Was Inefficient
- base64 bug (file_download) scoperto dopo Phase 7 close durante verifier — sarebbe stato più rapido testare E2E con decode prima del commit
- UAT manuale mai eseguito (10 item deferred) — limite strutturale: richiede sessione Claude Code dedicata con MCP attivo
- 81 commit per 3 fasi — molti commits docs/planning; utile per storia ma rumoroso

### Patterns Established
- `registeredWorkerId` module-level come implicit namespace: pattern riusabile per qualsiasi tool che richieda identità worker
- `hubFetch` proxy pattern: Content-Type override via header spread — nessuna modifica a hubFetch necessaria per nuovi content type
- `readRawBody` separato da `readBody`: pattern da seguire per qualsiasi route hub che accetti payload binario/raw
- Skill operativo: frontmatter YAML + when-to-use + esempi verbatim + test manuale step-by-step

### Key Lessons
1. **Includere pagination schema dal giorno 1**: breaking change se retrofitted (lezione da FILE-02/FILE-06 design)
2. **Test E2E con sequential client** quando il server sotto test ha comportamento asincrono all'avvio
3. **Identificare il bug path traversal prima** tramite UUID key (non sanitizzazione filename) — approccio più robusto
4. **UAT manuale richiede sessione dedicata** — pianificare sprint di testing separato se MCP non disponibile durante sviluppo

### Cost Observations
- Sessioni: ~4 (discuss, plan×3, execute×3, review, verify)
- Notable: Fase 8 costo minimo (3 min, 1 task, 0 deviazioni) — documentazione come deliverable invece di afterthought

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 5 | Bootstrap: skills, HTTP server, push delivery |
| v1.1 | 2 | 4 | Gap-closure plan (05-03) aggiunto post-verifier |
| v1.2 | 3 | 3 | TDD rigoroso, plan-checker pre-esecuzione, skill come deliverable |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions | Bugs Found Post-Close |
|-----------|-------|-------------------|-----------------------|
| v1.0 | node:test | 0 | Nessuno noto |
| v1.1 | node:test | 0 | Nessuno noto |
| v1.2 | node:test (TDD) | 0 | 1 (base64 in file_download — fixato stesso giorno) |

### Top Lessons (Verificati Across Milestones)

1. **In-memory è la scelta giusta per v1.x** — hub restart = stato perso, ed è intenzionale; semplifica enormemente l'implementazione
2. **Skill files come documentazione operativa** — workers leggono SKILL.md per sapere come comportarsi; investimento in qualità doc = meno bug runtime
3. **UAT manuale va pianificato esplicitamente** — non emerge naturalmente; richiede sessione dedicata con MCP attivo
