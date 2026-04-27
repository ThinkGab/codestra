# Phase 7: MCP Tool Wrappers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 07-mcp-tool-wrappers
**Areas discussed:** swarmId acquisition, file_download response format, hubFetch raw body adaptation

---

## swarmId acquisition

| Option | Description | Selected |
|--------|-------------|----------|
| Module-level var | `let registeredWorkerId` catturato in swarm_register — tool usano implicitamente | ✓ |
| Parametro esplicito | swarmId obbligatorio su ogni tool | |
| SWARM_ID env + module-level fallback | process.env.SWARM_ID come default | |

**User's choice:** Module-level var (Recommended)
**Notes:** Coerente con pattern esistente httpServer/pollInterval. Worker non deve passare swarmId a ogni chiamata.

---

## file_download response format

| Option | Description | Selected |
|--------|-------------|----------|
| JSON strutturato | Ritorna JSON string con {content, offset, total_size, has_more} | ✓ |
| Text + metadata header | Content come testo puro con header leggibile | |
| Content-only + isMore flag | Due content item separati | |

**User's choice:** JSON strutturato (Recommended)
**Notes:** Worker LLM può parsare has_more e offset per gestire multi-chunk download.

---

## hubFetch raw body adaptation

| Option | Description | Selected |
|--------|-------------|----------|
| Header override, nessuna modifica | Usa spread options.headers già presente in hubFetch | ✓ |
| Extend hubFetch con rawBody flag | Aggiunge parametro esplicito, modifica funzione condivisa | |
| Claude's discretion | Planner decide | |

**User's choice:** Header override, nessuna modifica (Recommended)
**Notes:** hubFetch già supporta `{ ...headers, ...options.headers }` — Content-Type override è gratis. Zero modifiche a funzione condivisa.

---

## Claude's Discretion

- Formato testo di successo per file_upload
- Messaggio per file_list vuota

## Deferred Ideas

- Binary file upload (two-step protocol) — Future requirement
- swarmId parametro esplicito override — out of scope v1.2
- 50 KB client-side validation in file_upload — Claude's discretion
