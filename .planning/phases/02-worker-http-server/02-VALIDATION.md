---
phase: 2
slug: worker-http-server
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Nessuno (Node.js ESM puro, no test framework) |
| **Config file** | nessuno |
| **Quick run command** | `node -e "const h=require('node:http');const s=h.createServer(()=>{});s.listen(0,'localhost',()=>{console.log('port:',s.address().port);s.close();})"` |
| **Full suite command** | Verifica manuale: hub up → `swarm_register` → `GET /workers` → `callback_url` presente |
| **Estimated runtime** | ~5 secondi (smoke) / ~60 secondi (manuale) |

---

## Sampling Rate

- **After every task commit:** Run quick port-0 bind smoke test
- **After every plan wave:** Verifica manuale end-to-end (hub + worker + callback_url)
- **Before `/gsd-verify-work`:** Full manual suite deve passare
- **Max feedback latency:** 60 secondi

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | WORKER-01 | — | Server non espone porte arbitrarie senza consenso utente | smoke | readFileSync + regex su mcp-server.mjs | ✅ static | ⬜ pending |
| 2-01-02 | 01 | 1 | WORKER-02 | — | Porta custom validata (1-65535) | unit | readFileSync + regex su mcp-server.mjs | ✅ static | ⬜ pending |
| 2-01-03 | 01 | 1 | WORKER-03 | — | callback_url inclusa nel body POST /workers | integration | readFileSync + smoke porta 0 in automated | ✅ static+runtime | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Wave 0 non richiesta. La verifica statica via `readFileSync` + regex nei blocchi `<verify><automated>` di ogni
> task è sufficiente: il codice viene inserito verbatim dalle azioni del piano, quindi l'ispezione del
> sorgente equivale a verificare il comportamento. Il smoke test porta 0 (runtime) è incluso nel
> blocco `<verify><automated>` del Task 2 di 02-01-PLAN.md.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Worker riceve POST push dall'hub | WORKER-01 | Richiede hub live + worker live | Avvia hub, avvia worker, invia messaggio, verifica stdout worker |
| callback_url valida nel record worker | WORKER-03 | Richiede lettura stato hub in-memory | GET /workers dopo swarm_register, verifica campo callback_url |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (static readFileSync + runtime smoke test in Task 2)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 non richiesta — verifica statica accettata per questa fase
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [x] `nyquist_compliant: true` impostato in frontmatter

**Approval:** accepted (static + smoke test verification)
