---
name: codestra-file-transport
description: Gestisce il trasporto di file nel namespace dello swarm Codestra. Supporta upload, download, lista e cancellazione file tramite MCP. Usa questo skill quando il payload supera qualche KB o deve essere condiviso tra più worker.
argument-hint: <azione> [filename] [contenuto]
disable-model-invocation: true
---

Gestisce il trasporto di file nel namespace di questo worker Codestra.

**Argomenti ricevuti:** $ARGUMENTS

Parametri:
- Azione (`$0`): operazione da eseguire — `upload`, `download`, `list`, `delete`.
- Filename (`$1`): nome del file (obbligatorio per upload, download, delete).
- Contenuto (`$2`): testo del file (obbligatorio solo per upload).

## Quando usare file transport vs message passing

**Usa `file_upload` / `file_download`** quando:
- Il payload supera qualche KB (testo lungo, report, output di elaborazione).
- Il contenuto deve essere accessibile a più worker contemporaneamente o in momenti diversi.
- Vuoi separare la notifica ("il file è pronto") dal trasferimento dati effettivo.

**Usa il message passing** (`swarm_send_message`) quando:
- Il payload è breve (conferme, comandi, ID, status update).
- La comunicazione è diretta tra due worker specifici e non richiede persistenza.
- Il contenuto ha senso solo nel momento in cui viene ricevuto.

**Regola pratica:** se il testo supera 2–3 righe o 500 caratteri, preferisci file transport.

## Limiti e semantica

- **Testo-only:** il contenuto deve essere una stringa UTF-8. File binari non supportati in v1.2.
- **Limite dimensione:** ≤ ~50 KB per invocazione MCP (circa 50.000 caratteri). File più grandi richiedono chunking manuale con `offset` / `max_bytes`.
- **Storage ephemeral:** i file sono conservati in memoria nell'hub. Un riavvio dell'hub cancella tutti i file. Non usare il file transport come storage permanente.
- **Namespace per worker:** ogni file è archiviato nel namespace del worker che lo ha caricato (identificato da `registeredWorkerId`). Il consumer deve conoscere il filename esatto e usare lo stesso namespace (stesso swarm).
- **Prerequisito:** il worker deve essere registrato (`swarm_register`) prima di usare qualsiasi file tool.

## Istruzioni operative

Se `$0` mancante o non riconosciuto, informa l'utente dei valori validi (`upload`, `download`, `list`, `delete`) e interrompi.

### Upload

Usa il tool `file_upload` con:
- `filename`: valore di `$1`
- `content`: valore di `$2` (il testo completo del file)
- `mimeType`: opzionale — ometti se non specificato (default `text/plain`)

Esempio input tool:
```json
{
  "filename": "report-analisi.txt",
  "content": "Risultati dell'analisi:\n- Item A: OK\n- Item B: WARN",
  "mimeType": "text/plain"
}
```

Risposta attesa (successo):
```json
{
  "id": "uuid-generato-hub",
  "filename": "report-analisi.txt",
  "size": 52,
  "mimeType": "text/plain",
  "uploadedAt": "2026-04-27T18:00:00.000Z"
}
```

### Download

Usa il tool `file_download` con:
- `filename`: valore di `$1`
- `offset`: opzionale — ometti per partire dall'inizio (default 0)
- `max_bytes`: opzionale — ometti per usare il default (25000 byte)

Esempio input tool:
```json
{
  "filename": "report-analisi.txt"
}
```

Risposta attesa (file completo in un chunk):
```json
{
  "content": "Risultati dell'analisi:\n- Item A: OK\n- Item B: WARN",
  "offset": 0,
  "total_size": 52,
  "has_more": false
}
```

Se `has_more` è `true`, il file è più grande del chunk restituito. Richiama `file_download` con `offset = offset_precedente + lunghezza_content` finché `has_more` è `false`.

### Lista file

Usa il tool `file_list` (nessun parametro).

Risposta attesa:
```json
[
  {
    "id": "uuid-generato-hub",
    "filename": "report-analisi.txt",
    "size": 52,
    "mimeType": "text/plain",
    "uploadedAt": "2026-04-27T18:00:00.000Z"
  }
]
```

Se il namespace è vuoto, la risposta è un array JSON vuoto `[]`.

### Delete

Usa il tool `file_delete` con:
- `filename`: valore di `$1`

Risposta attesa (successo):
```json
{ "deleted": true }
```

In caso di errore (file non trovato, worker non registrato), il tool restituisce `isError: true` con il messaggio dell'hub.

## Handoff two-worker: pattern produttore → consumatore

Il caso d'uso principale del file transport è che Worker A (produttore) carica un file e Worker B (consumatore) lo scarica usando lo stesso filename, coordinandosi tramite messaggi.

### Sequenza completa

**Worker A (produttore):**

1. Chiama `file_upload` con un filename concordato (es. `"handoff-risultato.txt"`) e il contenuto da trasferire.
2. Verifica che la risposta contenga `filename` e `uploadedAt` (nessun campo `error`).
3. Invia un messaggio a Worker B via `swarm_send_message` con body: `"file pronto: handoff-risultato.txt"`.

**Worker B (consumatore):**

4. Legge il messaggio di Worker A via `swarm_read_messages` (o riceve la notifica push).
5. Estrae il filename dal messaggio.
6. Chiama `file_download` con lo stesso filename: `"handoff-risultato.txt"`.
7. Verifica che `has_more` sia `false` (file ricevuto completo) oppure itera sui chunk.
8. Confronta il contenuto ricevuto con quello atteso — devono essere identici.

### Nota sul namespace

`file_download` opera sempre sul namespace di chi chiama il tool (il `registeredWorkerId` del worker che invoca). Pertanto Worker B scarica da **il proprio namespace**, non da quello di Worker A.

**Implicazione pratica:** per il pattern produttore → consumatore, Worker A e Worker B devono essere **registrati nello stesso swarm** (stesso `swarmId`). In questo caso condividono il namespace e `file_download` su Worker B trova il file caricato da Worker A.

Se i worker appartengono a swarm diversi, il file non è accessibile cross-swarm in v1.2.

## Test di integrazione manuale

Questa sequenza verifica il funzionamento end-to-end del file transport tra due istanze Claude Code. Tempo stimato: 3–5 minuti con due terminali aperti.

### Prerequisiti

- Hub Codestra avviato e raggiungibile (es. `http://localhost:7800`).
- Due istanze Claude Code configurate con lo stesso `SWARM_HUB_URL` e lo stesso `SWARM_ID` nel loro `.mcp.json`.
- Entrambe le istanze registrate (skill `codestra-start-worker` eseguito su ciascuna).

### Step 1 — Worker A: verifica stato iniziale

In Worker A, chiama `file_list`. Risposta attesa: array vuoto `[]` (o lista file esistenti — annotare).

### Step 2 — Worker A: carica il file di test

In Worker A, chiama `file_upload`:
```json
{
  "filename": "test-handoff.txt",
  "content": "CODESTRA_HANDOFF_TEST_v1\nTimestamp: <ora corrente>\nPayload: 42"
}
```
Risposta attesa: oggetto con `filename: "test-handoff.txt"` e `size` > 0. Annotare il valore di `size`.

### Step 3 — Worker A: conferma presenza file

In Worker A, chiama `file_list`. Il file `test-handoff.txt` deve apparire nell'array con lo stesso `size` annotato al passo 2.

### Step 4 — Worker A: notifica Worker B

In Worker A, chiama `swarm_send_message` verso Worker B con body:
`"file pronto: test-handoff.txt"`

### Step 5 — Worker B: scarica il file

In Worker B (istanza separata), chiama `file_download`:
```json
{
  "filename": "test-handoff.txt"
}
```
Risposta attesa:
- `content` = stringa identica a quella caricata al passo 2
- `has_more: false`
- `total_size` = stesso valore di `size` annotato al passo 2

### Step 6 — Verifica contenuto identico

Confronta il campo `content` della risposta di `file_download` con il testo originale caricato al passo 2. Devono corrispondere carattere per carattere (inclusi `\n`).

### Step 7 — Pulizia (opzionale)

In Worker A, chiama `file_delete`:
```json
{ "filename": "test-handoff.txt" }
```
Risposta attesa: `{ "deleted": true }`.

### Criteri di superamento

- [ ] Passo 2: `file_upload` restituisce metadata senza `error`
- [ ] Passo 3: `file_list` contiene `test-handoff.txt`
- [ ] Passo 5: `file_download` restituisce `has_more: false`
- [ ] Passo 6: contenuto ricevuto da Worker B = contenuto caricato da Worker A
- [ ] Passo 7: `file_delete` restituisce `{ "deleted": true }`

## Output all'utente

Al termine dell'operazione, mostra:
- **Upload:** "File `<filename>` caricato. Dimensione: `<size>` byte. ID hub: `<id>`."
- **Download:** "File `<filename>` scaricato (`<total_size>` byte totali). Contenuto:" seguito dal testo.
- **List:** elenco dei file con nome, dimensione e data upload. Se vuoto: "Nessun file nel namespace."
- **Delete:** "File `<filename>` eliminato."
