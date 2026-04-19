---
name: codestra-gsd-parallel
description: Esegue una fase GSD in parallelo distribuendo i piani sui worker Codestra disponibili. Sostituisce gsd-execute-phase quando ci sono worker idle.
argument-hint: <phase-number> [plan-ids...]
disable-model-invocation: false
---

Esegue una fase GSD in parallelo distribuendo i piani sui worker Codestra registrati nell'hub.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Phase (`$0`): numero di fase GSD da eseguire (obbligatorio, es. `03`).
- Plan IDs (`$1...$N`): piani specifici da distribuire. Opzionale — se omessi, legge tutti i piani dal PLAN.md della fase.

## Fase 1 — Prerequisiti

Verifica:
1. `SWARM_HUB_URL` nell'env. Se assente, informa utente e suggerisci di usare `/gsd-execute-phase` standard.
2. File `.planning/phases/<phase>/PLAN.md` esiste. Se assente, suggerisci `/gsd-plan-phase $0` prima.

Leggi PLAN.md e identifica i piani disponibili (sezioni con ID tipo `03-01`, `03-02`, ecc.).

## Fase 2 — Scoperta worker

```bash
curl -s \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "$SWARM_HUB_URL/workers"
```

Filtra worker con `status: "idle"`. Se nessun worker idle:
- Mostra worker disponibili con loro stato
- Chiedi all'utente: "Nessun worker idle. Eseguire in locale con /gsd-execute-phase? [s/n]"
- Se sì: esegui skill `gsd-execute-phase` con `$0`
- Se no: interrompi

## Fase 3 — Assignment

Abbina piani a worker (round-robin se piani > worker):

| Piano | Worker ID | Comando |
|-------|-----------|---------|
| 03-01 | wkr-abc | `/gsd-execute-plan 03 03-01` |
| 03-02 | wkr-xyz | `/gsd-execute-plan 03 03-02` |

Se piani > worker disponibili: informa l'utente, chiedi conferma (i piani in eccesso aspetteranno worker liberi).

## Fase 4 — Dispatch

Per ogni coppia piano-worker, invia task via messaggio:

```bash
curl -s -X POST \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"hub\",\"to\":\"<worker-id>\",\"body\":\"/gsd-execute-plan $0 <plan-id>\"}" \
  "$SWARM_HUB_URL/messages"
```

Mostra tabella dispatch con timestamp invio per ogni piano.

## Fase 5 — Monitoraggio

Poll ogni 30 secondi lo stato di tutti i worker assegnati:

```bash
curl -s \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "$SWARM_HUB_URL/workers"
```

Mostra aggiornamento stato ad ogni poll:
```
[HH:MM:SS] Piano 03-01 → wkr-abc: busy (60s)
[HH:MM:SS] Piano 03-02 → wkr-xyz: done ✓
```

Continua fino a che tutti i worker assegnati sono `done` o `error`.

## Fase 6 — Risultati

Leggi messaggi di risposta dall'hub:
```bash
curl -s \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "$SWARM_HUB_URL/messages/hub?unread=true"
```

Mostra riepilogo finale:
```
Fase $0 — Esecuzione parallela completata

✓ 03-01 (wkr-abc) — completato in 4m 32s
✓ 03-02 (wkr-xyz) — completato in 3m 18s
✗ 03-03 (wkr-def) — errore: <dettaglio>

Piani riusciti: 2/3
```

Se ci sono errori: suggerisci `/gsd-execute-plan $0 <plan-id>` per ri-eseguire i piani falliti.

## Note operative

- **Dipendenze tra piani**: GSD non garantisce ordine in modalità parallela. L'utente è responsabile di distribuire solo piani indipendenti, o specificare `$1...$N` esplicitamente.
- **Worker lenti**: se un worker non risponde entro 10 minuti, mostra warning ma continua monitoring.
- **Fallback**: se hub non raggiungibile durante monitoring, offri di continuare in locale.
