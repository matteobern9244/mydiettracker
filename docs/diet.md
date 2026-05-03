# Sezione Dieta

La sezione **Dieta** (`/diet`) gestisce il piano dietetico personale dell'utente: caricamento del documento del dietologo, estrazione AI, visualizzazione a calendario, diario di aderenza e lista della spesa.

## Principi

- **Un solo piano attivo per utente alla volta**: l'attivazione di un nuovo piano disattiva automaticamente il precedente. Lo storico dei piani precedenti resta in DB ma non è più visualizzato come attivo.
- **Tutto per utente con RLS**: ogni tabella ha policy `auth.uid() = user_id` su `select/insert/update/delete`.
- **Estrazione automatica + revisione manuale**: l'AI propone una bozza strutturata, l'utente conferma o corregge prima del salvataggio definitivo.

## Modello dati

| Tabella | Scopo | Note |
|---|---|---|
| `diet_plans` | Metadati del piano: titolo, obiettivo, kcal target, indicazioni generali (`jsonb`), opzioni pasto (`jsonb`), data inizio, professionista, flag `is_active`, link al `documents.id` originale | Indice unico parziale: `UNIQUE (user_id) WHERE is_active = true` |
| `diet_weekly_schedule` | Schema settimanale: una riga per `(plan_id, day_of_week 0–6, meal_slot)` con `description` e `details jsonb` | `meal_slot ∈ {breakfast, snack_morning, lunch, snack_afternoon, dinner}` |
| `diet_meal_logs` | Aderenza giornaliera: check pasto consumato per `(user_id, log_date, meal_slot)` | `consumed boolean`, `note` opzionale |
| `diet_shopping_lists` | Liste della spesa per `week_start` | `items jsonb` (array di `{name, qty, unit, category, checked}`) |

Tutti i dati sensibili restano isolati per utente; l'eliminazione di un `diet_plans` può fare cleanup applicativo dei figli.

## Estrazione AI

`src/lib/diet-extraction.server.ts`:

- Input: `.docx` (testo via `mammoth`), `.pdf` (binario diretto), `.txt` (raw).
- Modello: `google/gemini-2.5-flash` via Lovable AI Gateway (no API key utente).
- Output strutturato (tool calling) con schema dedicato:
  - `general_guidelines`: array di stringhe (consigli, regole, idratazione).
  - `meal_options`: oggetto con alternative equivalenti per slot pasto.
  - `weekly_schedule`: array di righe `{day_of_week, meal_slot, description, details}`.
  - Metadati piano: `title`, `objective`, `kcal_target`, `professional_name`, `start_date`.
- L'estrazione popola `documents.extraction_raw` come gli altri flussi e si aggancia al `extraction_status`.

## Server functions

`src/lib/diet.functions.ts` espone:

- `uploadDietDocument` — upload con hash SHA-256 + check duplicati, salva file su Storage e crea il record `documents`.
- `processDietExtraction` — lancia l'estrazione AI in background.
- `getDietExtractionStatus` — polling stato per la UI.
- `confirmDietPlan` — conferma i dati revisionati: crea il nuovo `diet_plans` come attivo, popola `diet_weekly_schedule`, disattiva il piano precedente.
- `getActiveDietPlan` — restituisce piano attivo + schema settimanale + log aderenza recenti.
- `toggleMealLog` — upsert su `diet_meal_logs` per check/uncheck di un pasto.
- `generateShoppingList` — aggrega ingredienti dallo schema settimanale per la `week_start` indicata e salva la lista.
- `updateShoppingList` — aggiorna stato `checked` o aggiunge voci manuali.
- `deleteDietPlan` — elimina un piano (con cascading applicativo).

Tutte le funzioni passano per `requireSupabaseAuth`; i payload sono validati con Zod.

## UI

`src/routes/_authenticated/diet.tsx` — pagina principale con:

1. **Header piano attivo**: titolo, obiettivo, kcal target, indicazioni generali in evidenza, percentuale di aderenza settimanale.
2. **Toggle vista**:
   - **Settimana**: griglia 7×5 (lun–dom × colazione/spuntino/pranzo/spuntino/cena). Ogni cella mostra descrizione del pasto e checkbox aderenza.
   - **Giorno**: card a tutta larghezza con switch giorno (frecce + selettore). Layout ottimizzato per mobile.
3. **Tab "Opzioni pasto"**: alternative equivalenti per ogni slot (es. colazioni, spuntini, secondi).
4. **Tab "Indicazioni generali"**: lista bullet delle regole generali del piano.
5. **Tab "Lista della spesa"**: generazione della lista per settimana, raggruppamento per categoria (proteine, verdura, latticini, ecc.), check + aggiunta manuale.
6. **CTA "Carica nuovo piano"**: apre `upload-diet-dialog.tsx` (wizard `Upload → Processing → Review → Confirm`).

## Flusso utente

1. Da dashboard → click su **Dieta** → `/diet`.
2. Se non c'è piano attivo, empty state con CTA **Carica piano dietetico**.
3. Upload del file della dietologa → check duplicati (hash) → estrazione AI in background.
4. Schermata di revisione: l'utente corregge eventuali errori (descrizione pasti, kcal, indicazioni).
5. Conferma → il vecchio piano viene disattivato, il nuovo diventa attivo, lo schema settimanale viene popolato.
6. Uso quotidiano: l'utente consulta il calendario, spunta i pasti consumati, genera la lista della spesa per la settimana corrente.

## Privacy

I documenti dietetici sono trattati con lo stesso modello di sicurezza dei referti:

- File su bucket privato `referti`, signed URL temporanei per il download.
- Nessun dato del piano lascia Lovable Cloud / Lovable AI Gateway.
- L'hard reset utente cancella anche i piani dietetici, lo schema, i log e le liste della spesa.
