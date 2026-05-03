# Changelog

Tutte le modifiche significative all'applicazione **Il mio percorso dietologico** vengono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il versioning è basato su milestone funzionali (l'app non pubblica ancora versioni semver).

---

## [Unreleased]

### Aggiunto
- **Sezione Dieta** completa accessibile da `/diet`:
  - Nuove tabelle `diet_plans`, `diet_weekly_schedule`, `diet_meal_logs`, `diet_shopping_lists` con RLS per utente.
  - Vincolo "un solo piano attivo per utente" tramite indice unico parziale `WHERE is_active = true`.
  - Pipeline di estrazione AI dedicata (`google/gemini-2.5-flash`) per piani dietetici in `.docx`/`.pdf`/`.txt` con structured output (indicazioni generali, opzioni pasto, schema settimanale 7×5).
  - Wizard upload con SHA-256, rilevamento duplicati e revisione manuale prima del salvataggio.
  - Vista calendario duale (settimana / giorno) con toggle.
  - Diario di aderenza per pasto e calcolo percentuale.
  - Generatore di lista della spesa aggregata per categoria, con check item e voci manuali.
- Link "Dieta" nell'header della dashboard.
- Icone PWA (favicon, apple-touch-icon, icone 192/512 e maskable) e `manifest.webmanifest` allineati al logo.

### Documentazione
- README completamente riscritto con panoramica, stack, architettura, flussi utente e sicurezza.
- Aggiunto CHANGELOG strutturato.
- Aggiunta cartella `docs/` con: `architecture.md`, `database.md`, `upload-flow.md`, `security.md`, `ai-extraction.md`.
- Aggiunto `docs/diet.md` che descrive schema, estrazione AI, viste calendario, diario e lista della spesa.

---

## [0.6.0] — 2026-04-26 — Sicurezza e validazione

### Aggiunto
- **Validazione Zod su tutte le server functions**: schemi per UUID, dati estratti (visite, circonferenze, composizione, DEXA, esami), aggiornamenti profilo, con range numerici realistici (peso 0–500 kg, BMI 0–150, percentuali 0–100, ecc.) e limiti di lunghezza sui campi testo.
- Helper `safeError` che logga gli errori interni lato server e restituisce al client solo messaggi generici, evitando di esporre nomi tabelle, constraint o path di storage.

### Sicurezza
- Risolte le finding `input_validator_stubs` e `db_error_leakage` del security scanner.

---

## [0.5.0] — 2026-04-26 — Rilevamento duplicati

### Aggiunto
- Colonna `documents.content_hash` (SHA-256 esadecimale).
- Indice unico parziale `(user_id, content_hash) WHERE content_hash IS NOT NULL` che impedisce di caricare due volte lo stesso file per lo stesso utente, ignorando i record storici.
- Step `duplicate` nel wizard di upload con due azioni:
  - **Mantieni esistente** → annulla l'upload e mostra il documento già presente.
  - **Sostituisci e analizza** → cancella visita + dati + file precedenti e processa il nuovo file.
- Server function `replaceDocument` che esegue la sostituzione atomica (delete cascading + storage cleanup + nuovo upload + nuovo hash).

### Modificato
- `uploadDocument` calcola l'hash SHA-256 con Web Crypto e blocca l'upload se rileva un duplicato per l'utente corrente, restituendo il documento esistente.

---

## [0.4.0] — 2026-04-26 — Login, logout, route protette

### Aggiunto
- Componente `_authenticated.tsx` (layout guard) che reindirizza a `/login?redirect=...` quando l'utente non è autenticato, preservando la destinazione originale.
- Login Google sulla pagina `/login` tramite Lovable Cloud Auth, con redirect verso la pagina richiesta dopo il sign-in.
- `useAuth` hook con `AuthProvider`, `signInWithGoogle`, `signOut`, gestione `loading`/`isAuthenticated`/`session`.
- ErrorBoundary del router con riconoscimento degli errori di chunk loading: invece di mostrare lo stack trace, propone "Ricarica" per forzare il refresh quando viene rilasciata una nuova versione.

### Modificato
- `Dashboard` ora gating delle query con `enabled: !authLoading && isAuthenticated && !!user.id`, ed evita ogni chiamata server prima che la sessione sia pronta.
- `signOut` aggiorna immediatamente lo stato locale anche se la chiamata remota fallisce, per garantire la transizione UI.
- Redirect post-login e post-logout usano `replace: true` per evitare stati di history sporchi.

### Database
- Migrazione che introduce `user_id` su tutte le tabelle (con FK `auth.users` e `ON DELETE CASCADE`).
- RLS policy per-utente (`auth.uid() = user_id`) su `profile`, `documents`, `visits`, `circumferences`, `body_composition`, `dexa_segments`, `blood_tests`.
- Trigger `on_auth_user_created` che invoca `handle_new_user` per popolare la riga `profile` di ogni nuovo utente.
- Pulizia dei dati demo single-user pre-esistenti.

---

## [0.3.0] — 2026-04-26 — Estrazione AI multi-formato

### Aggiunto
- Estrazione testo da `.docx` con `mammoth`.
- Estrazione "best-effort" da `.doc` legacy leggendo le stringhe UTF-16 dal contenitore CFB.
- Fallback automatico all'invio del binario all'AI quando il testo estratto è insufficiente.
- Supporto a `.pdf` (invio binario diretto al modello).
- Supporto a `.txt` (decode UTF-8).
- Server function `processExtraction` asincrona con polling lato client (`getExtractionStatus`).
- Schermata di revisione con navigazione tra più visite estratte dallo stesso documento.

### Modificato
- Modello AI cambiato da `google/gemini-2.5-flash` a `google/gemini-2.5-flash-lite`: ~2× più veloce sull'estrazione strutturata, riduce drasticamente i timeout.
- Timeout AI alzato a 90 s per gestire i PDF più pesanti.
- Aggiunta colonna `documents.extraction_error` per persistere l'errore in caso di fallimento.

---

## [0.2.0] — 2026-04-26 — Dashboard analitica

### Aggiunto
- Tab dashboard: **Peso**, **Composizione**, **Circonferenze**, **Esami**, **Storico**.
- Filtri per sezione (preset 3m / 6m / 1y / all + range custom) persistiti negli URL search params con validazione Zod.
- Componente `InsightCard` con messaggi automatici in linguaggio naturale generati da regole locali (zero AI), per ogni sezione.
- Valutazioni cliniche di riferimento:
  - BMI (categorie WHO),
  - grasso viscerale, % massa grassa, idratazione, rapporto vita/altezza (WHtR),
  - marker ematici (colesterolo, LDL/HDL, trigliceridi, glicemia, transaminasi, gamma GT, emoglobina).
- DEXA segmentale per arti e tronco quando disponibile.
- Lista storico con download del referto originale (signed URL) e cancellazione visita.
- Toggle tema chiaro/scuro.
- Modifica peso obiettivo inline.
- Hard reset di tutti i dati personali con dialog di conferma.

---

## [0.1.0] — 2026-04-26 — Bootstrap

### Aggiunto
- Setup iniziale TanStack Start v1 (React 19 + Vite 7, deploy Cloudflare Worker).
- Schema database iniziale: `profile`, `documents`, `visits`, `circumferences`, `body_composition`, `dexa_segments`, `blood_tests`.
- Bucket di storage `referti` (privato).
- Trigger `set_updated_at` per aggiornare automaticamente `updated_at` su update.
- Design system con design tokens in `src/styles.css` (Tailwind CSS v4 + oklch).
- Componenti shadcn/ui di base.
