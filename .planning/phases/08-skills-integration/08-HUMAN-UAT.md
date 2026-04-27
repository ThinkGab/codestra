---
status: partial
phase: 08-skills-integration
source: [08-VERIFICATION.md]
started: 2026-04-27T20:36:00.000Z
updated: 2026-04-27T20:36:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Base64 encoding — verifica identità contenuto nel handoff two-worker

expected: `file_download` restituisce il testo originale in chiaro (non base64). Il campo `content` nella risposta MCP corrisponde carattere per carattere al testo caricato con `file_upload`.

**Nota investigativa:** il verifier ha rilevato che `hub.mjs` potrebbe restituire contenuto base64-encoded (`slice.toString("base64")`). Se `mcp-server.mjs` non decodifica prima di restituire al worker, SKILL.md Step 6 (confronto contenuto identico) fallirebbe a runtime. Verificare con un upload/download reale.

result: [pending]

### 2. Namespace condiviso tra worker dello stesso swarm

expected: Worker A e Worker B registrati con lo stesso `SWARM_ID` condividono il namespace. Un file caricato da Worker A è scaricabile da Worker B con lo stesso filename. Il setup descritto in SKILL.md (stesso `SWARM_HUB_URL` + stesso `SWARM_ID` nel `.mcp.json`) è sufficiente per operatori reali.

result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
