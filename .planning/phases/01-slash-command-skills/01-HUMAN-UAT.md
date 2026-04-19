---
status: partial
phase: 01-slash-command-skills
source: [01-VERIFICATION.md]
started: 2026-04-19T12:01:00+02:00
updated: 2026-04-19T12:01:00+02:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. Slash command hub — autodiscovery e invocazione

expected: Aprire Claude Code con plugin Codestra installato. Digitare `/codestra:codestra-start-hub 8080 192.168.1.1`. (a) Autocomplete mostra suggerimento `[port] [ip]`. (b) Claude chiama `swarm_hub_start` con `port=8080`. (c) Claude esegue bash cmd con `SWARM_HOST=192.168.1.1 SWARM_PORT=8080`. (d) Claude verifica con `curl http://localhost:8080/health`.
result: [pending]

### 2. Slash command worker — verifica SWARM_HUB_URL e registrazione

expected: Aprire seconda istanza Claude Code con plugin installato. Digitare `/codestra:codestra-start-worker 192.168.1.10 8080`. (a) Autocomplete mostra `[hub-ip] [hub-port] [worker-port?]`. (b) Claude verifica `SWARM_HUB_URL` in `.mcp.json` punti a `http://192.168.1.10:8080`. (c) Claude chiama `swarm_register` con `role: "worker"`. (d) Claude mostra worker ID assegnato dall'hub.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
