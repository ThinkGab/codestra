# Phase 1: Slash Command Skills — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 4 (2 SKILL.md da creare, 1 manifest da aggiornare, 1 file da eliminare)
**Analogs found:** 2 / 4 (i SKILL.md sono stub vuoti; il manifest ha analogo identico duplicato)

---

## File Classification

| File da creare / modificare | Ruolo | Data Flow | Analogo più vicino | Qualità match |
|-----------------------------|-------|-----------|-------------------|---------------|
| `skills/codestra-start-hub/SKILL.md` | skill (prompt strutturato) | request-response | `skills/orchestrate/SKILL.md` (stub) | stub — pattern da RESEARCH.md |
| `skills/codestra-start-worker/SKILL.md` | skill (prompt strutturato) | request-response | `skills/messaging/SKILL.md` (stub) | stub — pattern da RESEARCH.md |
| `.claude-plugin/plugin.json` | config / manifest | — | `.claude-plugin/plugin.jsons` (identico) | exact (duplicato) |
| `.claude-plugin/plugin.jsons` | eliminare | — | `.claude-plugin/plugin.json` | exact (duplicato confermato) |

**Nota sulle directory:** `skills/orchestrate/` diventa `skills/codestra-start-hub/` e `skills/messaging/` diventa `skills/codestra-start-worker/` tramite rinomina (git mv). I SKILL.md stub contengono solo `---` (frontmatter vuoto) — non esiste nessun pattern reale da estrarre da essi.

---

## Pattern Assignments

### `skills/codestra-start-hub/SKILL.md` (skill, request-response)

**Analogo:** Nessun analogo funzionale esistente — i stub sono vuoti. Pattern da RESEARCH.md + analisi diretta di `servers/mcp-server.mjs` e `servers/hub.mjs`.

**Struttura frontmatter** (pattern da RESEARCH.md, sezione "Frontmatter fields"):
```yaml
---
name: codestra-start-hub
description: <frase che descrive quando usare il comando — usata nel menu />
argument-hint: [port] [ip]
disable-model-invocation: true
---
```

**Perché `disable-model-invocation: true`:** Questo comando avvia un processo in background (`nohup node hub.mjs`). Se Claude potesse auto-invocarlo, avvierebbe processi indesiderati. Campo obbligatorio su tutti i comandi con side-effects operativi.

**Parametri del tool MCP di riferimento** (`servers/mcp-server.mjs` righe 44-73):
```javascript
server.tool(
  "swarm_hub_start",
  "Start the Swarm Hub server as a background process...",
  {
    port: z.number().optional().describe("Port to listen on (default 7800)"),
    secret: z.string().optional().describe("Shared secret for auth (recommended on LAN)"),
  },
  async ({ port, secret }) => {
    const env = [];
    if (port) env.push(`SWARM_PORT=${port}`);
    if (secret) env.push(`SWARM_SECRET=${secret}`);
    const hubPath = new URL("./hub.mjs", import.meta.url).pathname;
    const cmd = `${env.join(" ")} nohup node ${hubPath} > /tmp/swarm-hub.log 2>&1 &`;
    // restituisce il comando bash da eseguire — Claude deve eseguirlo via Bash tool
  }
);
```

**Env var di `hub.mjs`** (righe 9-22) — fondamentale per la skill:
```javascript
// hub.mjs legge:
const PORT = parseInt(process.env.SWARM_PORT || "7800", 10);
const HOST = process.env.SWARM_HOST || "0.0.0.0";   // <-- NON è un param del tool MCP
const SECRET = process.env.SWARM_SECRET || "";
// Avvio: server.listen(PORT, HOST, ...)
```

**Implicazione critica per la skill:** Il parametro `[ip]` (CMD-01) NON può essere passato a `swarm_hub_start` perché il tool non accetta `host`. La SKILL.md deve istruire Claude a:
1. Usare `swarm_hub_start` con solo `port` quando `$1` non è specificato
2. Costruire il comando bash manuale con `SWARM_HOST=$1` quando `$1` è presente

**Pattern istruzioni skill** (da RESEARCH.md righe 187-193, adattato ai dati reali):
```
Parametri:
- Porta ($0): passata come `port` a swarm_hub_start. Default: 7800 se omessa.
- IP binding ($1): NON supportato da swarm_hub_start — hub.mjs legge SWARM_HOST da env.
  Se $1 è specificato, costruisci il comando bash direttamente:
  `SWARM_HOST=$1 SWARM_PORT=$0 nohup node <hub-path> > /tmp/swarm-hub.log 2>&1 &`
  dove <hub-path> è il path assoluto di servers/hub.mjs nel plugin installato.

Dopo l'avvio, verifica con: curl http://localhost:${0:-7800}/health
```

---

### `skills/codestra-start-worker/SKILL.md` (skill, request-response)

**Analogo:** Nessun analogo funzionale esistente — stub vuoto. Pattern da RESEARCH.md + analisi di `servers/mcp-server.mjs`.

**Struttura frontmatter:**
```yaml
---
name: codestra-start-worker
description: <frase che descrive quando usare il comando — usata nel menu />
argument-hint: [hub-ip] [hub-port] [worker-port?]
disable-model-invocation: true
---
```

**Parametri del tool MCP di riferimento** (`servers/mcp-server.mjs` righe 98-126):
```javascript
server.tool(
  "swarm_register",
  "Register this Claude Code instance with the hub...",
  {
    role: z.enum(["leader", "worker"]).optional(),
    task: z.string().optional(),
  },
  async ({ role, task }) => {
    const body = { role: role || ROLE, task: task || "idle", cwd: process.cwd() };
    // POST a HUB_URL/workers
  }
);
```

**Env var del MCP server** (`servers/mcp-server.mjs` righe 10-23) — fondamentale per la skill:
```javascript
// mcp-server.mjs legge:
const HUB_URL = process.env.SWARM_HUB_URL || "http://localhost:7800";
const ROLE    = process.env.SWARM_ROLE    || "worker";
const SECRET  = process.env.SWARM_SECRET  || "";
```

**Implicazione critica per la skill:** `swarm_register` si connette a `HUB_URL` che è una env var impostata al momento del lancio del MCP server — non è un parametro runtime del tool. Gli argomenti `[hub-ip]` e `[hub-port]` (CMD-02) non possono essere passati a `swarm_register` direttamente. La SKILL.md deve:
1. Informare l'utente che `SWARM_HUB_URL` deve essere configurata in `.mcp.json` o via env prima di invocare la skill
2. Oppure — scelta alternativa — invocare `swarm_register` assumendo che `SWARM_HUB_URL` sia già settata con `$0:$1`, lasciando la configurazione al piano

**Pattern istruzioni skill:**
```
Parametri:
- Hub IP ($0): indirizzo dell'istanza hub (es. 192.168.1.10)
- Hub Port ($1): porta dell'hub (default: 7800 se omessa)
- Worker port ($2): non usato da swarm_register — il worker non apre porte proprie

swarm_register usa SWARM_HUB_URL dall'ambiente. Verifica che punti a http://$0:${1:-7800}.
Poi invoca swarm_register con role="worker" e task=descrizione del lavoro corrente.
```

---

### `.claude-plugin/plugin.json` (config / manifest)

**Analogo:** `.claude-plugin/plugin.jsons` — contenuto identico confermato (stesso file, typo nella estensione).

**Contenuto attuale** (righe 1-10):
```json
{
  "name": "claude-swarm",
  "version": "0.1.0",
  "description": "Orchestrate multiple Claude Code instances via MCP with Hub & Spoke architecture. Spawn workers, send messages, and coordinate tasks across LAN.",
  "author": { "name": "Gabriele Di Lelio" },
  "keywords": ["orchestration", "multi-agent", "swarm", "mcp", "networking"],
  "mcpServers": "./.mcp.json"
}
```

**Decisione da confermare nel piano:** Il campo `name: "claude-swarm"` determina il namespace del comando: `/claude-swarm:codestra-start-hub`. Se si vuole `/codestra:codestra-start-hub`, il `name` va cambiato in `"codestra"`. Questa è una scelta di branding — non tecnica. Il piano deve includere una decisione esplicita.

**Nessuna altra modifica richiesta:** Claude Code autodiscopre `skills/` automaticamente — nessun campo `skills` da aggiungere al manifest.

---

### `.claude-plugin/plugin.jsons` (eliminare)

**Motivazione:** Contenuto byte-per-byte identico a `plugin.json`. È un errore di battitura nella estensione. Claude Code non lo legge (non è un filename riconosciuto), ma la sua presenza crea confusione.

**Azione nel piano:** `git rm .claude-plugin/plugin.jsons` nel Wave 0, prima di qualsiasi altra modifica.

---

## Shared Patterns

### Pattern 1: Frontmatter obbligatorio per skill con side-effects

**Si applica a:** Entrambi i SKILL.md

```yaml
disable-model-invocation: true
```

Questo campo va sempre incluso quando la skill avvia processi, registra servizi, o ha qualunque effetto collaterale irreversibile. Il default è `false`, che consentirebbe a Claude di invocare il comando autonomamente.

### Pattern 2: Interpolazione argomenti posizionali

**Si applica a:** Entrambi i SKILL.md

| Variabile | Significato |
|-----------|------------|
| `$ARGUMENTS` | Tutti gli argomenti come stringa unica |
| `$0` | Primo argomento (es. porta) |
| `$1` | Secondo argomento (es. ip o hub-port) |
| `$2` | Terzo argomento (es. worker-port) |

Claude Code sostituisce queste variabili prima che Claude veda il testo della skill. Non serve logica di parsing nella skill.

### Pattern 3: Gap tool MCP — argomenti non supportati come parametri runtime

**Si applica a:** Entrambi i SKILL.md (problema architetturale da documentare nel piano)

| Skill | Argomento utente | Tool MCP | Gap |
|-------|-----------------|----------|-----|
| `codestra-start-hub` | `[ip]` | `swarm_hub_start` non ha param `host` | hub.mjs legge `SWARM_HOST` da env — la skill deve costruire il comando bash direttamente |
| `codestra-start-worker` | `[hub-ip]`, `[hub-port]` | `swarm_register` non ha param `hubUrl` | mcp-server.mjs legge `SWARM_HUB_URL` da env — la skill deve documentare il prerequisito |

Il piano deve decidere esplicitamente come gestire questi gap (workaround nella SKILL.md, oppure estensione dei tool MCP in una fase successiva).

---

## No Analog Found

| File | Ruolo | Motivo |
|------|-------|--------|
| `skills/codestra-start-hub/SKILL.md` | skill / prompt strutturato | Gli unici SKILL.md esistenti nel repo sono stub vuoti (`---`). Nessun esempio funzionale nel codebase. Il pattern viene da RESEARCH.md e dalla spec ufficiale Claude Code Agent Skills. |
| `skills/codestra-start-worker/SKILL.md` | skill / prompt strutturato | Stesso motivo. |

---

## Metadata

**Scope ricerca analog:** `/home/g/Documenti/codestra/skills/`, `/home/g/Documenti/codestra/.claude-plugin/`
**File sorgente analizzati:** `servers/mcp-server.mjs` (righe 1-126), `servers/hub.mjs` (righe 1-22), `.claude-plugin/plugin.json`, `.claude-plugin/plugin.jsons`, `skills/orchestrate/SKILL.md`, `skills/messaging/SKILL.md`
**Data estrazione pattern:** 2026-04-19
