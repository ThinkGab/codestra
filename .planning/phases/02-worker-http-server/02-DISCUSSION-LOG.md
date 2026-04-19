> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 02-worker-http-server
**Areas discussed:** Avvio HTTP server, Host callback_url, Handler messaggi push, Lifetime server

---

## Avvio HTTP server

| Option | Description | Selected |
|--------|-------------|----------|
| In-process in swarm_register | swarm_register avvia server in-process, poi registra | ✓ |
| Tool separato swarm_start_server | Due step: start + register | |
| swarm_register v2 | Tool nuovo, rompe compatibilità | |

**User's choice:** In-process in swarm_register
**Notes:** Un tool, tutto automatico. SKILL.md non necessita modifiche aggiuntive.

---

## Host del callback_url

| Option | Description | Selected |
|--------|-------------|----------|
| SWARM_HOST env var | Riusa env var esistente, default localhost | ✓ |
| Euristica da hub-ip | Usa $0 del comando per derivare interfaccia | |
| Sempre localhost | Solo same-machine | |

**User's choice:** SWARM_HOST env var

---

## Handler messaggi in push

| Option | Description | Selected |
|--------|-------------|----------|
| Stampa su stdout MCP server | Log nel processo esistente | ✓ |
| Nuovo MCP tool swarm_get_push_messages | Pull on demand | |
| Scrivi su file temporaneo | /tmp/codestra-worker-*.json | |

**User's choice:** Stampa su stdout del MCP server

---

## Lifetime del server

| Option | Description | Selected |
|--------|-------------|----------|
| In-process con mcp-server.mjs | Muore con MCP, nessun zombie | ✓ |
| nohup separato | Sopravvive alla sessione Claude Code | |

**User's choice:** In-process con mcp-server.mjs
