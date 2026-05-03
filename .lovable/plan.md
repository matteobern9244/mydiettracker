# Fix grafica PWA/mobile dashboard + frecce Lista della spesa

## Problemi rilevati

1. **Header dashboard in overflow su mobile/PWA**: il titolo "My Diet Tracker", il sottotitolo e i bottoni "Dieta" + "Carica" causano un overflow orizzontale (vedi screenshot: il logo e parte del contenuto vengono "tagliati" a sinistra). Causa: padding `px-4`, due bottoni con testo+icona sempre visibili, max-width fisso sul sottotitolo.
2. **Frecce ◀ ▶ in "Lista della spesa" non scorrono settimana**: visivamente cliccabili ma non avanzano la settimana di riferimento. Causa: `setDate(addDays(weekStart, ±7))` aggiorna `search.date` con `navigate({ search: ... })` ma manca `replace: true`/`from`, e il `useEffect([weekStart])` riceve la stessa stringa quando non ricalcolata. Inoltre l'`onPrev`/`onNext` lavora sull'oggetto `weekStart` (Date) ma la `ShoppingView` riceve la stringa: l'header mostra la nuova settimana ma `useEffect` non riparte perché l'`isoDate(weekStart)` resta uguale fino a re-render del padre (race con il re-render React Router).

## Cambiamenti

### `src/components/dashboard.tsx` (header responsive)
- Wrappo `<div>` root con `overflow-x-hidden` per impedire overflow PWA su iOS.
- Ridotto padding mobile a `px-3` (header e main).
- Rimosso `max-w-[180px]` rigido sul sottotitolo: uso `flex-1 min-w-0` + `truncate` su titolo/sottotitolo.
- Bottoni "Dieta" e "Carica" diventano icon-only su mobile (`size="icon"`), full width da `sm:` con label.
- Logo `shrink-0` per non collassare.
- Riduco gap mobile (`gap-1`) tra azioni.

### `src/routes/_authenticated/diet.tsx` (frecce spesa)
- `setDate` aggiunge `replace: true` per evitare history spam.
- In `<ShoppingView>` passo direttamente i callback con la **nuova data calcolata fuori** e uso `from: Route.fullPath` su `navigate` per garantire il rerender.
- Cambio `onPrev/onNext` per usare `setDate(addDays(currentDate, ±7))` invece di `weekStart` così la dipendenza `weekStart` cambia anche quando si era a metà settimana.
- Nel componente `ShoppingView`, sostituisco il `useEffect([weekStart])` con un effetto che resetta `items=null` PRIMA del fetch per mostrare lo spinner ad ogni cambio settimana (feedback visivo immediato che il click ha effetto).

## Note

Nessuna modifica al backend. Solo CSS responsive + navigation routing.
