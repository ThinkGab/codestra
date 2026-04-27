---
phase: 08-skills-integration
reviewed: 2026-04-27T18:35:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - skills/codestra-file-transport/SKILL.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-04-27T18:35:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `skills/codestra-file-transport/SKILL.md`, a pure-documentation operative skill for Claude workers managing file transport via MCP tools (`file_upload`, `file_download`, `file_list`, `file_delete`). The document is well-structured and covers the primary use cases. However, three substantive issues were found that could cause Claude workers to behave incorrectly or misunderstand system semantics: a namespace ownership contradiction that makes the two-worker handoff pattern ambiguous, an incorrect byte-offset formula in the chunked download loop, and a silent data-truncation risk arising from the mismatch between the documented upload limit and the default download chunk size. Two informational issues concern an unverifiable verification step and a shell argument variable numbering error.

## Warnings

### WR-01: Namespace contradiction makes two-worker handoff ambiguous

**File:** `skills/codestra-file-transport/SKILL.md:149-151`

**Issue:** Line 149 states that `file_download` always operates on the namespace of the calling worker (identified by `registeredWorkerId`). Line 151 then asserts that workers in the same swarm "condividono il namespace" (share the namespace), making a file uploaded by Worker A downloadable by Worker B. These two statements are mutually contradictory. If namespace is per-`registeredWorkerId`, then Worker B's `file_download` call resolves to Worker B's own namespace and cannot find a file uploaded by Worker A — unless the underlying implementation uses swarm-scoped namespace and the per-worker language on line 149 is wrong. A Claude worker reading this literally cannot determine which is true, and a misconfigured swarm would produce silent "file not found" errors with no guidance for diagnosis.

**Fix:** Clarify the actual namespace key used by the hub. If namespace is `swarmId`-scoped (all workers in a swarm share one namespace), replace the language on lines 149 and 36 to say "namespace per swarm" consistently. If namespace is per-`registeredWorkerId`, document explicitly how Worker B references Worker A's namespace (e.g., a `workerId` parameter on `file_download`), and add a cross-worker download example. Example corrected note:

```
### Nota sul namespace

I file sono archiviati nel namespace dello swarm (`swarmId`), condiviso da tutti
i worker registrati sullo stesso swarm. `file_download` su Worker B trova
qualsiasi file caricato da Worker A purché appartengano allo stesso swarm.

Se i worker appartengono a swarm diversi, il file non è accessibile cross-swarm in v1.2.
```

---

### WR-02: Chunked download offset formula is byte-incorrect for multi-byte UTF-8

**File:** `skills/codestra-file-transport/SKILL.md:94`

**Issue:** The instruction for iterating download chunks reads:

> Richiama `file_download` con `offset = offset_precedente + lunghezza_content`

`lunghezza_content` is the character length of the returned content string. Because the transport layer operates in bytes and Italian text contains multi-byte UTF-8 characters (e.g., `è`, `à`, `ì`, `ù`), the character count of `content` can be less than the number of bytes it occupies. A worker computing the next offset from `len(content)` will request an overlapping or incorrect byte range, producing corrupted reassembled content for any file containing non-ASCII characters.

**Fix:** Derive the next offset from the byte count the server actually advanced, not from the client-side string length. The safest approach is to have the server return a `next_offset` field, or document that workers must use `total_size` and track `bytes_received` as the cumulative byte length (encoded). If the `content` field is guaranteed to be a byte-length-accurate count (i.e., the server only returns whole characters and the string length equals byte length), that guarantee must be stated explicitly. Suggested corrected loop:

```
Se `has_more` è `true`, richiama `file_download` con:
  `offset` = valore di `next_offset` dalla risposta (se presente),
  oppure `offset_precedente + byte_letti` dove `byte_letti` è la lunghezza in byte
  UTF-8 del campo `content` (non la lunghezza in caratteri).
Continua finché `has_more` è `false`.
```

---

### WR-03: Upload limit vs. default download chunk size creates silent truncation

**File:** `skills/codestra-file-transport/SKILL.md:34,75`

**Issue:** Line 34 states the upload limit is ~50 KB (~50,000 characters). Line 75 states the default `max_bytes` for `file_download` is 25,000 bytes. A Claude worker that uploads a file at the maximum allowed size (~50 KB) and then calls `file_download` without specifying `max_bytes` will receive `has_more: true` after the first call, with only the first ~25 KB of content. The document does not warn about this mismatch. A worker that fails to check `has_more` (e.g., because it expects a small file or skips the check) silently processes half the content without error. This is especially risky in the handoff pattern where Worker B processes the received content directly.

**Fix:** Add an explicit note in the Limits section and in the Download section:

```
**Attenzione:** il limite di upload (~50 KB) è il doppio del chunk di download
predefinito (25.000 byte). Un file caricato vicino al limite massimo restituisce
sempre `has_more: true` al primo download. Verifica sempre `has_more` prima di
usare il contenuto.
```

---

## Info

### IN-01: Step 8 of handoff sequence instructs an impossible verification

**File:** `skills/codestra-file-transport/SKILL.md:145`

**Issue:** Step 8 instructs Worker B to "confronta il contenuto ricevuto con quello atteso — devono essere identici." Worker B has no independent copy of the original content to compare against. The only way Worker B could perform this check is if Worker A included the content in the notification message — which defeats the purpose of file transport — or if Worker B somehow computed an expected checksum from a prior agreement. As written, a Claude worker following this step literally cannot execute it and will either skip it silently or invent a workaround.

**Fix:** Replace step 8 with a verifiable assertion. Worker A should include the `size` in the notification message; Worker B checks that `total_size` in the download response matches that value. Alternatively, remove step 8 and rely on `has_more: false` plus `total_size` > 0 as the completeness check:

```
8. Verifica che `total_size` della risposta corrisponda alla dimensione comunicata
   da Worker A nel messaggio di notifica. Questo conferma che il file è stato
   trasferito integralmente.
```

---

### IN-02: Argument variables use $0 for the first user-supplied argument

**File:** `skills/codestra-file-transport/SKILL.md:13-15`

**Issue:** The document maps `$0` to the action, `$1` to filename, and `$2` to content. In standard shell convention (and in Claude Code skill invocation), `$0` is the script/skill name, not the first argument. The first user-supplied argument is `$1`. A worker or skill runner that interprets these variables literally under shell semantics would read the action from the skill name instead of the first argument, causing all operations to fail with "azione mancante o non riconosciuta."

**Fix:** Renumber the argument variables to match standard convention:

```
- Azione (`$1`): operazione da eseguire — `upload`, `download`, `list`, `delete`.
- Filename (`$2`): nome del file (obbligatorio per upload, download, delete).
- Contenuto (`$3`): testo del file (obbligatorio solo per upload).
```

Update `argument-hint` in the frontmatter accordingly: `<azione> [filename] [contenuto]` (no positional index needed in the hint itself — it is already correct).

---

_Reviewed: 2026-04-27T18:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
