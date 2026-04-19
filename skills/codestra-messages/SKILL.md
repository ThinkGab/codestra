---
name: codestra-messages
description: Legge i messaggi in arrivo per un worker dall'hub Codestra. Supporta filtro solo non letti.
argument-hint: <worker-id> [unread]
disable-model-invocation: true
---

Legge i messaggi destinati a un worker dall'hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Worker ID (`$0`): ID del worker per cui leggere i messaggi (obbligatorio).
- Filtro (`$1`): se `unread` o `--unread`, mostra solo messaggi non ancora letti. Opzionale.

## Istruzioni operative

Se `$0` mancante, informa l'utente e interrompi.

URL hub: usa `SWARM_HUB_URL` dall'env. Se assente, informa l'utente e interrompi.

Determina query string:
- Se `$1` è `unread` o `--unread`: aggiungi `?unread=true`
- Altrimenti: nessun query param

Esegui:
```bash
curl -s \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "$SWARM_HUB_URL/messages/$0${UNREAD_PARAM}" | jq .
```

Nota: la lettura marca automaticamente i messaggi come letti per questo worker.

## Output all'utente

Mostra ogni messaggio con:
- `ID` — identificatore messaggio
- `From` — mittente
- `Body` — testo del messaggio
- `Timestamp` — data/ora invio

Se nessun messaggio: "Nessun messaggio per worker `<id>`."
