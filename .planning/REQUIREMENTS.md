# REQUIREMENTS.md — Milestone v1.1: Worker Lifecycle & Hub Improvements

## Milestone Requirements

### Worker Lifecycle

- [ ] **WORKER-03**: Worker accetta parametro `SWARM_ID` all'avvio (passato come argomento a `/codestra-start-worker`)
- [ ] **WORKER-04**: Worker avvia polling automatico ogni 10s verso l'hub subito dopo la registrazione
- [ ] **WORKER-05**: Uscita dall'istanza Claude killa automaticamente il processo demone MCP del worker

### Hub Fixes & UX

- [ ] **HUB-04**: `DELETE /worker/:id` funziona correttamente (rimuove il worker dalla mappa in-memory)
- [ ] **HUB-05**: Hub all'avvio invia a Claude un messaggio di sistema che istruisce di distribuire sempre il carico verso i workers registrati (non eseguire task da solo se non specificato)

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
| HUB-04 | Phase 4 | TBD | Pending |
| HUB-05 | Phase 4 | TBD | Pending |
| WORKER-03 | Phase 5 | TBD | Pending |
| WORKER-04 | Phase 5 | TBD | Pending |
| WORKER-05 | Phase 5 | TBD | Pending |
