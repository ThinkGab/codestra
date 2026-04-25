# Phase 4: Hub Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 04-hub-fixes
**Areas discussed:** DELETE risposta ID sconosciuto, System prompt meccanismo, System prompt contenuto

---

## DELETE: risposta per ID sconosciuto

| Option | Description | Selected |
|--------|-------------|----------|
| 404 + { error: 'Worker not found' } | REST standard. mcp-server va aggiornato per gestire 404. | ✓ |
| 200 + { ok: false, deleted: false } | Cambio minimo, no modifiche a mcp-server. | |
| 200 + { ok: true, deleted: false } | Mantieni comportamento attuale. | |

**User's choice:** 404 + { error: 'Worker not found' }
**Notes:** mcp-server.mjs già gestisce correttamente il caso — `swarm_kill_worker` controlla `data.deleted` (undefined = falsy), nessuna modifica richiesta.

---

## System prompt: meccanismo di iniezione

| Option | Description | Selected |
|--------|-------------|----------|
| swarm_hub_start restituisce il prompt nel tool result | Zero nuove route, zero nuovi tool. Claude lo vede subito. | ✓ |
| Nuovo endpoint GET /system-prompt + tool swarm_get_prompt | Richiede chiamata esplicita. | |
| MCP server invia notifica su connect | Appare nei log MCP, non come tool result visibile. | |

**User's choice:** swarm_hub_start restituisce il prompt nel tool result

---

## System prompt: contenuto e configurabilità

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded in mcp-server.mjs | Testo fisso, semplice da mantenere. | ✓ |
| Configurabile via env SWARM_SYSTEM_PROMPT | Flessibile ma aggiunge complessità. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Breve + direttivo | 2-3 righe, essenziale. | ✓ |
| Dettagliato con esempi | Include tool list ed esempi. | |

**User's choice:** Hardcoded, breve e direttivo

---

## Deferred Ideas

None.
