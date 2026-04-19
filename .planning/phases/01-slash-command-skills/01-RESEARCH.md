# Phase 1: Slash Command Skills — Research

**Researched:** 2026-04-19
**Domain:** Claude Code plugin skill files (SKILL.md), plugin manifest, slash command wiring
**Confidence:** HIGH

---

## Summary

Phase 1 consiste esclusivamente nella scrittura del contenuto dei due file `SKILL.md` stub già presenti nel repository: `skills/orchestrate/SKILL.md` (che diventa `/claude-swarm:orchestrate`) e `skills/messaging/SKILL.md` (che diventa `/claude-swarm:messaging`). I requirement CMD-01 e CMD-02 richiedono che l'utente possa invocare rispettivamente `/codestra-start-hub [port] [ip]` e `/codestra-start-worker [hub-ip] [hub-port] [worker-port?]`, ma il nome dei comandi nel manifest non è `codestra-start-hub` — la struttura delle skill directory determina il nome. Questo è il punto critico da chiarire nel piano.

Il formato SKILL.md è ben documentato e stabile. Il manifest `plugin.json` esistente non ha bisogno di un campo `skills` esplicito — Claude Code scopre automaticamente la directory `skills/` alla radice del plugin. L'unica questione tecnica aperta è il nome delle skill directory: i nomi attuali (`orchestrate`, `messaging`) non corrispondono ai nomi dei comandi richiesti nei requirement (`codestra-start-hub`, `codestra-start-worker`). Il piano dovrà quindi rinominare le directory oppure il team ha scelto nomi diversi da quelli nei requirement.

Il file `plugin.jsons` (con la `s` finale) è confermato essere un duplicato identico di `plugin.json` — può essere eliminato o ignorato senza impatto funzionale.

**Raccomandazione primaria:** Rinominare `skills/orchestrate/` in `skills/codestra-start-hub/` e `skills/messaging/` in `skills/codestra-start-worker/`, poi scrivere il contenuto SKILL.md con frontmatter corretto e istruzioni che guidano Claude a invocare `swarm_hub_start` o `swarm_register` via MCP.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMD-01 | Utente può eseguire `/codestra-start-hub [port] [ip]` per avviare l'hub con binding configurabile (default port 7800, default ip 0.0.0.0) | Il tool MCP `swarm_hub_start` in `mcp-server.mjs` accetta `port` e `secret`. L'ip/host non è un parametro del tool — viene passato come env var `SWARM_HOST`. La SKILL.md deve costruire il comando bash corretto. |
| CMD-02 | Utente può eseguire `/codestra-start-worker [hub-ip] [hub-port] [worker-port?]` per registrare l'istanza come worker con comunicazione bidirezionale | Il tool MCP `swarm_register` in `mcp-server.mjs` accetta `role` e `task`. La SKILL.md deve impostare `SWARM_HUB_URL` e chiamare `swarm_register`. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Slash command routing | Plugin Layer (Claude Code) | — | `skills/<name>/SKILL.md` determina il nome del comando; Claude Code gestisce il dispatch |
| Argomenti al comando | SKILL.md (frontmatter + $ARGUMENTS) | — | `argument-hint` in frontmatter, `$ARGUMENTS[N]` per accesso posizionale |
| Avvio hub HTTP | Hub Layer (`servers/hub.mjs`) | MCP Bridge | La SKILL.md guida Claude a invocare il tool `swarm_hub_start` che produce il comando bash |
| Registrazione worker | MCP Bridge (`mcp-server.mjs`) | Hub Layer | La SKILL.md guida Claude a invocare `swarm_register` con i parametri corretti |
| Namespace comandi | Plugin manifest (plugin.json) | — | Il campo `name` in plugin.json determina il prefisso: `/claude-swarm:skill-name` |

---

## Standard Stack

### Core
| Componente | Versione | Scopo | Perché standard |
|------------|----------|-------|----------------|
| SKILL.md (formato Agent Skills) | Spec aggiornata aprile 2026 | Definisce uno slash command nel plugin | Standard ufficiale Claude Code per plugin skills |
| YAML frontmatter | — | Configura nome, description, argument-hint, disable-model-invocation | Parsed da Claude Code al momento del caricamento del plugin |
| `$ARGUMENTS` / `$0`, `$1`, ... | — | Accesso posizionale agli argomenti passati dall'utente | Interpolazione nativa Claude Code |
| `${CLAUDE_SKILL_DIR}` | — | Riferimento a file bundled con la skill | Utile se la skill deve referenziare script nel plugin |

### Nessuna dipendenza aggiuntiva
Phase 1 è pura scrittura di markdown — nessun pacchetto npm, nessun codice da compilare.

---

## Architecture Patterns

### Come funziona una plugin skill come slash command

```
Utente digita: /claude-swarm:codestra-start-hub 8080 192.168.1.1
                       │                │           │    │
                       │                │           $0   $1
                 plugin name       skill dir name
                 (in plugin.json)  (cartella in skills/)
                                   ↓
                 Claude Code carica skills/codestra-start-hub/SKILL.md
                 Sostituisce $ARGUMENTS con "8080 192.168.1.1"
                 Invia il contenuto renderizzato come messaggio a Claude
                       ↓
                 Claude esegue le istruzioni nella skill
                 (invoca swarm_hub_start, costruisce env vars, ecc.)
```

### Struttura directory del plugin (post-rinomina)

```
codestra/                        # plugin root
├── .claude-plugin/
│   └── plugin.json              # name: "claude-swarm" → namespace
├── skills/
│   ├── codestra-start-hub/      # → /claude-swarm:codestra-start-hub
│   │   └── SKILL.md
│   └── codestra-start-worker/   # → /claude-swarm:codestra-start-worker
│       └── SKILL.md
├── servers/
│   ├── hub.mjs
│   └── mcp-server.mjs
└── .mcp.json
```

### Pattern SKILL.md per comandi con argomenti

```yaml
---
name: codestra-start-hub
description: Avvia il Swarm Hub su questa istanza Claude Code. Usare quando si vuole essere il nodo centrale dello swarm.
argument-hint: [port] [ip]
disable-model-invocation: true
---

Avvia l'hub Codestra con questi parametri:
- Port: $0 (default: 7800 se non specificato)
- Host/IP: $1 (default: 0.0.0.0 se non specificato)

Usa il tool `swarm_hub_start` con port=$0.
Se $1 è specificato, costruisci il comando con SWARM_HOST=$1.

Verifica con: curl http://localhost:${0:-7800}/health
```

### Frontmatter fields rilevanti per questa fase

| Campo | Valore raccomandato | Motivo |
|-------|--------------------|----|
| `name` | `codestra-start-hub` | Il nome diventa parte del comando dopo il namespace |
| `description` | Frase che descrive quando usare il comando | Usata da Claude per auto-invocazione e nel menu `/` |
| `argument-hint` | `[port] [ip]` oppure `[hub-ip] [hub-port] [worker-port?]` | Mostrata nell'autocomplete come suggerimento |
| `disable-model-invocation` | `true` | Comandi con side-effects (avviare server) NON devono essere auto-invocati da Claude |

---

## Don't Hand-Roll

| Problema | Non costruire | Usare invece | Perché |
|----------|--------------|-------------|--------|
| Parsing argomenti | Parser custom di `$ARGUMENTS` | `$0`, `$1`, `$ARGUMENTS[N]` nativo | Claude Code interpola prima che Claude veda il testo |
| Namespace comandi | Campo `skills` esplicito in plugin.json | Directory name in `skills/` | Autodiscovery automatico — nessun campo manifesto richiesto |
| Default values | Logica condizionale nella skill | Documentare i default nel testo | Claude gestisce i default dalla descrizione; il tool MCP già li implementa |

**Insight chiave:** La SKILL.md non è codice — è un prompt strutturato. Non deve gestire logica condizionale complessa. Deve descrivere chiaramente a Claude cosa fare con gli argomenti ricevuti, lasciando che siano i tool MCP a gestire i default.

---

## Common Pitfalls

### Pitfall 1: Nomi directory skill non corrispondono ai requirement
**Cosa va storto:** I nomi attuali (`orchestrate`, `messaging`) non corrispondono a `codestra-start-hub` / `codestra-start-worker`. Il comando diventa `/claude-swarm:orchestrate`, non quello richiesto.
**Perché succede:** Le stub sono state create con nomi concettuali, non con i nomi finali del comando.
**Come evitare:** Rinominare le directory nel Wave 0 del piano. Git mv per preservare la history.
**Segnali d'allarme:** Invocare `/claude-swarm:orchestrate` invece di `/claude-swarm:codestra-start-hub`.

### Pitfall 2: `disable-model-invocation` dimenticato su comandi con side-effects
**Cosa va storto:** Claude invoca automaticamente `/codestra-start-hub` quando ritiene appropriato, avviando processi in background senza che l'utente lo voglia.
**Perché succede:** Il default di `disable-model-invocation` è `false`.
**Come evitare:** Impostare `disable-model-invocation: true` su entrambe le skill. Sono comandi operativi, non reference knowledge.

### Pitfall 3: Il tool `swarm_hub_start` non espone `host/ip` come parametro
**Cosa va storto:** CMD-01 richiede `[ip]` come argomento, ma `swarm_hub_start` in `mcp-server.mjs` accetta solo `port` e `secret` — non `host`.
**Perché succede:** `hub.mjs` legge `SWARM_HOST` da env var, non da parametro del tool.
**Come evitare:** La SKILL.md per l'hub deve istruire Claude a costruire il comando bash con `SWARM_HOST=$1 SWARM_PORT=$0 node hub.mjs` anziché affidarsi solo al tool MCP. Oppure il tool va esteso (fuori scope della fase 1). **Decisione da prendere nel piano.**

### Pitfall 4: `plugin.jsons` lasciato in repo causa confusione
**Cosa va storto:** Presenza di due manifest (`plugin.json` e `plugin.jsons`) con contenuto identico può confondere Claude Code o sviluppatori futuri.
**Perché succede:** Probabilmente errore di battitura durante la creazione iniziale.
**Come evitare:** Eliminare `plugin.jsons` nel Wave 0 del piano.

### Pitfall 5: Il nome del plugin nel manifest è `claude-swarm`, non `codestra`
**Cosa va storto:** Il comando slash sarà `/claude-swarm:codestra-start-hub`, non `/codestra:codestra-start-hub`.
**Perché succede:** Il `name` in `plugin.json` è `"claude-swarm"` (nome originale pre-rebrand).
**Come evitare:** Decidere se aggiornare il `name` in `plugin.json` a `"codestra"` per ottenere `/codestra:codestra-start-hub`. Questa è una decisione di branding che impatta il namespace. Da confermare con il team.

---

## Code Examples

### SKILL.md minima valida per plugin skill con argomenti (fonte: docs ufficiali)

```yaml
---
name: codestra-start-hub
description: Avvia il Swarm Hub su questa istanza. Usare quando si desidera essere il nodo centrale dello swarm. Specificare porta e IP di binding opzionali.
argument-hint: [port] [ip]
disable-model-invocation: true
---

Avvia il Swarm Hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Porta: $0 (se non specificato: usa il default 7800)
- IP binding: $1 (se non specificato: usa 0.0.0.0 per accesso LAN)

Istruzioni:
1. Usa il tool `swarm_hub_start` passando port=$0 se fornito.
2. Se è specificato un IP ($1), il tool non supporta questo parametro direttamente —
   costruisci il comando bash: `SWARM_HOST=$1 SWARM_PORT=$0 nohup node <path>/hub.mjs > /tmp/swarm-hub.log 2>&1 &`
3. Verifica l'avvio con: `curl http://localhost:${0:-7800}/health`
4. Mostra l'URL dell'hub all'utente.
```

```yaml
---
name: codestra-start-worker
description: Registra questa istanza Claude Code come worker nel swarm. Specificare hub-ip e hub-port. Il worker-port è opzionale (default: assegnato dal sistema).
argument-hint: [hub-ip] [hub-port] [worker-port?]
disable-model-invocation: true
---

Registra questa istanza come worker nel Swarm Hub Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Hub IP: $0 (es. 192.168.1.100 o localhost)
- Hub Port: $1 (es. 7800)
- Worker Port: $2 (opzionale — fase 2 del progetto)

Istruzioni:
1. Imposta `SWARM_HUB_URL=http://$0:$1` nell'ambiente.
2. Usa il tool `swarm_register` per registrare questa istanza con role=worker.
3. Mostra il worker ID assegnato dall'hub.
4. Nota: il worker-port ($2) sarà utilizzato nella Fase 2 (Worker HTTP Server) — per ora ignorarlo se fornito.
```

### Come Claude Code gestisce gli argomenti posizionali

```
/claude-swarm:codestra-start-hub 8080 192.168.1.5
                                  │    │
                                 $0   $1
                          $ARGUMENTS = "8080 192.168.1.5"
```

---

## Stato del Manifest (`plugin.json`)

**Trovato:** `.claude-plugin/plugin.json` con contenuto:

```json
{
  "name": "claude-swarm",
  "version": "0.1.0",
  "description": "...",
  "author": { "name": "Gabriele Di Lelio" },
  "keywords": [...],
  "mcpServers": "./.mcp.json"
}
```

**Analisi:**
- Il campo `skills` NON è richiesto — Claude Code scopre automaticamente la directory `skills/` alla radice del plugin. [VERIFIED: docs ufficiali plugins]
- Il campo `mcpServers` punta a `.mcp.json` — corretto per collegare i tool MCP.
- Il `name: "claude-swarm"` determina il namespace: le skill saranno `/claude-swarm:codestra-start-hub`. [VERIFIED: docs ufficiali]
- `plugin.jsons` è un duplicato confermato — stesso contenuto, filename con typo. [VERIFIED: ispezione diretta file]

**Cosa cambia in questa fase:**
- Nessuna modifica a `plugin.json` strettamente necessaria per far funzionare le skill.
- **Decisione aperta:** rinominare `name` da `"claude-swarm"` a `"codestra"` per allineamento al rebrand.

---

## Stato del Art

| Vecchio Approccio | Approccio Attuale | Cambiato | Impatto |
|-------------------|-------------------|----------|---------|
| `.claude/commands/<name>.md` (file flat) | `skills/<name>/SKILL.md` (directory) | Prima del 2026 | Skills sono la forma raccomandata; commands continuano a funzionare |
| `name` frontmatter obbligatorio | `name` frontmatter opzionale (usa directory name) | Aggiornamento recente | Il nome della directory è già il nome del comando |
| Nessun `argument-hint` | `argument-hint` in frontmatter | Recente | Migliora l'UX dell'autocomplete |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 1 è scrittura pura di file markdown. Nessuna dipendenza esterna, nessun tool da installare, nessun server da avviare durante questa fase.

---

## Assumptions Log

| # | Claim | Sezione | Rischio se Sbagliato |
|---|-------|---------|----------------------|
| A1 | Il `name` in `plugin.json` (`"claude-swarm"`) determina il prefisso del namespace slash command | Manifest Analysis | Se il namespace fosse diverso, i comandi non sarebbero invocabili con il nome atteso |
| A2 | Rinominare le directory skill è necessario perché i nomi attuali non corrispondono ai requirement | Pitfalls | Se i requirement intendessero nomi diversi (es. abbreviati), la rinomina sarebbe errata |
| A3 | `disable-model-invocation: true` è appropriato per entrambe le skill (comandi con side-effects) | Pattern | Se si volesse che Claude li invochi automaticamente, questo va tolto |

---

## Open Questions

1. **Il namespace del plugin va aggiornato?**
   - Sappiamo: `name: "claude-swarm"` in `plugin.json` → `/claude-swarm:codestra-start-hub`
   - Non chiaro: il team vuole `/codestra:codestra-start-hub` dopo il rebrand?
   - Raccomandazione: aggiornare `name` a `"codestra"` per coerenza con il rebrand, ma è una decisione del team. Cambiarlo ora è a basso rischio (nessun utente reale ancora).

2. **L'argomento `[ip]` di `/codestra-start-hub` è gestibile senza estendere il tool MCP?**
   - Sappiamo: `swarm_hub_start` non accetta `host` come parametro — solo `port` e `secret`
   - Non chiaro: la SKILL.md deve istruire Claude a costruire il comando bash raw, oppure il tool va esteso?
   - Raccomandazione: per Phase 1, la SKILL.md documenta entrambi i percorsi (tool MCP per port, bash cmd per host). L'estensione del tool è deferred alla Phase 2 o oltre.

3. **`plugin.jsons` va eliminato in questa fase?**
   - Sappiamo: è un duplicato identico con nome errato
   - Raccomandazione: sì, eliminarlo nel Wave 0. Non è fuori scope — è un cleanup che risolve un blocker documentato in STATE.md.

---

## Sources

### Primary (HIGH confidence)
- [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — Specifica completa SKILL.md: frontmatter, argomenti, plugin namespace, disable-model-invocation [VERIFIED: WebFetch aprile 2026]
- [code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins) — Come plugin.json cabla skills, autodiscovery directory, plugin name = namespace [VERIFIED: WebFetch aprile 2026]
- `/home/g/Documenti/codestra/servers/mcp-server.mjs` — Tool MCP esistenti: `swarm_hub_start` (port, secret), `swarm_register` (role, task) [VERIFIED: lettura diretta]
- `/home/g/Documenti/codestra/servers/hub.mjs` — Hub legge `SWARM_HOST` da env, non da parametro tool [VERIFIED: lettura diretta]
- `/home/g/Documenti/codestra/.claude-plugin/plugin.json` — name: "claude-swarm", mcpServers: "./.mcp.json" [VERIFIED: lettura diretta]
- `/home/g/Documenti/codestra/.planning/codebase/STRUCTURE.md` — Conferma stub e typo plugin.jsons [VERIFIED: lettura diretta]

### Secondary (MEDIUM confidence)
- [producttalk.org/how-to-use-claude-code-features](https://www.producttalk.org/how-to-use-claude-code-features/) — Panoramica comandi e skills [WebSearch]

---

## Metadata

**Confidence breakdown:**
- Formato SKILL.md: HIGH — documentazione ufficiale verificata
- Wiring plugin manifest → slash commands: HIGH — documentazione ufficiale verificata
- Comportamento tool MCP esistenti: HIGH — lettura diretta del codice
- Namespace finale del comando: MEDIUM — dipende da decisione rebrand (A1)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (spec plugin stabile, 30 giorni)
