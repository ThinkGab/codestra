# Phase 8: Skills + Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 08-skills-integration
**Areas discussed:** Nome/path SKILL, Formato integration test, Struttura SKILL.md, Lingua SKILL

---

## Nome/path del SKILL

| Option | Description | Selected |
|--------|-------------|----------|
| `codestra-file-transport` | Segue convenzione esistente `codestra-*` | ✓ |
| `file-transport` | Esattamente come ROADMAP.md specifica | |
| `codestra-file-transport-skill` | Variante con suffisso esplicito | |

**User's choice:** `codestra-file-transport` (convenzione esistente)
**Notes:** Coerenza con tutti gli skill esistenti (codestra-messages, codestra-workers, ecc.)

---

## Formato integration test

| Option | Description | Selected |
|--------|-------------|----------|
| Sequenza manuale nel SKILL | Step-by-step dentro SKILL.md, verificabile manualmente | ✓ |
| Test automatizzato `.test.mjs` | Spawn 3 processi Node.js, robusto ma complesso | |
| File separato `INTEGRATION-TEST.md` | Documento dedicato, ma contenuto minimo | |

**User's choice:** Sequenza manuale documentata nel SKILL.md
**Notes:** Zero infrastruttura extra, verificabile in 2 minuti

---

## Struttura SKILL.md

| Option | Description | Selected |
|--------|-------------|----------|
| Decision tree + esempi | Regola when-to-use + tool call examples concreti | ✓ |
| Prosa con sezioni | Stile codestra-messages, familiare ma meno immediata | |
| Tabella comparativa | File vs message passing in tabella | |

**User's choice:** Decision tree + esempi concreti
**Notes:** Massima utilità per worker LLM al momento dell'uso

---

## Lingua del SKILL

| Option | Description | Selected |
|--------|-------------|----------|
| Italiano | Coerente con tutti gli skill esistenti | ✓ |
| Inglese | Per audience internazionale, rompe coerenza attuale | |

**User's choice:** Italiano
**Notes:** Coerenza con l'intero ecosistema di skill Codestra

---

## Claude's Discretion

- Wording esatto della regola decision tree
- Numero e formato degli esempi di tool call
- Dettaglio degli step nella sequenza di test manuale

## Deferred Ideas

- Test automatizzato multi-processo — complessità sproporzionata per v1.2
- SKILL.md in inglese — deferred, coerenza italiana mantenuta
