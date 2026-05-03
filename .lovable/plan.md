# Ridisegno UI: "Conferma il piano estratto"

## Problema attuale
Il dialog mostra lo schema settimanale come tabella 7×5 dentro un modale stretto (`max-w-3xl`). Le celle diventano colonnine verticali con testo spezzettato lettera per lettera → illeggibile e impossibile da modificare bene.

## Obiettivo
Trasformare il modale in una review leggibile, modificabile e responsive, mantenendo le stesse API server (`uploadDietDocument` / `confirmDietPlan`) e lo stesso `DietPlanDraft` — nessuna modifica DB.

## Modifiche (solo `src/components/diet/upload-diet-dialog.tsx`)

### 1. Container del dialog
- Allargare a `max-w-5xl`, altezza `max-h-[92vh]`, body in `flex-col` con `ScrollArea` interna.
- Header sticky in alto, footer sticky in basso.

### 2. Sezione "Metadati" (in alto, invariata logica)
- Stessa griglia 2 colonne (Titolo, Calorie, Obiettivo, Dietologa, Data emissione) ma con spaziature più generose e label leggibili.

### 3. Sezione "Schema settimanale" — nuovo layout
Sostituire la tabella 7×5 con un sistema **a Tab per giorno**:

```text
[ Lun | Mar | Mer | Gio | Ven | Sab | Dom ]   ← Tabs
┌─────────────────────────────────────────┐
│ Colazione           [Textarea ampia]    │
│ Spuntino mattina    [Textarea ampia]    │
│ Pranzo              [Textarea ampia]    │
│ Spuntino pomeriggio [Textarea ampia]    │
│ Cena                [Textarea ampia]    │
└─────────────────────────────────────────┘
```

- Usare `Tabs` di shadcn (già presenti nel progetto) con 7 trigger (`Lun…Dom`).
- Default selezionato: giorno corrente.
- Ogni `TabsContent` mostra 5 card con label (Colazione, Spuntino mattina, Pranzo, Spuntino pomeriggio, Cena) e una `Textarea` larga (`w-full`, `min-h-24`, `rows={3}`, `resize-y`).
- Mostrare contatore caratteri / placeholder "Nessun pasto indicato" quando vuoto.
- Pulsanti utili in cima al pannello del giorno:
  - "Copia da giorno…" (menu dropdown con gli altri 6 giorni) per duplicare rapidamente.
  - "Svuota giorno".

### 4. Logica di update
Mantenere la stessa logica `findIndex(day_of_week, meal_slot)` con `setField("weekly_schedule", next)`; cambia solo il layout di rendering, non lo shape dei dati.

### 5. Sezione "Indicazioni & opzioni" (collassabile)
- Sostituire il piccolo paragrafo riassuntivo con due `Accordion` (collassati di default):
  - **Indicazioni generali** → lista modificabile (textarea per item, bottone aggiungi/rimuovi).
  - **Opzioni pasto** → per ogni meal_slot, lista di alternative (input + add/remove).
- Update via `setField("general_guidelines", …)` e `setField("meal_options", …)`.

### 6. Footer
- Riga riepilogo a sinistra: "X celle compilate · Y indicazioni · Z opzioni".
- Bottoni "Annulla" / "Conferma e salva" a destra invariati.

### 7. Stati upload / processing / error
- Rimangono come oggi, solo allineati al nuovo width con padding maggiore.

## Dettagli tecnici
- Nessun nuovo package: usare `@/components/ui/tabs`, `accordion`, `card`, `dropdown-menu` già presenti.
- Nessuna modifica a `src/lib/diet.functions.ts`, `diet-extraction.server.ts`, schema DB o tipi `DietPlanDraft`.
- Mantenere typesafe: stessi tipi, stesse mutation, stesso flow.

## Out of scope
- Editing avanzato della pagina `/diet` (calendario) non viene toccato.
- Nessun cambio di estrazione AI o di prompt.
