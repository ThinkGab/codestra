# Phase 5: Worker Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — questo log preserva le alternative considerate.

**Date:** 2026-04-26
**Phase:** 05-worker-lifecycle
**Areas discussed:** SWARM_ID wiring, Polling + push, Shutdown detection, Polling errors

---

## SWARM_ID wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Param runtime a swarm_register | Aggiunge swarmId param al tool; skill passa $3 senza restart | ✓ |
| Solo env var in .mcp.json | Istruisce utente a settare SWARM_ID in .mcp.json e riavviare | |

**User's choice:** Param runtime a swarm_register (Raccomandato)
**Notes:** Coerente con come workerPort è già gestito — nessun restart richiesto.

---

## Polling + push

| Option | Description | Selected |
|--------|-------------|----------|
| Solo fallback se no callback_url | Poll solo se il worker non ha push attivo — zero duplicati | ✓ |
| Sempre in parallelo al push | Poll ogni 10s indipendentemente — rischio messaggi duplicati | |

**Poll output choice:**

| Option | Description | Selected |
|--------|-------------|----------|
| process.stdout.write | Stesso pattern del push handler esistente | ✓ |
| Solo log su stderr | Solo diagnostica, non processabile da Claude | |

**User's choice:** Fallback-only + process.stdout.write
**Notes:** Workers già hanno push attivo (Phase 3) — polling è safety net solo senza callback_url.

---

## Shutdown detection

| Option | Description | Selected |
|--------|-------------|----------|
| stdin 'close' event | Scatta quando Claude chiude pipe stdio — preciso, zero falsi positivi | ✓ |
| SIGTERM + SIGINT signals | Standard Unix ma Claude potrebbe non mandare SIGTERM esplicito | |
| Entrambi (belt + suspenders) | Massima copertura, più codice | |

**Cleanup choice:**

| Option | Description | Selected |
|--------|-------------|----------|
| Chiudi server HTTP + clear interval | httpServer.close() + clearInterval — Node.js esce naturalmente | ✓ |
| DELETE /workers/:id + chiudi tutto | De-registra dall'hub — rischio timeout se hub già down | |

**User's choice:** stdin 'close' + httpServer.close() + clearInterval
**Notes:** Nessuna chiamata DELETE all'hub — troppo fragile nel path di uscita.

---

## Polling errors

| Option | Description | Selected |
|--------|-------------|----------|
| Silent skip | Swallow errore, riprova al prossimo ciclo | ✓ |
| Log su stderr + riprova | Visibilità diagnostica, ma rumoroso se hub down a lungo | |
| Stop dopo N failures | Evita polling infinito su hub dead | |

**User's choice:** Silent skip (Raccomandato)
**Notes:** Zero rumore durante operazione normale.

---

## Claude's Discretion

- Posizione esatta del `process.stdin.on('close')` nel sorgente
- Naming del campo swarmId nel body hub POST

## Deferred Ideas

- DELETE /workers/:id automatico al shutdown — considerare per v1.2
- Reconnect automatico se hub va down — già fuori scope v1.1
