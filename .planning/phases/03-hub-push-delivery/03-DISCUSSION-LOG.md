# Phase 3: Hub Push Delivery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 03-hub-push-delivery
**Areas discussed:** Broadcast push, Mark-as-read on push, Delivery status, Push payload format

---

## Broadcast Push

| Option | Description | Selected |
|--------|-------------|----------|
| Push a tutti + fallback | Hub itera tutti i worker con callback_url, fa POST a ciascuno. Chi non raggiungibile resta in store-and-forward. | ✓ |
| Solo store-and-forward | Broadcast non usa push — ogni worker fa polling. Più semplice, nessun fan-out HTTP dal hub. | |
| Push a tutti, nessun fallback | Push a tutti i worker con callback_url. Fallimento ignorato senza store-and-forward per broadcast. | |

**User's choice:** Push a tutti + fallback
**Notes:** Fan-out HTTP per broadcast, fallback per-worker silenzioso.

---

## Mark-as-read on Push

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, read=true subito | Worker l'ha ricevuto via push — il poll successivo non lo vede più. Comportamento pulito. | ✓ |
| No, resta unread | Messaggio rimane disponibile via polling anche dopo push riuscito. Worker potrebbe processarlo due volte. | |

**User's choice:** Sì, read=true subito
**Notes:** Push success = messaggio consumato. Polling non ripete.

---

## Delivery Status in Response

| Option | Description | Selected |
|--------|-------------|----------|
| No, contratto invariato | Response rimane {ok, message}. Delivery è best-effort e opaco. | ✓ |
| Sì, aggiungi delivered:true/false | Response: {ok, message, delivered: bool}. Sender sa se push è riuscito. | |
| Sì, ma solo se push tentato | Response: {ok, message, push_attempted: bool, push_ok: bool}. Più granulare. | |

**User's choice:** No, contratto invariato
**Notes:** Push è best-effort opaco al sender.

---

## Push Payload Format

| Option | Description | Selected |
|--------|-------------|----------|
| Full message object | POST body: {id, from, to, body, timestamp}. Worker ha tutto il contesto. | ✓ |
| Solo body string | POST body: {body: "..."}. Minimo, perde from/timestamp. | |
| Envelope con tipo | POST body: {type:"message", payload:{...}}. Estendibile ma over-engineering. | |

**User's choice:** Full message object
**Notes:** Worker handler stampa raw body — nessuna modifica necessaria a mcp-server.mjs.

---

## Claude's Discretion

- Logging errori push a stderr: non specificato, lasciato a Claude.
- Timeout per la request push HTTP: non specificato, valore ragionevole (es. 5s) a Claude.

## Deferred Ideas

Nessuna — discussione rimasta nello scope della fase.
