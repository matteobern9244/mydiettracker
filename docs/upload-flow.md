# Flusso di upload e estrazione

Il caricamento di un referto è uno dei flussi più articolati dell'app. Lo step machine vive in `src/components/upload-dialog.tsx`.

## Stati

```
upload → duplicate → processing → review → saving → (close)
                  ↘                               ↗
                   error ←─────────────────────────
```

## 1. Selezione file (`upload`)

L'utente seleziona o droppa un file:
- Formati ammessi: `.pdf`, `.docx`, `.doc`, `.txt`.
- Dimensione massima: 10 MB.
- Validazione client-side immediata (estensione + size).

## 2. Upload e check duplicati

Viene chiamata la server function `uploadDocument({ file, hash })` (l'hash SHA-256 è calcolato lato server da `sha256Hex` su `crypto.subtle.digest`).

Comportamento server:
- Se esiste già un `documents` row per `(user_id, content_hash)` → ritorna `{ duplicate: true, document: existing }` **senza** salvare il file.
- Altrimenti carica il file su `referti/{user_id}/{uuid}.{ext}` e crea la riga `documents` con `extraction_status = 'pending'`.

### Step `duplicate`

Se è duplicato, la UI mostra:
- Nome del documento esistente e data upload.
- Due bottoni:
  - **Mantieni esistente** → chiude il dialog, nessuna modifica.
  - **Sostituisci e analizza** → chiama `replaceDocument({ existingDocumentId, file, hash })`.

`replaceDocument`:
1. Recupera tutte le `visits` legate al vecchio documento.
2. Cancella le visite (cascading sui dati collegati: circonferenze, body composition, DEXA).
3. Cancella il file dallo storage.
4. Cancella la riga `documents`.
5. Esegue il nuovo upload con il nuovo hash.

## 3. Estrazione AI (`processing`)

Subito dopo l'upload (o la sostituzione), il client invoca `processExtraction(documentId)`.

Lato server:
- `documents.extraction_status` → `processing`.
- `extractDocumentInput` legge il file e produce un `ExtractionInput` (`text` o `binary`).
- `extractWithAI` chiama il Lovable AI Gateway (timeout 90 s).
- A successo: `extraction_raw` salvato, `extraction_status` → `extracted`.
- A errore: `extraction_status` → `failed`, `extraction_error` salvato.

Il client fa polling con `getExtractionStatus(documentId)` ogni ~1.5 s finché lo stato non è terminale.

## 4. Revisione (`review`)

L'AI può estrarre **più visite** dallo stesso documento (es. un riepilogo storico). La UI permette di navigare tra le visite con frecce avanti/indietro, modificare ogni campo, aggiungere/rimuovere visite, modificare gli esami del sangue e gli aggiornamenti del profilo.

Tutti i dati sono validati lato client tramite i type guard di `ExtractedData` e ri-validati lato server con Zod prima del salvataggio.

## 5. Conferma (`saving`)

`saveConfirmedData({ documentId, data })`:
- Inserisce le visite con i dati collegati.
- Inserisce gli esami del sangue.
- Aggiorna i campi del profilo (solo quelli presenti).
- Imposta `documents.extraction_status = 'confirmed'`.
- Invalida la query `["dashboard", user.id]` per ricaricare la dashboard.

## Stati di errore

In caso di errore in qualsiasi step, la UI passa a `error` con messaggio user-friendly e bottone "Riprova" che torna a `upload`. I dettagli tecnici sono solo nei log del server (vedi [`security.md`](./security.md)).
