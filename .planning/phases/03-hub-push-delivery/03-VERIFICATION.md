---
phase: 03-hub-push-delivery
verified: 2026-04-19T13:40:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Unicast push delivery end-to-end"
    expected: "Hub fa POST alla callback_url del worker e il worker riceve il messaggio; il messaggio non riappare via GET /messages/:workerId?unread=true dopo una push riuscita"
    why_human: "Richiede due processi in esecuzione (hub + worker HTTP server); non verificabile con grep/static analysis"
  - test: "Broadcast fan-out con mix di worker con e senza callback_url"
    expected: "Worker con callback_url ricevono il messaggio via push e non lo vedono nuovamente via polling; worker senza callback_url lo ricevono comunque via GET /messages/:workerId?unread=true"
    why_human: "Comportamento runtime che richiede worker reali registrati con e senza callback_url"
  - test: "Silent fallback su push failure (timeout o non-2xx)"
    expected: "Se la callback_url del worker non risponde entro 5s o restituisce errore, il messaggio rimane disponibile via polling senza alcun errore esposto al mittente"
    why_human: "Richiede simulazione di un endpoint non raggiungibile o che restituisce 5xx — comportamento di timeout non verificabile staticamente"
---

# Phase 3: Hub Push Delivery — Verification Report

**Phase Goal:** Hub invia attivamente messaggi ai worker via callback_url (respond-before-push, unicast, broadcast fan-out, silent fallback store-and-forward)
**Verified:** 2026-04-19T13:40:00Z
**Status:** human_needed
**Re-verification:** No — verifica iniziale

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Worker records in the in-memory Map contengono un campo `callback_url` (null quando non fornito) | VERIFIED | `hub.mjs:115` — `callback_url: body.callback_url \|\| null` nel costruttore worker |
| 2  | Message objects usano `readBy: Set<workerId>` invece di `read: boolean` | VERIFIED | `hub.mjs:162` — `readBy: new Set()` in POST /messages; nessun `read: false` residuo nel codice funzionale |
| 3  | GET /messages/:workerId filtra con `readBy.has(workerId)` e marca con `readBy.add(workerId)` | VERIFIED | `hub.mjs:197` — `!m.readBy.has(params.workerId)`; `hub.mjs:200` — `m.readBy.add(params.workerId)` |
| 4  | `pushToWorker(worker, msg)` esiste e restituisce `true` su 2xx, `false` su qualsiasi errore o timeout | VERIFIED | `hub.mjs:70-92` — funzione completa con `AbortSignal.timeout(5000)`, `return res.ok`, `catch { return false }` |
| 5  | POST /messages restituisce 201 al mittente immediatamente, prima di qualsiasi push | VERIFIED | `hub.mjs:167` — `json(res, 201, ...)` a riga 167; `setImmediate(...)` a riga 169 (dopo) |
| 6  | Unicast: quando `to` è un workerId specifico con `callback_url`, hub fa POST al worker | VERIFIED | `hub.mjs:181-186` — `workers.get(msg.to)` + `pushToWorker(worker, msg)` nel ramo unicast |
| 7  | Broadcast: hub fa POST a TUTTI i worker con `callback_url` via `Promise.allSettled` fan-out | VERIFIED | `hub.mjs:172-178` — `.filter((w) => w.callback_url)` + `Promise.allSettled(targets.map(...))` |
| 8  | Push riuscita (2xx dal worker) causa `msg.readBy.add(workerId)` — nessun duplicato via polling | VERIFIED | `hub.mjs:176` (broadcast) e `hub.mjs:184` (unicast) — `if (ok) msg.readBy.add(worker.id)` |
| 9  | Push failure (errore rete, timeout, non-2xx) è silenzioso — messaggio resta in store-and-forward | VERIFIED | `pushToWorker` restituisce `false` su qualsiasi errore (`catch { return false }`); rami unicast/broadcast non aggiornano `readBy` se `!ok` |
| 10 | Worker senza `callback_url` riceve il messaggio via GET /messages/:workerId polling invariato | VERIFIED | Unicast: `workers.get(msg.to)` con `callback_url: null` → `pushToWorker` ritorna `false` immediatamente (riga 71); Broadcast: escluso da `.filter(w => w.callback_url)` — messaggio mai marcato come delivered, quindi visibile via polling |

**Score:** 10/10 truths verificate

### Artifact Status

| Artifact | Expected | Esiste | Sostanziale | Cablata | Status |
|----------|----------|--------|-------------|---------|--------|
| `servers/hub.mjs` | pushToWorker helper, readBy schema, callback_url su worker record, POST /messages con push delivery, GET aggiornato | SI | SI (258 righe, logica completa) | SI (unico file server, entry point diretto) | VERIFIED |

### Key Link Verification

| From | To | Via | Status | Dettaglio |
|------|----|-----|--------|-----------|
| POST /workers handler | workers Map | `callback_url: body.callback_url \|\| null` | VERIFIED | `hub.mjs:115` |
| GET /messages/:workerId | `message.readBy` | `readBy.has(params.workerId)` filter + `readBy.add(params.workerId)` mark | VERIFIED | `hub.mjs:197, 200` |
| POST /messages handler | `pushToWorker()` | `setImmediate` + `Promise.allSettled` | VERIFIED | `hub.mjs:169, 173, 183` |
| `pushToWorker` success (returns true) | `msg.readBy` | `msg.readBy.add(worker.id)` | VERIFIED | `hub.mjs:176, 184` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produce dati reali | Status |
|----------|---------------|--------|-------------------|--------|
| POST /messages handler | `msg` | Costruito da `body` (richiesta HTTP) + `messages.push(msg)` | SI — oggetto reale con id generato, push asincrona vera | FLOWING |
| `pushToWorker` | `worker.callback_url` | `workers Map` popolata al momento della registrazione | SI — URL reale proveniente dal body di POST /workers | FLOWING |
| GET /messages/:workerId | `matching` | `messages` array filtrato per `readBy.has` | SI — stato persistente in-memory, tracciamento reale per worker | FLOWING |

### Behavioral Spot-Checks

| Comportamento | Comando | Risultato | Status |
|--------------|---------|-----------|--------|
| Sintassi hub.mjs valida | `node --check servers/hub.mjs` | SYNTAX OK | PASS |
| `pushToWorker` definita prima dei routes | grep riga 70 vs routes riga 96 | riga 70 < riga 96 | PASS |
| `json(res, 201)` prima di `setImmediate` | grep righe 167 e 169 | 167 < 169 | PASS |
| Nessun `read: false` residuo nel codice funzionale | grep codice funzionale | Solo in JSDoc obsoleto (riga 29, commento) | PASS (warning) |
| Test runtime unicast/broadcast/fallback | Richiede hub + worker attivi | Non eseguibile staticamente | SKIP |

### Requirements Coverage

| Requirement | Piano | Descrizione | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| HUB-01 | 03-01 | Hub salva `callback_url` nel record del worker al momento della registrazione | SATISFIED | `hub.mjs:115` — `callback_url: body.callback_url \|\| null` |
| HUB-02 | 03-02 | Quando viene inviato un messaggio a un worker, hub fa POST alla sua `callback_url` se disponibile | SATISFIED | `hub.mjs:181-186` (unicast) + `hub.mjs:172-178` (broadcast) |
| HUB-03 | 03-01 + 03-02 | Hub fa fallback silenzioso a store-and-forward se `callback_url` non è impostata o la POST fallisce | SATISFIED | `pushToWorker:71` (`!callback_url → return false`); `catch { return false }`; `readBy` non aggiornato su failure |

### Anti-Pattern Trovati

| File | Riga | Pattern | Severita | Impatto |
|------|------|---------|----------|---------|
| `servers/hub.mjs` | 29 | JSDoc `@type` ancora con `read: boolean` invece di `readBy: Set` | Info | Nessun impatto funzionale — solo commento documentale obsoleto; non blocca nulla |

### Human Verification Required

#### 1. Unicast Push Delivery End-to-End

**Test:** Avviare hub (`node servers/hub.mjs`). Avviare un worker HTTP server sulla porta locale (es. 8801) con un endpoint POST che riceve il messaggio. Registrare il worker con `POST /workers` includendo `callback_url: "http://localhost:8801/push"`. Inviare un messaggio con `POST /messages` a quel workerId. Verificare che il worker HTTP riceva il POST push entro 5s. Poi fare `GET /messages/<workerId>?unread=true` e verificare che la lista sia vuota.
**Expected:** Worker riceve il payload `{id, from, to, body, timestamp}` via push; polling non mostra più il messaggio come unread.
**Why human:** Richiede due processi attivi con rete locale reale; comportamento di risposta HTTP non simulabile staticamente.

#### 2. Broadcast Fan-out con Worker Eterogenei

**Test:** Registrare due worker: uno con `callback_url` valida, uno senza. Inviare `POST /messages` con `to: "broadcast"`. Verificare che il worker con callback riceva la push (e non la veda via polling) e che il worker senza callback la veda via `GET /messages/<id>?unread=true`.
**Expected:** Fan-out selettivo — solo worker con `callback_url` ricevono push; gli altri rimangono su store-and-forward.
**Why human:** Richiede processi worker reali con comportamenti di rete differenti.

#### 3. Silent Fallback su Push Failure

**Test:** Registrare un worker con `callback_url` puntante a un endpoint che non risponde (porta chiusa o restituisce 503). Inviare un messaggio al worker. Attendere oltre 5s (timeout AbortSignal). Verificare che: (a) il mittente abbia ricevuto 201 immediatamente, (b) il messaggio sia ancora disponibile via polling, (c) nessun errore sia stato esposto.
**Expected:** Push silenziosamente fallisce; store-and-forward intatto; mittente non vede mai l'errore.
**Why human:** Simulare timeout di rete e comportamento 5xx non è verificabile con analisi statica.

### Gaps Summary

Nessun gap bloccante. Tutti i 10 must-have sono verificati staticamente. L'unica anomalia trovata è il JSDoc obsoleto alla riga 29 di `hub.mjs` (`read: boolean` invece di `readBy: Set`) — si tratta di un commento documentale non funzionale che non impatta il comportamento del server.

Tre scenari di comportamento runtime richiedono verifica umana (UAT) prima di considerare la fase completamente chiusa: unicast end-to-end, broadcast fan-out eterogeneo, e silent fallback su failure.

---

_Verified: 2026-04-19T13:40:00Z_
_Verifier: Claude (gsd-verifier)_
