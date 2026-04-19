---
name: codestra-broadcast
description: Invia un messaggio broadcast a tutti i worker registrati nell'hub Codestra.
argument-hint: <sender-id> <messaggio>
disable-model-invocation: true
---

Invia un messaggio broadcast a tutti i worker nell'hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Sender ID (`$0`): ID del mittente — tipicamente il proprio worker ID o `"hub"` (obbligatorio).
- Messaggio (`$1...$N`): testo del messaggio (tutti gli argomenti dopo `$0` uniti come stringa).

## Istruzioni operative

Se `$0` mancante o nessun messaggio fornito, informa l'utente e interrompi.

URL hub: usa `SWARM_HUB_URL` dall'env. Se assente, informa l'utente e interrompi.

Body JSON:
```json
{
  "from": "<sender-id>",
  "to": "broadcast",
  "body": "<messaggio completo>"
}
```

Esegui:
```bash
curl -s -X POST \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  -H "Content-Type: application/json" \
  -d '{"from":"<sender-id>","to":"broadcast","body":"<messaggio>"}' \
  "$SWARM_HUB_URL/messages" | jq .
```

## Output all'utente

Conferma con:
- Message ID assegnato dall'hub
- Numero di worker che riceveranno il messaggio (se presente nella risposta)
- Timestamp invio
