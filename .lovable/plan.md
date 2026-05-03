
# Sezione "Dieta" — Piano alimentare nel calendario

## Obiettivo

Aggiungere una nuova area dell'app dove:
1. Carichi il documento della dietologa (DOCX/PDF) → l'AI estrae piano completo
2. Visualizzi lo schema settimanale come calendario (toggle settimana ↔ giorno)
3. Spunti i pasti consumati (aderenza)
4. Generi la lista della spesa per la settimana

Comportamento: **un solo piano attivo alla volta**. Caricare un nuovo piano archivia il precedente.

---

## 1. Database (nuova migrazione)

Quattro tabelle, tutte con `user_id` + RLS per-utente (stesso pattern già in uso).

### `diet_plans`
Piano alimentare nel suo insieme.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID | FK auth.users, ON DELETE CASCADE |
| `title` | TEXT | es. "Schema Nutrizionale 1900" |
| `objective` | TEXT | es. "educazione alimentare, dimagrimento" |
| `professional_name` | TEXT | nome dietologa |
| `kcal_target` | INTEGER | nullable |
| `start_date` | DATE | data emissione referto |
| `is_active` | BOOLEAN | default false, max 1 attivo per utente |
| `general_guidelines` | JSONB | array di indicazioni generali (acqua, olio, ecc.) |
| `meal_options` | JSONB | opzioni per categoria (colazione dolce/salata, spuntini, primi, secondi, contorni, equivalenze pane/cereali, ricette) |
| `document_id` | UUID | FK → documents (ON DELETE SET NULL) |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

Indice parziale: `UNIQUE (user_id) WHERE is_active = true`.

### `diet_weekly_schedule`
Schema settimanale ricorrente del piano (la tabella 7×5 della dietologa).

| Colonna | Tipo |
|---|---|
| `id`, `user_id`, `plan_id` (FK) | |
| `day_of_week` | SMALLINT 1..7 (lun=1) |
| `meal_slot` | TEXT enum: `breakfast`/`mid_morning`/`lunch`/`afternoon`/`dinner` |
| `description` | TEXT (es. "orzo/Caffè macchiato") |
| `details` | JSONB (alimenti, grammature) |

UNIQUE `(plan_id, day_of_week, meal_slot)`.

### `diet_meal_logs`
Aderenza giornaliera (check pasto).

| Colonna | Tipo |
|---|---|
| `id`, `user_id`, `plan_id` | |
| `log_date` | DATE |
| `meal_slot` | TEXT |
| `consumed` | BOOLEAN |
| `note` | TEXT |

UNIQUE `(user_id, log_date, meal_slot)`.

### `diet_shopping_lists`
Liste della spesa generate per settimana.

| Colonna | Tipo |
|---|---|
| `id`, `user_id`, `plan_id` | |
| `week_start` | DATE (lunedì) |
| `items` | JSONB array: `{ name, quantity, unit, category, checked }` |
| `created_at`, `updated_at` | TIMESTAMPTZ |

UNIQUE `(user_id, week_start)`.

RLS: per ogni tabella, 4 policy `select/insert/update/delete` con `user_id = auth.uid()`. Stesso pattern delle tabelle esistenti.

---

## 2. Estrazione AI dal documento

Nuova server function `uploadDietPlan` in `src/lib/diet.functions.ts`:

1. Riusa il flusso upload esistente (hash SHA-256 + tabella `documents`, controllo duplicati).
2. Estrae testo via `extractDocumentInput` (mammoth/CFB/PDF già pronti).
3. Chiama Lovable AI Gateway (`google/gemini-2.5-flash-lite`) con **tool calling** (structured output) per estrarre:
   - meta (titolo, obiettivo, kcal, professionista, data)
   - `general_guidelines` (lista bullet)
   - `weekly_schedule` (matrice 7×5)
   - `meal_options` (colazione/spuntini/pranzi/cene/contorni + equivalenze pane e cereali + ricette)
4. Step di **revisione manuale** (riusa pattern del `upload-dialog`): l'utente conferma o corregge prima del salvataggio.
5. Su conferma: transazione → disattiva piano precedente, inserisce `diet_plans` (is_active=true) + `diet_weekly_schedule`.

---

## 3. Routing & UI

Nuove route TanStack:

```text
src/routes/_authenticated/diet.tsx            → layout con tabs + Outlet
src/routes/_authenticated/diet.index.tsx      → calendario (default)
src/routes/_authenticated/diet.options.tsx    → opzioni pasto / equivalenze
src/routes/_authenticated/diet.guidelines.tsx → indicazioni generali
src/routes/_authenticated/diet.shopping.tsx   → lista della spesa
```

Aggiungere voce "Dieta" nella nav esistente (header dashboard).

### Vista calendario (route principale)

Toggle in alto: **Settimana** / **Giorno**. Default in base al viewport (desktop=settimana, mobile=giorno) con override persistito negli URL search params (Zod schema, come `dashboardSearchSchema`).

**Vista settimana** — griglia 6 colonne (slot meal a sx + 7 giorni). Ogni cella mostra `description` in compatta + checkbox aderenza. Cella cliccabile → drawer con dettagli e opzioni alternative.

**Vista giorno** — header con frecce ←/→ + datepicker (`@/components/ui/calendar`). Sotto, 5 card una per pasto: descrizione, opzioni alternative (da `meal_options`), checkbox "consumato", note libere.

Indicatore "oggi" e badge percentuale aderenza settimanale calcolata da `diet_meal_logs`.

### Opzioni / Equivalenze
Accordion con sezioni: colazione (dolce/salata), spuntini, primi, secondi (carne/pesce/uova/formaggi), contorni, equivalenze pane (50g pane = …), equivalenze cereali, ricette. Renderizzato da `meal_options` JSONB.

### Indicazioni generali
Lista leggibile delle bullet estratte dal documento (acqua, olio, integrali, alcolici…).

### Lista della spesa
Pulsante "Genera per la settimana del [data]" → server function `generateShoppingList` che:
1. Legge `diet_weekly_schedule` del piano attivo
2. Aggrega ingredienti dalle `details` JSONB e dalle `meal_options` predefinite
3. Categorizza (frutta/verdura, cereali, proteine, latticini, condimenti)
4. Salva in `diet_shopping_lists`
5. UI: lista con checkbox spesa-fatta, possibilità di editare/aggiungere voci a mano.

---

## 4. Upload flow

Riusare il pattern dell'attuale `upload-dialog.tsx`:

1. Drop/select file
2. Compute SHA-256 hash → check duplicato (su `documents.content_hash`)
3. Upload nel bucket `referti` (path `{user_id}/diet/{uuid}.{ext}`)
4. Server: estrazione AI → bozza in `documents.extraction_raw`
5. UI di revisione (form editabile con tabs: meta / settimana / opzioni / indicazioni)
6. Conferma → archiviazione piano precedente + insert nuovo piano

Toast espliciti per errori 402/429 dell'AI Gateway.

---

## 5. Sicurezza & qualità

- Tutte le server function usano `requireSupabaseAuth` middleware esistente.
- Validazione input con Zod (come `dashboard.functions.ts`).
- Errori sanificati con `safeError` esistente.
- Hash SHA-256 calcolato client-side prima dell'upload, indice unico già presente su `documents.content_hash`.

---

## 6. Documentazione

Aggiungere/aggiornare:
- `docs/diet-plan.md` (nuovo) — schema, flusso upload, struttura JSONB
- `docs/database.md` — sezione nuove tabelle
- `CHANGELOG.md` — voce v0.7.0
- `README.md` — menzione sezione Dieta tra le feature

---

## File creati / modificati

**Nuovi:**
- `supabase/migrations/<timestamp>_diet_plan.sql`
- `src/lib/diet.functions.ts` (server functions: upload, get active plan, log meal, generate shopping)
- `src/lib/diet-extraction.server.ts` (prompt + tool schema AI)
- `src/routes/_authenticated/diet.tsx` (+ `.index`, `.options`, `.guidelines`, `.shopping`)
- `src/components/diet/` (week-grid.tsx, day-view.tsx, meal-cell.tsx, options-accordion.tsx, shopping-list.tsx, upload-diet-dialog.tsx, plan-review-form.tsx)
- `docs/diet-plan.md`

**Modificati:**
- `src/components/dashboard.tsx` o header — link a "Dieta"
- `docs/database.md`, `CHANGELOG.md`, `README.md`

Stima: 1 migrazione + ~10 nuovi file UI + 2 server function file + aggiornamento doc.
