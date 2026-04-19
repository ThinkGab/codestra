---
status: partial
phase: 03-hub-push-delivery
source: [03-VERIFICATION.md]
started: 2026-04-19T15:30:00+02:00
updated: 2026-04-19T15:30:00+02:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. Unicast end-to-end
expected: Hub avviato + worker HTTP server reale con endpoint POST; messaggio arriva via push e non riappare via polling (readBy.add previene duplicato)
result: [pending]

### 2. Broadcast fan-out eterogeneo
expected: Worker con callback_url riceve push; worker senza callback_url riceve messaggio via polling invariato
result: [pending]

### 3. Silent fallback su push failure
expected: Endpoint worker irraggiungibile o in timeout; mittente riceve comunque 201 immediato; messaggio resta disponibile via GET /messages/:workerId polling
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
