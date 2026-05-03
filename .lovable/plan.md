# Fix scroll del dialog "Conferma piano estratto"

## Causa
`DialogContent` di shadcn ha già `grid gap-4 p-6` di base. Le mie classi `flex flex-col` + `max-h-[92vh]` entrano in conflitto col `grid`, e il `p-6` del primitive crea padding interno che impedisce a `flex-1 min-h-0 overflow-y-auto` di calcolare correttamente l'altezza → il contenuto centrale non scrolla.

Inoltre `DialogFooter` di shadcn forza `flex-col-reverse sm:flex-row` con classi che possono interferire.

## Fix in `src/components/diet/upload-diet-dialog.tsx`

1. **Forzare reset di `DialogContent`** con classi importanti:
   - `!max-w-5xl w-[95vw] !p-0 !gap-0 !block h-[92vh] overflow-hidden`
   - Annulla `grid`, padding e gap del primitive.

2. **Wrapper interno esplicito** `<div className="flex flex-col h-full">` con tre figli:
   - **Header**: `shrink-0` (no scroll)
   - **Body**: `flex-1 min-h-0 overflow-y-auto` ← garantisce lo scroll nativo
   - **Footer**: `shrink-0` come `<div>` invece di `DialogFooter` (per evitare le sue classi flex-reverse)

3. **Body sempre scrollabile**: tutti gli step (upload/processing/review/error) renderizzano dentro il body scrollabile.

4. **Form review**: rimuovere `h-full` dal wrapper interno (il body padre già scrolla); il `ReviewForm` resta com'è.

5. **Verifica usabilità review**:
   - Tabs giorni: senza contatore "5/5" (già fatto).
   - Textarea pasti `min-h-24 resize-y`, due colonne su desktop.
   - Accordion indicazioni/opzioni collassati di default.
   - Footer con summary "X/35 celle · Y indicazioni · Z opzioni" e pulsanti Annulla/Conferma sempre visibili.

## Out of scope
Nessuna modifica a server functions, DB o tipi.
