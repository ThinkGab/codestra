---
name: codestra-worker-daemon
description: Mette questa istanza Claude Code in modalità worker daemon. Registra nell'hub, polling continuo per task GSD, esecuzione automatica, report stato.
argument-hint: [hub-url] [poll-interval-seconds?]
disable-model-invocation: false
---

Mette questa istanza Claude Code in modalità worker daemon per esecuzione parallela di task GSD.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Hub URL (`$0`): URL dell'hub (es. `http://192.168.1.10:7800`). Opzionale — usa `SWARM_HUB_URL` se omesso.
- Poll interval (`$1`): secondi tra ogni poll (default: 30).

## Fase 1 — Registrazione

Determina HUB_URL:
- Se `$0` fornito: usa `$0`
- Altrimenti: usa `SWARM_HUB_URL` dall'env
- Se nessuno: informa utente e interrompi

Usa il tool `swarm_register` per registrare questa istanza con:
- `role`: `"worker"`
- `status`: `"idle"`
- `task`: `"daemon — in attesa di task GSD"`

Salva il `worker_id` restituito. Mostra all'utente:
```
Worker registrato: <worker_id>
Hub: <hub_url>
Poll interval: <N>s
In attesa di task...
```

## Fase 2 — Polling loop

Ripeti ogni `$1` secondi (default 30) usando il tool `swarm_get_messages` o, se non disponibile, via Bash:

```bash
curl -s \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "<HUB_URL>/messages/<worker_id>?unread=true"
```

Per ogni messaggio ricevuto:

### 2a — Parse task

Il body del messaggio contiene il comando da eseguire. Formato atteso:
```
/gsd-execute-plan <phase> <plan-id>
```
oppure qualsiasi comando GSD o istruzione testuale.

### 2b — Esecuzione task

1. Aggiorna stato worker a `busy` con il task ricevuto:
```bash
curl -s -X PATCH \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"busy\",\"task\":\"<body-messaggio>\"}" \
  "<HUB_URL>/workers/<worker_id>"
```

2. Esegui il task:
   - Se body inizia con `/gsd-`: invoca la skill GSD corrispondente (es. `/gsd-execute-plan 03 03-01` → usa skill `gsd-execute-plan` con argomenti `03 03-01`)
   - Se body è testo libero: esegui come istruzione diretta

3. Al completamento (successo o errore), aggiorna stato:
```bash
# Successo
curl -s -X PATCH \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"done\",\"task\":\"completed: <task>\"}" \
  "<HUB_URL>/workers/<worker_id>"

# Errore
curl -s -X PATCH \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"error\",\"task\":\"failed: <task>\"}" \
  "<HUB_URL>/workers/<worker_id>"
```

4. Invia messaggio di risposta all'hub con risultato:
```bash
curl -s -X POST \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"<worker_id>\",\"to\":\"hub\",\"body\":\"DONE: <task> | status: <ok|error>\"}" \
  "<HUB_URL>/messages"
```

5. Torna a `idle` e riprendi polling.

## Uscita dal daemon

Il loop termina se:
- L'utente interrompe manualmente (Ctrl+C o stop)
- Arriva messaggio con body `SHUTDOWN` o `EXIT`
- Tre errori di rete consecutivi

All'uscita, rimuovi il worker dall'hub:
```bash
curl -s -X DELETE \
  ${SWARM_SECRET:+-H "Authorization: Bearer $SWARM_SECRET"} \
  "<HUB_URL>/workers/<worker_id>"
```

Mostra: "Worker <worker_id> rimosso dall'hub. Daemon terminato."
