---
plan: 05-02
phase: 05-worker-lifecycle
status: complete
requirements: [WORKER-03]
---

## Summary

Il file `skills/codestra-start-worker/SKILL.md` e' stato aggiornato con tre modifiche additive per esporre il nuovo parametro `swarmId` introdotto in Plan 01. L'`argument-hint` nel frontmatter ora mostra quattro argomenti posizionali (`[hub-ip] [hub-port] [worker-port?] [swarm-id?]`). La lista dei parametri include la voce `$3` che descrive lo Swarm ID opzionale con fallback a `SWARM_ID` dall'env. Le istruzioni operative per `swarm_register` includono il bullet `swarmId` che istruisce Claude a passare `$3` come stringa quando presente. Nessun comportamento viene modificato per i caller esistenti che omettono il quarto argomento.

## Key Files

### Modified
- `skills/codestra-start-worker/SKILL.md` — tre modifiche additive: (1) `argument-hint` esteso con `[swarm-id?]`, (2) voce `$3` aggiunta alla lista parametri con descrizione env fallback, (3) bullet `swarmId` aggiunto alle istruzioni di invocazione `swarm_register`

## Self-Check

- "The skill signature documents [swarm-id?] as the fourth optional argument" — PASS: `grep "swarm-id?"` restituisce la riga `argument-hint` con tutti e quattro gli argomenti
- "The skill parameter list includes a $3 entry describing swarmId" — PASS: `grep '\$3'` restituisce 2 righe, inclusa la voce nella lista parametri
- "The swarm_register invocation instructions tell Claude to pass $3 as swarmId when provided" — PASS: `grep "swarmId"` restituisce 2 righe: descrizione parametro + istruzione operativa

## Self-Check: PASSED
