# REQUIREMENTS.md — Milestone v1.1: Worker Lifecycle & Hub Improvements

## Milestone Requirements

### Worker Lifecycle

- [x] **WORKER-03**: Worker accetta parametro `SWARM_ID` all'avvio (passato come argomento a `/codestra-start-worker`) — Validated in Phase 05: worker-lifecycle
- [x] **WORKER-04**: Worker avvia polling automatico ogni 10s verso l'hub subito dopo la registrazione — Validated in Phase 05: worker-lifecycle (gap-closure 05-03)
- [x] **WORKER-05**: Uscita dall'istanza Claude killa automaticamente il processo demone MCP del worker — Validated in Phase 05: worker-lifecycle

### Hub Fixes & UX

- [x] **HUB-04**: `DELETE /worker/:id` funziona correttamente (rimuove il worker dalla mappa in-memory) — Validated in Phase 04: hub-fixes
- [x] **HUB-05**: Hub all'avvio invia a Claude un messaggio di sistema che istruisce di distribuire sempre il carico verso i workers registrati (non eseguire task da solo se non specificato) — Validated in Phase 04: hub-fixes

## Future Requirements

*(nessuno identificato)*

## Out of Scope

- TLS / HTTPS — documentato: usare reverse proxy per internet
- Autenticazione avanzata (OAuth, JWT) — fuori scope v1.x
- Persistenza hub (database) — in-memory è intenzionale
- Worker process management UI — solo kill su exit
- Reconnect automatico se hub non raggiungibile — fuori scope v1.1

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| HUB-04 | Phase 4 | 04-01-PLAN.md | Complete |
| HUB-05 | Phase 4 | 04-01-PLAN.md | Complete |
| WORKER-03 | Phase 5 | 05-01-PLAN.md, 05-02-PLAN.md | Complete |
| WORKER-04 | Phase 5 | 05-01-PLAN.md, 05-03-PLAN.md | Complete |
| WORKER-05 | Phase 5 | 05-01-PLAN.md | Complete |
