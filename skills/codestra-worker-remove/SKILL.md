---
name: codestra-worker-remove
description: Rimuove un worker dall'hub Codestra. Usa DELETE /workers/:id.
argument-hint: <worker-id>
disable-model-invocation: true
---

Rimuove un worker registrato dall'hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Worker ID (`$0`): ID del worker da rimuovere (obbligatorio).

## Istruzioni operative

Se `$0` mancante, informa l'utente e interrompi.

URL hub: usa `SWARM_HUB_URL` dall'env. Se assente, informa l'utente e interrompi.

Esegui:
```bash
curl -s -X DELETE \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "$SWARM_HUB_URL/workers/$0" | jq .
```

## Output all'utente

- Se `deleted: true`: "Worker `<id>` rimosso con successo."
- Se `deleted: false`: "Worker `<id>` non era presente nell'hub."
- Se errore di rete: mostra l'errore raw e suggerisci di verificare `SWARM_HUB_URL`.
