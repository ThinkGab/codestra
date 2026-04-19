---
phase: 03-hub-push-delivery
fixed_at: 2026-04-19T15:47:00+02:00
review_path: .planning/phases/03-hub-push-delivery/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-04-19T15:47:00+02:00
**Source review:** .planning/phases/03-hub-push-delivery/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, WR-01, WR-02, WR-03)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Timing Attack on `SWARM_SECRET` Comparison

**Files modified:** `servers/hub.mjs`
**Commit:** c08ccb3
**Applied fix:** Sostituita la comparazione `===` con `crypto.timingSafeEqual` su buffer di lunghezza uguale. Il token viene paddato alla lunghezza del segreto prima del confronto, eliminando il vettore di timing attack su LAN.

---

### CR-02: `SWARM_SECRET` Forwarded to Attacker-Controlled `callback_url`

**Files modified:** `servers/hub.mjs`
**Commit:** 88caaa5
**Applied fix:** Applicata la soluzione combinata Option A + Option B: rimosso l'header `Authorization` dalle chiamate push in uscita (`pushToWorker`), e aggiunta la funzione `isLanUrl()` con validazione regex dell'hostname in `POST /workers` — le `callback_url` non-LAN vengono rifiutate con HTTP 400 al momento della registrazione.

---

### WR-01: `Set` Serializes as `{}` in All JSON Responses

**Files modified:** `servers/hub.mjs`
**Commit:** 2a5aac4
**Applied fix:** Aggiunta la conversione `[...msg.readBy]` in entrambe le call-site di risposta: `POST /messages` (riga 184) e `GET /messages/:workerId` (riga 218). Il `Set` interno rimane invariato per la logica `has()`; solo la serializzazione JSON viene corretta.

---

### WR-02: No Request Body Size Limit

**Files modified:** `servers/hub.mjs`
**Commit:** 357bcd6
**Applied fix:** Aggiunto parametro `maxBytes = 1_048_576` (1 MB) a `readBody`. Nel listener `data` viene accumulato il contatore `total`; se supera il limite, la connessione viene distrutta con `req.destroy()` e la promise viene rigettata. Il try/catch già presente nei route handler gestisce il reject restituendo HTTP 500.

---

### WR-03: Falsy Check Silently Ignores Empty-String Field Updates

**Files modified:** `servers/hub.mjs`
**Commit:** 721bc42
**Applied fix:** Sostituiti i controlli `if (body.status)` e `if (body.task)` con `!== undefined` esplicito in `PATCH /workers/:id`, permettendo a chiamanti di azzerare i campi con stringa vuota.

---

## Skipped Issues

Nessun finding saltato — tutti e 5 i finding in scope sono stati corretti.

---

_Fixed: 2026-04-19T15:47:00+02:00_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
