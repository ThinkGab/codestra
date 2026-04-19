---
name: codestra-workers
description: Lista tutti i worker registrati nell'hub Codestra. Mostra ID, ruolo, stato, task corrente e ultimo contatto.
argument-hint: [hub-url?]
disable-model-invocation: true
---

Lista tutti i worker registrati nell'hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Hub URL (`$0`): URL dell'hub (es. `http://192.168.1.10:7800`). Opzionale — se omesso, usa `SWARM_HUB_URL` dall'env.

## Istruzioni operative

Determina l'URL dell'hub:
- Se `$0` fornito: usa `$0`
- Altrimenti: usa `$SWARM_HUB_URL`
- Se nessuno dei due disponibile: informa l'utente e interrompi

Esegui:
```bash
curl -s \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "${HUB_URL}/workers" | jq .
```

Dove `HUB_URL` è il valore determinato sopra.

## Output all'utente

Mostra una tabella con colonne:
- `ID` — identificatore worker
- `Role` — ruolo assegnato
- `Status` — stato corrente (`idle`, `busy`, ecc.)
- `Task` — task corrente (troncato a 50 caratteri)
- `Last Seen` — timestamp ultimo contatto

Se nessun worker registrato, mostra: "Nessun worker registrato nell'hub."
