---
name: codestra-worker-update
description: Aggiorna stato e/o task di un worker nell'hub Codestra. Usa PATCH /workers/:id.
argument-hint: <worker-id> <status> [task]
disable-model-invocation: true
---

Aggiorna stato e/o task di un worker registrato nell'hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Worker ID (`$0`): ID del worker da aggiornare (obbligatorio).
- Status (`$1`): nuovo stato — valori comuni: `idle`, `busy`, `done`, `error` (obbligatorio).
- Task (`$2`): descrizione breve del task corrente (opzionale).

## Istruzioni operative

Se `$0` o `$1` mancanti, informa l'utente e interrompi.

URL hub: usa `SWARM_HUB_URL` dall'env. Se assente, informa l'utente e interrompi.

Costruisci il body JSON:
- Se `$2` fornito: `{"status": "$1", "task": "$2"}`
- Altrimenti: `{"status": "$1"}`

Esegui:
```bash
curl -s -X PATCH \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  -H "Content-Type: application/json" \
  -d '{"status":"<status>","task":"<task>"}' \
  "$SWARM_HUB_URL/workers/<worker-id>" | jq .
```

## Output all'utente

Conferma aggiornamento con:
- Worker ID
- Nuovo status
- Task aggiornato (se fornito)
- Timestamp `lastSeen` restituito dall'hub

Se errore 404: "Worker `<id>` non trovato nell'hub."
