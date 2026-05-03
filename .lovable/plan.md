## Obiettivo

Risolvere step-by-step i problemi della sezione **Dieta** (calendario, opzioni, spesa, estrazione AI) e aggiungere funzionalità di reset completo. Tutto responsive, senza regressioni rispetto a quanto già funzionante.

---

## 1. Calendario — leggibilità mobile + desktop

**Mobile (PWA)**
- Su mobile il calendario forza vista **"Giorno"** ma resta possibile passare a "Settimana". In settimana attualmente la griglia 760px obbliga lo scroll orizzontale: testi tagliati e pulsanti "Segna" troppo piccoli.
- Modifica `WeekGrid` in `src/routes/_authenticated/diet.tsx`:
  - su `< md`: layout a **carosello verticale di giorni** (un giorno per "card" con tutti i 5 pasti) invece della griglia 7×5; navigazione orizzontale tra giorni con swipe + frecce esistenti.
  - su `≥ md`: mantenere griglia ma con `min-w-[980px]`, padding interno cella `p-3`, `text-sm`, `line-clamp-4`, intestazioni giorno più grandi e "oggi" evidenziato con bordo + sfondo.
- `DayView` (mobile/giorno): cards più ampie, font `text-base` per la descrizione, alternative con badge cliccabile.

**Desktop**
- Aumentare leggibilità: `text-[13px] leading-snug`, niente più `line-clamp-3` rigido (espandi su hover/click con popover).
- Tooltip / popover su click cella per vedere descrizione completa.

## 2. Drag & Drop tra celle del calendario (effetto wow, robusto)

- Libreria: **`@dnd-kit/core`** + **`@dnd-kit/modifiers`** (già supportato da React 19, no native HTML5 DnD per garantire mobile touch).
- Ogni cella `WeekGrid` diventa sia `useDraggable` (con maniglia visibile su hover/long-press mobile) sia `useDroppable`.
- Comportamenti:
  - **Drag semplice** = sposta (svuota origine, scrive destinazione).
  - **Drag + tasto Alt/Option (desktop) o long-press + "duplica" toggle (mobile)** = copia.
  - Su drop, animazione di "swap" se entrambe le celle hanno contenuto (overlay con preview).
- Modifiche:
  - Nuovo server fn `updateScheduleCell(planId, dayOfWeek, mealSlot, description)` in `src/lib/diet.functions.ts` (upsert con `onConflict: "plan_id,day_of_week,meal_slot"`; serve unique constraint nella tabella → migration).
  - Ottimismo client: aggiornamento immediato del `scheduleMap` via `queryClient.setQueryData` + invalidazione.
- Fallback accessibile: menu kebab su ogni cella con "Copia da…" / "Sposta verso…" (lista giorni × pasti) per chi non può/non vuole trascinare.

**Migration**: aggiungere unique `(plan_id, day_of_week, meal_slot)` su `diet_weekly_schedule` (verificare che non esista già; se sì, skip).

## 3. Opzioni — badge numerici disallineati

In `OptionsView` la `Badge` con il conteggio è inline-flow nel `AccordionTrigger`, dove `AccordionTrigger` usa `flex justify-between`: il badge va a destra invece che vicino al titolo. Soluzione:
- Wrappare `{title} <Badge>` in un `<span className="flex items-center gap-2">` allineato a sinistra, lasciando la chevron della Accordion a destra.
- Stesso fix nel pannello "Opzioni" del dialog di review.

## 4. Spesa — frecce, scroll, "cancella tutto"

Bug attuali:
- Le frecce in `ShoppingView` chiamano `setDate(addDays(weekStart, ±7))`. Funzionano ma il `useEffect` dipende solo da `weekStart` (string) → corretto. Il problema reale è che l'header `CardHeader` con `flex-row items-center justify-between` non ridimensiona bene su mobile (le frecce escono dal contenitore e diventano non-cliccabili). Fix: header in 2 righe su `< sm`, frecce con `shrink-0`.
- Scroll: la lista è dentro `CardContent` senza max-height — su mobile col `tab` sticky della pagina non scrolla bene. Aggiungere `max-h-[70vh] overflow-y-auto pr-1` al contenuto della lista (non all'intera card) oppure rimuovere altezze fisse parent. Verifico che non ci sia un overflow:hidden bloccante.
- **Cancella tutta la spesa**: nuovo bottone `Svuota lista` (con conferma) accanto a "Rigenera"; chiama `onSave([])` o nuovo `clearShoppingList(weekStart)`. Aggiungo anche cestino "rimuovi categoria".

## 5. Estrazione AI più completa (no troncamenti)

Il documento è ricco e l'AI taglia. Cause + fix in `src/lib/diet-extraction.server.ts`:
- Modello attuale `google/gemini-3-flash-preview`: alza il contesto/qualità passando a **`google/gemini-2.5-pro`** (default) con fallback a flash su 429/timeout. Pro gestisce meglio schemi grandi.
- Aumentare `max_tokens` esplicito (gateway accetta `max_tokens`): mettere `max_tokens: 16000` per non troncare la risposta JSON.
- **Prompt esplicitamente esaustivo**: aggiungere regole del tipo "NON riassumere", "trascrivi VERBATIM ogni riga della tabella e ogni opzione", "estrai TUTTE le indicazioni anche se sono 20+", "estrai TUTTE le ricette con ingredienti completi", "non saltare grammature".
- Alzare i limiti di Zod: `meal_options.*.max(50)` → `max(200)`, `general_guidelines.max(100)` → `max(200)`, `weekly_schedule.max(100)` → invariato (35 max), `recipes.max(50)` → `max(100)`. Estendere anche lunghezze (`max(2000)` → `max(4000)` dove serve).
- Strategia **2-pass** quando il documento è grande (> ~30k char di testo estratto): primo pass solo meta+weekly_schedule+guidelines, secondo pass solo meal_options+recipes. Merge lato server. Riduce i tagli su risposta singola.
- Log della dimensione della risposta per debug (server log).

## 6. Reset completo "Dieta" lato utente

Nuovo server fn `resetDietData()` in `src/lib/diet.functions.ts`:
- Cancella in ordine: `diet_meal_logs`, `diet_shopping_lists`, `diet_weekly_schedule`, `diet_plans` (tutti per `user_id` corrente).
- Cancella i `documents` di tipo dieta (filtrati per `storage_path LIKE '%/diet/%'`) e i relativi file in storage `referti`.
- UI: nella card "Gestione piano" (e anche in mancanza di piano nello stato vuoto) aggiungere un bottone **"Cancella tutti i dati Dieta"** con `AlertDialog` che richiede di digitare `ELIMINA` per confermare. Toast di successo + invalidate queries.

## 7. QA / no regressioni

Step di verifica dopo ogni cambiamento:
1. Build + dev preview.
2. Screenshot mobile (375×812) e desktop (1440×900) della pagina dieta su tutti i 4 tab.
3. Test drag&drop tra due celle non vuote (swap), tra cella vuota e cella piena (move), con Alt (copy).
4. Test estrazione su un documento di prova (chiedo all'utente di ricaricare lo stesso file dopo il deploy).
5. Test "Reset Dieta": dopo conferma, la pagina torna allo stato vuoto.

---

## Dettagli tecnici (per riferimento)

- File principali toccati:
  - `src/routes/_authenticated/diet.tsx` (calendario responsive, DnD, opzioni allineamento, spesa header/scroll/clear, reset UI)
  - `src/components/diet/upload-diet-dialog.tsx` (allineamento badge nel review)
  - `src/lib/diet.functions.ts` (`updateScheduleCell`, `clearShoppingList`, `resetDietData`, alza limiti Zod)
  - `src/lib/diet-extraction.server.ts` (modello, prompt, max_tokens, 2-pass)
  - Migration SQL: unique constraint su `diet_weekly_schedule(plan_id, day_of_week, meal_slot)` se mancante
- Nuove dipendenze: `@dnd-kit/core`, `@dnd-kit/modifiers` (via `bun add`).
- Ordine implementazione: (1) badge opzioni quick fix → (2) spesa fix + clear-all → (3) reset dieta → (4) calendario responsive → (5) drag&drop → (6) AI extraction più esaustiva. Verifica dopo ognuno.
