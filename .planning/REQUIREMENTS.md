# REQUIREMENTS.md — Milestone v1.0: Bidirectional Swarm Commands

## Commands

- [ ] **CMD-01**: Utente può eseguire `/codestra-start-hub [port] [ip]` per avviare l'hub con binding configurabile (default port 7800, default ip 0.0.0.0)
- [ ] **CMD-02**: Utente può eseguire `/codestra-start-worker [hub-ip] [hub-port] [worker-port?]` per registrare l'istanza come worker con comunicazione bidirezionale

## Worker Networking

- [ ] **WORKER-01**: Worker avvia un HTTP server locale al momento dell'esecuzione di `/codestra-start-worker`
- [ ] **WORKER-02**: Worker porta è configurabile — default: porta assegnata dall'OS (port 0), opzione di specificare porta custom
- [ ] **WORKER-03**: Worker comunica la propria `callback_url` (es. `http://<host>:<port>`) all'hub durante la registrazione

## Hub Push Delivery

- [ ] **HUB-01**: Hub salva `callback_url` nel record del worker al momento della registrazione
- [ ] **HUB-02**: Quando viene inviato un messaggio a un worker, hub fa POST alla sua `callback_url` se disponibile
- [ ] **HUB-03**: Hub fa fallback silenzioso a store-and-forward (polling model attuale) se `callback_url` non è impostata o la POST fallisce

## Future Requirements

- Worker-to-worker direct messaging (bypass hub)
- Hub persistenza su disco (SQLite o JSON file)
- Health check automatico dei worker (heartbeat TTL)
- Dashboard web per visualizzare stato swarm

## Out of Scope

- TLS/HTTPS — documentato, usare reverse proxy. Complessità non giustificata per v1.0 LAN use case
- Autenticazione OAuth/JWT — `SWARM_SECRET` bearer token è sufficiente per v1.0
- Worker process termination via hub — hub traccia solo stato logico, non gestisce processi OS
- WebSocket per push — HTTP callback è più semplice e stateless

## Traceability

| REQ-ID | Phase | Status | Notes |
|--------|-------|--------|-------|
| CMD-01 | Phase 1 | Pending | |
| CMD-02 | Phase 1 | Pending | |
| WORKER-01 | Phase 2 | Pending | |
| WORKER-02 | Phase 2 | Pending | |
| WORKER-03 | Phase 2 | Pending | |
| HUB-01 | Phase 3 | Pending | |
| HUB-02 | Phase 3 | Pending | |
| HUB-03 | Phase 3 | Pending | |
