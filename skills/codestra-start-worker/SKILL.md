---
name: codestra-start-worker
description: Registra questa istanza Claude Code come worker nel Swarm Hub Codestra. Specificare l'indirizzo IP e la porta dell'hub. Il worker-port è opzionale (sarà utilizzato nella Fase 2 per comunicazione push bidirezionale).
argument-hint: [hub-ip] [hub-port] [worker-port?] [swarm-id?]
disable-model-invocation: true
---

Registra questa istanza Claude Code come worker nel Swarm Hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Hub IP (`$0`): indirizzo IP dell'istanza hub (es. `192.168.1.10` o `localhost`).
- Hub Port (`$1`): porta dell'hub (es. `7800`). Default: 7800 se non specificato.
- Worker Port (`$2`): opzionale — porta per il server HTTP del worker. Se fornito, passare come `workerPort` al tool `swarm_register`. Se omesso, l'OS assegna automaticamente una porta libera.
- Swarm ID (`$3`): opzionale — ID univoco da assegnare a questo worker. Se fornito, passare come `swarmId` al tool `swarm_register`. Se omesso, il MCP server usa `SWARM_ID` dall'env (se configurata).

## Prerequisito

Il tool `swarm_register` si connette all'hub tramite `SWARM_HUB_URL`, che viene letta dalla variabile d'ambiente al momento dell'avvio del MCP server — non è un parametro runtime del tool.

Prima di invocare `swarm_register`, verifica che `SWARM_HUB_URL` nel file `.mcp.json` di questa istanza punti a `http://$0:${1:-7800}`. Se non corrisponde, informa l'utente e chiedi di aggiornare `.mcp.json` e riavviare Claude Code, oppure segui le istruzioni nel prossimo paragrafo.

**Se SWARM_HUB_URL non è configurata o punta all'hub sbagliato:**
Informa l'utente che deve aggiornare `.mcp.json`. Prima di mostrare lo snippet, sostituisci `<hub-ip>` con il valore di `$0` e `<hub-port>` con il valore di `$1` (o `7800` se non specificato):
```json
{
  "mcpServers": {
    "codestra": {
      "env": {
        "SWARM_HUB_URL": "http://<hub-ip>:<hub-port>"
      }
    }
  }
}
```
Dopo l'aggiornamento, l'utente deve riavviare Claude Code per applicare la nuova env var.

## Istruzioni operative

Una volta verificato che `SWARM_HUB_URL` punta all'hub corretto:

1. Usa il tool `swarm_register` con:
   - `role`: `"worker"` (oppure ometti se `SWARM_ROLE` è già configurata nell'env)
   - `task`: breve descrizione del lavoro che questo worker svolgerà (chiedere all'utente se non noto)
   - `workerPort`: se `$2` è fornito, passare il suo valore numerico; altrimenti omettere (l'OS assegnerà la porta)
   - `swarmId`: se `$3` è fornito, passare il suo valore stringa; altrimenti omettere (il server usa l'env var)

2. Verifica la risposta del tool — deve contenere un worker ID assegnato dall'hub.

## Output all'utente

Mostra all'utente:
- Il worker ID assegnato dall'hub
- L'URL dell'hub a cui è connesso: `http://$0:${1:-7800}`
- Conferma che il worker è ora registrato e in ascolto di task
- La `callback_url` del worker HTTP server (restituita da `swarm_register` nella risposta)
