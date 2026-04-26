# Fix: "upstream request timeout" durante l'analisi AI

## Causa del problema

`uploadAndExtract` esegue **in un'unica request HTTP**: upload storage → creazione record → estrazione testo → chiamata AI Gemini → update DB. Quando il file è un `.doc` legacy, il fallback invia il **binario intero in base64** a Gemini con un prompt complesso multi-visita: la chiamata supera facilmente i 30–40s e il proxy upstream (Cloudflare/Lovable) chiude la connessione con `upstream request timeout` **prima** che il server function risponda. Il file viene anche caricato più volte ad ogni retry.

Va spezzato in **upload veloce + job asincrono + polling**, ed è opportuno ridurre la latenza AI quando possibile.

---

## Cosa farò

### 1. Migrazione DB: stato del job di estrazione

Migration su `public.documents`:
- aggiungo colonna `extraction_error text` (per messaggi di errore leggibili)
- estendo i valori ammessi di `extraction_status` per includere `processing` (oltre a `pending | extracted | failed | confirmed`)

Nessuna modifica a tabelle riservate. Nessun CHECK constraint vincolante (uso solo testo libero).

### 2. Split del server function `uploadAndExtract` in tre endpoint

In `src/lib/dashboard.functions.ts`:

**a) `uploadDocument(formData)`** — risposta immediata
- valida e carica il file in storage `referti/`
- inserisce row in `documents` con `extraction_status: 'pending'`
- ritorna `{ documentId }` in <1s

**b) `processExtraction({ documentId })`** — job di estrazione
- legge il file dallo storage
- segna `extraction_status: 'processing'`
- esegue `extractDocumentInput()` + `extractWithAI()`
- al successo: aggiorna `extraction_status: 'extracted'`, `extraction_raw`, pulisce `extraction_error`
- al fallimento: aggiorna `extraction_status: 'failed'`, `extraction_error`
- **non ritorna l'estratto**: il client lo recupera con polling (così se la request si chiude per timeout, il job continua e il dato è comunque scritto sul DB al termine)

**c) `getExtractionStatus({ documentId })`** — polling rapido
- ritorna `{ status, extracted, error }`

`saveConfirmedData`, `getDashboardData`, `deleteVisit`, `getDocumentUrl`, `updateTargetWeight`, `hardResetAllData` restano invariati.

### 3. Riduzione latenza dell'estrazione AI

In `src/lib/extraction.server.ts`:
- **Modello più veloce**: passo da `google/gemini-2.5-flash` a `google/gemini-2.5-flash-lite` per l'estrazione (lo schema strutturato è ben gestito anche dal lite e taglia ~50% del tempo).
- **Soglia naive .doc più permissiva**: accetto il testo estratto quando è ≥ 80 caratteri (prima 200), così evito il fallback binario che è la causa principale dei timeout.
- **Aggiungo timeout esplicito** sulla `fetch` verso il gateway (60s) con `AbortController`, con messaggio d'errore chiaro "L'estrazione è andata oltre il limite, riprova".
- Il fallback binario per `.doc` resta come ultima spiaggia, ma viene attivato raramente.

### 4. Frontend: nuovo flusso con polling

In `src/components/upload-dialog.tsx`:
- nuovo step `"processing"` con messaggio "Sto leggendo il referto, può richiedere fino a 1–2 minuti…"
- la mutation chiama in sequenza:
  1. `uploadDocument(file)` → ottiene `documentId` velocemente
  2. avvia `processExtraction({ documentId })` **senza attendere il risultato** (fire & forget, con `.catch` silenzioso: anche se il proxy chiude la connessione, il job server-side continua perché la chiamata Supabase è già partita)
  3. inizia un **polling** ogni 3s su `getExtractionStatus({ documentId })` con timeout massimo di 3 minuti
  4. quando lo status è `extracted` mostra il review form esistente
  5. se `failed` mostra `extraction_error` e permette retry o annullo
- Aggiungo pulsante "Riprova estrazione" nello step di errore (richiama `processExtraction` sullo stesso `documentId` senza ricaricare il file).

### 5. Pulizia in caso di annullamento

Se l'utente annulla durante upload/processing, NON rimuovo automaticamente il file/documento (resta come `pending`/`failed`). L'hard reset esistente già pulisce tutto.

---

## File toccati
- `supabase/migrations/<new>.sql` (nuova migrazione: colonna `extraction_error`)
- `src/lib/dashboard.functions.ts` (split in 3 endpoint + nuovo `getExtractionStatus`)
- `src/lib/extraction.server.ts` (modello lite, soglia naive, timeout fetch)
- `src/components/upload-dialog.tsx` (step `processing`, polling, retry)
- `src/integrations/supabase/types.ts` viene rigenerato automaticamente

## File NON toccati
- `src/components/dashboard.tsx`, `hard-reset-dialog.tsx`, `insight-card.tsx`, `status-badge.tsx`
- `src/lib/insights.ts`, `src/lib/types.ts`
- `src/integrations/supabase/client.ts`, `client.server.ts`

## Risultato atteso
- L'upload risponde subito (nessun timeout sulla prima request).
- L'estrazione gira in background; anche se la chiamata HTTP `processExtraction` viene chiusa dal proxy, il lavoro continua e il risultato finisce nel DB.
- Il client mostra avanzamento reale tramite polling, quindi niente più toast "upstream request timeout".
- Documenti `.docx` testuali (la maggior parte dei referti) vengono processati in 5–15s con `flash-lite`, ben sotto qualsiasi limite.
