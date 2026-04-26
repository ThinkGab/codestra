---
phase: 05-worker-lifecycle
plan: 03
status: complete
gap_closure: true
completed: "2026-04-26"
commit: 2fe52d9
---

## Objective

Rimuovere il guard `if (!callbackUrl)` che rendeva WORKER-04 lettera morta.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Rimuovere guard if(!callbackUrl) — polling heartbeat incondizionato | ✓ | 2fe52d9 |

## Artifacts

### key-files.modified

- `servers/mcp-server.mjs` — rimosso guard alla riga 150 (ora 149), `pollInterval = setInterval(...)` eseguito incondizionatamente dopo ogni `swarm_register` riuscito

## Decisions

- **D-04 invalidato**: il guard si basava sull'ipotesi che `callbackUrl` potesse essere assente. Nell'architettura attuale il server HTTP parte prima del POST all'hub, quindi `callbackUrl` è sempre una stringa non-vuota. Il guard era strutturalmente dead code.
- Commento aggiornato da "fallback path" a "WORKER-04 heartbeat" sia a livello modulo (riga 101) sia nel blocco setInterval.

## Verification

```
grep -n "pollInterval = setInterval" servers/mcp-server.mjs   → 1 match (riga 152) ✓
grep -c "if (!callbackUrl)" servers/mcp-server.mjs             → 0 ✓
node --check servers/mcp-server.mjs                            → syntax OK ✓
grep -n "WORKER-04" servers/mcp-server.mjs                     → riga 149 ✓
grep -n "fallback path" servers/mcp-server.mjs                 → nessuna riga ✓
```

## Self-Check: PASSED

Tutti i criteri di accettazione soddisfatti. WORKER-04 chiuso.

## Next Steps

- Re-run `gsd-verify-work 5` per confermare SC #2 e SC #3 ora passano
- Se verifica passa → Phase 5 completa, Milestone v1.1 done
