
# Piano: estrazione completa multi-visita + reset totale

Due richieste indipendenti ma legate al ciclo di vita dei dati.

---

## 1. Estrazione di TUTTE le visite dal documento

### Problema attuale
Lo schema AI in `src/lib/extraction.server.ts` dichiara `visit` come **oggetto singolo** (una sola data, un solo peso). Quando il referto contiene più colonne (es. visite del 13.6.25, 31.1.25, ecc.), l'AI ne estrae una sola e ignora le altre. Anche circonferenze, composizione corporea e DEXA sono singoli oggetti, non array.

### Modifiche allo schema AI (`src/lib/extraction.server.ts`)
Riscrivere `EXTRACTION_SCHEMA` con la nuova struttura:

```
{
  visits: [
    {
      visit_date: "YYYY-MM-DD",
      weight_kg, notes,
      circumferences: { arm_cm, waist_cm, ... },     // legate alla visita
      body_composition: { fat_mass_pct, bmi, ... },
      dexa_segments: [ { segment, fat_mass_pct, lean_mass_kg } ]
    },
    ...                                              // una entry per ogni colonna/data presente nel referto
  ],
  blood_tests: [ ... ],                              // restano indipendenti (date proprie)
  profile_updates: { ... }                           // dati anagrafici, una sola volta
}
```

Aggiornare anche il **system prompt** per istruire esplicitamente: «I referti dietologici italiani usano una tabella con **una colonna per ogni visita**. Devi creare un elemento di `visits` per OGNI colonna/data che trovi, anche se alcuni valori sono vuoti. Non saltare nessuna colonna.»

### Tipi (`src/lib/types.ts`)
Sostituire `ExtractedData` con:

```ts
export interface ExtractedVisit {
  visit_date: string | null;
  weight_kg: number | null;
  notes: string | null;
  circumferences: Circumferences;
  body_composition: BodyComposition;
  dexa_segments: DexaSegment[];
}

export interface ExtractedData {
  visits: ExtractedVisit[];
  blood_tests: Array<...>;
  profile_updates: ProfileUpdates;
}
```

### Salvataggio (`src/lib/dashboard.functions.ts` → `saveConfirmedData`)
Trasformare la logica attuale (una visita) in un **loop**:
- Per ogni `extracted.visits[i]`:
  - Inserire row in `visits` (legare `document_id` solo alla prima, oppure a tutte — preferiamo a tutte, così cancellando il documento si rimuovono tutte).
  - Inserire `circumferences`, `body_composition`, `dexa_segments` con il `visit_id` appena creato.
- `blood_tests` restano collegati alla prima visita (o a nessuna; meglio: alla prima per semplicità di cleanup).
- `profile_updates` invariato.
- Restituire `{ visitIds: [...] }`.

### Frontend (`src/components/upload-dialog.tsx`)
Riscrivere `ReviewForm` per gestire un **array di visite**:
- Selettore/tab in cima: "Visita 1 di N — 13/06/2025", con frecce ◀ ▶ o tabs.
- Per la visita selezionata mostrare: data, peso, note, circonferenze, composizione, DEXA (le sezioni esistenti).
- Pulsanti **"+ Aggiungi visita"** e **"Rimuovi questa visita"** in caso l'AI sbagli.
- La sezione "Esami ematochimici" e "Profilo" restano fuori dalle tab (globali al documento).
- Validazione: bottone "Conferma e salva" disabilitato se *qualsiasi* visita ha `visit_date` vuota; mostrare badge rosso sulla tab incompleta.

### Toast finale
"Salvate N visite dal referto" invece di "Visita salvata".

---

## 2. Hard reset totale

### Backend — nuova server function (`src/lib/dashboard.functions.ts`)
```ts
export const hardResetAllData = createServerFn({ method: "POST" })
  .inputValidator((input: { confirm: "RESET" }) => {
    if (input.confirm !== "RESET") throw new Error("Conferma mancante");
    return input;
  })
  .handler(async () => {
    // 1) Lista tutti gli oggetti nello storage e li rimuove
    const { data: files } = await supabaseAdmin.storage.from("referti").list("referti");
    if (files?.length) {
      await supabaseAdmin.storage.from("referti").remove(files.map(f => `referti/${f.name}`));
    }
    // 2) Cancella tutte le righe (ordine: figli → padri)
    await supabaseAdmin.from("blood_tests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("dexa_segments").delete().neq("id", "...");
    await supabaseAdmin.from("body_composition").delete().neq("id", "...");
    await supabaseAdmin.from("circumferences").delete().neq("id", "...");
    await supabaseAdmin.from("visits").delete().neq("id", "...");
    await supabaseAdmin.from("documents").delete().neq("id", "...");
    // 3) Reset profilo: azzera campi medici ma mantiene la riga (target_weight_kg = null)
    const { data: prof } = await supabaseAdmin.from("profile").select("id").maybeSingle();
    if (prof) {
      await supabaseAdmin.from("profile").update({
        full_name: null, email: null, phone: null, profession: null,
        age: null, height_cm: null, target_weight_kg: null,
        family_doctor: null, allergies: null, intolerances: null,
        // jsonb tornano vuoti
        family_history: {}, pathologies: {}, medications: [],
        food_preferences: {}, food_diary: {}, weight_history: {},
      }).eq("id", prof.id);
    }
    return { ok: true };
  });
```

### Frontend (`src/components/dashboard.tsx`)
- Nuovo bottone **"Cancella tutti i dati"** in fondo alla dashboard (sezione "Zona pericolosa"), stile `variant="destructive"`, icona `Trash2`.
- Al click apre un `AlertDialog` (shadcn/ui, già installato in `src/components/ui/alert-dialog.tsx`):
  - Titolo: "Hard reset totale"
  - Descrizione: «Verranno cancellati definitivamente: tutte le visite, tutti gli esami, tutti i file caricati e i dati anagrafici. Operazione **irreversibile**.»
  - Campo input: «Per confermare, scrivi `RESET` nel campo qui sotto»
  - Bottone "Cancella tutto" abilitato solo se input === "RESET"
- Al successo: toast "Tutti i dati sono stati cancellati", invalidate query `["dashboard"]`.

---

## File toccati
1. `src/lib/extraction.server.ts` — schema AI (visits[]) + prompt aggiornato
2. `src/lib/types.ts` — nuovi tipi `ExtractedVisit` + `ExtractedData`
3. `src/lib/dashboard.functions.ts` — `saveConfirmedData` con loop + nuova `hardResetAllData`
4. `src/components/upload-dialog.tsx` — review form multi-visita con tab/navigazione
5. `src/components/dashboard.tsx` — sezione "Zona pericolosa" + AlertDialog di conferma

Nessuna nuova migration DB necessaria (lo schema attuale supporta già N visite, è solo il pipe di estrazione/UI a essere stato semplificato a 1).
