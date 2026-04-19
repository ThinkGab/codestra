---
name: codestra-start-hub
description: Avvia il Swarm Hub Codestra su questa istanza Claude Code. Usare quando si vuole essere il nodo centrale dello swarm. Gli altri Claude Code si registreranno come worker su questo hub.
argument-hint: [port] [ip]
disable-model-invocation: true
---

Avvia il Swarm Hub Codestra su questa istanza.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Porta (`$0`): porta su cui l'hub ascolta le connessioni. Default: 7800 se non specificato.
- IP binding (`$1`): indirizzo IP su cui l'hub si lega. Default: 0.0.0.0 (tutte le interfacce, accesso LAN). Specificare un IP esplicito per restringere l'accesso a una sola interfaccia.

## Istruzioni operative

**Caso A — Solo porta specificata (o nessun argomento):**
Usa il tool `swarm_hub_start` con `port=$0`.
- Se nessun argomento: chiama `swarm_hub_start` senza parametri (usa default 7800).
- Se solo `$0` fornito: chiama `swarm_hub_start` con `port=$0`.
- Il tool restituisce un comando bash: eseguilo via Bash tool.

**Caso B — Porta e IP specificati ($1 presente):**
Il tool `swarm_hub_start` non supporta il parametro host direttamente — hub.mjs legge `SWARM_HOST` da env var.
Costruisci e lancia il comando bash direttamente:

```bash
SWARM_HOST=$1 SWARM_PORT=$0 nohup node "${CLAUDE_SKILL_DIR}/../../servers/hub.mjs" > /tmp/swarm-hub.log 2>&1 &
```

Se `$0` non è specificato, ometti `SWARM_PORT` (verrà usato il default 7800).

## Verifica avvio

Dopo aver eseguito il comando bash, attendi 1 secondo e verifica con:

```bash
curl http://localhost:${0:-7800}/health
```

Risposta attesa: `{"status":"ok"}` o simile JSON con stato dell'hub.

## Output all'utente

Mostra all'utente:
- L'URL dell'hub: `http://<ip-o-localhost>:<porta>`
- Come i worker possono registrarsi: `SWARM_HUB_URL=http://<ip>:<porta>` da impostare nel loro `.mcp.json`
- Il log dell'hub: `/tmp/swarm-hub.log`
