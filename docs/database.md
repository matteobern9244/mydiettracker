# Database

Schema PostgreSQL gestito da Lovable Cloud, modificato esclusivamente tramite migrazioni SQL versionate in `supabase/migrations/`.

## Principi

- **Single tenant per utente**: ogni tabella ha `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- **Row Level Security attiva ovunque**, con policy per-utente (`auth.uid() = user_id`).
- **Cancellazione a cascata**: eliminare un utente o una visita pulisce automaticamente tutti i dati collegati.
- **Trigger `set_updated_at`** per mantenere aggiornata la colonna `updated_at` dove presente.
- **Bootstrap automatico del profilo**: alla creazione di un nuovo utente in `auth.users`, il trigger `on_auth_user_created` crea la riga `profile` corrispondente.

## Tabelle

### `profile`
Anagrafica e impostazioni dell'utente. Una riga per utente (`UNIQUE (user_id)`).

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK auth.users | UNIQUE |
| `full_name`, `email`, `phone`, `profession` | TEXT | |
| `birth_date` | DATE | |
| `age`, `height_cm` | INTEGER / NUMERIC | |
| `target_weight_kg` | NUMERIC(5,2) | obiettivo personale |
| `family_doctor`, `goal` | TEXT | |
| `family_history`, `pathologies`, `food_preferences`, `food_diary`, `weight_history` | JSONB | strutture libere |
| `medications` | JSONB array | |
| `allergies`, `intolerances` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `documents`
File originali caricati dall'utente.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK auth.users | |
| `original_name` | TEXT | |
| `storage_path` | TEXT | path nel bucket `referti` |
| `mime_type`, `size_bytes` | TEXT / INTEGER | |
| `content_hash` | TEXT | SHA-256 esadecimale del contenuto |
| `extraction_status` | TEXT | `pending` / `processing` / `extracted` / `confirmed` / `failed` |
| `extraction_error` | TEXT | messaggio di errore in caso di fallimento |
| `extraction_raw` | JSONB | output AI raw, utile per debug |
| `uploaded_at` | TIMESTAMPTZ | |

**Indice unico anti-duplicato**:
```sql
CREATE UNIQUE INDEX documents_user_content_hash_unique
  ON public.documents (user_id, content_hash)
  WHERE content_hash IS NOT NULL;
```

### `visits`
Singola visita dietologica.

| Colonna | Tipo |
|---|---|
| `id` | UUID PK |
| `user_id` | UUID FK auth.users |
| `visit_date` | DATE |
| `weight_kg` | NUMERIC(5,2) |
| `notes` | TEXT |
| `document_id` | UUID FK documents (ON DELETE SET NULL) |
| `created_at`, `updated_at` | TIMESTAMPTZ |

Indice: `idx_visits_date (visit_date DESC)`.

### `circumferences`
Misure antropometriche per visita (UNIQUE per `visit_id`).

Colonne: `arm_cm`, `waist_cm`, `abdomen_cm`, `thigh_cm`, `hips_cm`, `chest_cm`, `neck_cm`, `forearm_cm`, `wrist_cm` (tutte `NUMERIC(5,2)`).

### `body_composition`
Composizione corporea per visita (UNIQUE per `visit_id`).

Colonne: `fat_mass_pct`, `lean_mass_kg`, `bone_mass_kg`, `bmi`, `metabolic_age`, `hydration_pct`, `visceral_fat`.

### `dexa_segments`
Dati DEXA segmentali. UNIQUE su `(visit_id, segment)`.

`segment ∈ { right_arm, left_arm, right_leg, left_leg, trunk }`.

### `blood_tests`
Esami ematochimici. Possono essere collegati a una visita (`visit_id` ON DELETE SET NULL) o indipendenti.

Colonne: `test_date`, `hemoglobin`, `glucose`, `gamma_gt`, `alt`, `ast`, `total_cholesterol`, `hdl`, `ldl`, `triglycerides`, `notes`.

Indice: `idx_blood_tests_date (test_date DESC)`.

## Storage

Bucket privato **`referti`** in Lovable Cloud Storage.

- Path: `{user_id}/{uuid}.{ext}`.
- Accesso: solo signed URL temporanee generate da `getDocumentUrl`.
- Policy storage: solo l'utente proprietario può leggere/scrivere/cancellare i propri file.

## Funzioni e trigger

- **`set_updated_at()`** — aggiorna `NEW.updated_at = now()`. Attivo su `profile` e `visits`.
- **`handle_new_user()`** + trigger **`on_auth_user_created`** — popola `profile` ad ogni nuovo utente registrato.

## Migrazioni

Cronologia (ordine di applicazione):

1. `20260426173712_…sql` — schema iniziale (tabelle, RLS open per la demo single-user, bucket storage).
2. `20260426173731_…sql` — funzione `set_updated_at` con `search_path = public`.
3. `20260426184013_…sql` — colonna `documents.extraction_error`.
4. `20260426191722_…sql` — multi-utente: `user_id` su tutte le tabelle, RLS per-utente, indici, pulizia dati demo.
5. `20260426192532_…sql` — trigger `on_auth_user_created` per `handle_new_user`.
6. `20260426195431_…sql` — colonna `documents.content_hash` + indice unico anti-duplicato.

## Esempio di policy RLS

```sql
CREATE POLICY "visits_select_own"
  ON public.visits FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "visits_insert_own"
  ON public.visits FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
-- update e delete analoghi
```

Lo stesso pattern è applicato a tutte le tabelle utente.
