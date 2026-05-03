# Stampa Lista della Spesa in PDF (anteprima A4 verticale, B/N)

## Obiettivo
Aggiungere un pulsante "Stampa" nella vista Spesa che apra l'anteprima di stampa di un PDF A4 verticale con la lista della settimana selezionata, ottimizzato per stampa in bianco e nero, con elenco puntato (no checkbox). Il PDF non deve essere salvato sul dispositivo: deve aprirsi in una nuova scheda con il dialog di stampa nativo.

## Approccio tecnico
Generazione lato client con `jsPDF` (già adatto a edge/Worker, niente server). Apertura in nuova tab via `window.open(blobUrl)` + `iframe.contentWindow.print()` come fallback. La stessa data URL si può aprire direttamente: la maggior parte dei browser desktop/mobile/PWA mostra il PDF e permette stampa o salvataggio dall'utente — senza forzare download.

Strategia "anteprima di stampa" universale:
1. Genero il PDF con `jsPDF` in memoria.
2. Creo un `Blob` `application/pdf` e un object URL.
3. Apro l'URL in `window.open(url, "_blank")` — il browser mostra l'anteprima PDF nativa con bottone Stampa. Funziona su Chrome/Safari/Firefox desktop, Safari iOS (apre in viewer), Chrome Android.
4. Per PWA standalone iOS dove `window.open` può essere bloccato, fallback: appendere `<iframe>` nascosto con `src=blobUrl`, attendere `onload` e chiamare `iframe.contentWindow.print()`.

## Dipendenze
- `jspdf` (≈50KB gz, edge-safe, no native deps).

## File modificati

### `src/lib/print-shopping.ts` (nuovo)
- `printShoppingList({ weekStart, items })`: costruisce il PDF A4 portrait, font Helvetica nero su bianco, header con titolo "Lista della spesa" + data settimana, raggruppamento per categoria, ogni riga = "• Nome — quantità", paginazione automatica, footer con numero pagina.
- Apre l'anteprima: prova `window.open(url)`; se `null` (popup bloccato/PWA), monta iframe nascosto e invoca `print()`.

### `src/routes/_authenticated/diet.tsx`
- Aggiungo icona `Printer` agli import lucide.
- In `ShoppingView` aggiungo bottone "Stampa" accanto a "Svuota lista":
  - `disabled` quando `loading || !items || items.length === 0`.
  - `onClick`: chiama `printShoppingList({ weekStart, items })`.

## Layout PDF (B/N)
- Pagina A4 (210×297 mm), margini 18mm.
- Titolo "Lista della spesa" 18pt bold.
- Sottotitolo "Settimana del <data lunga in italiano>" 11pt.
- Linea orizzontale 0.5pt.
- Per ogni categoria: heading 12pt bold maiuscolo, poi righe 11pt con bullet "•" + nome + (se quantità) " — <quantità>" in corsivo.
- Spaziatura riga 6mm; gap categoria 4mm.
- Footer "Pagina N/M" centrato 9pt grigio scuro.
- Nessun colore: solo nero (`setTextColor(0,0,0)`). Niente sfondi.

## Note
- `useServerFn` non usato: tutto client.
- Filename suggerito al browser: `lista-spesa-YYYY-MM-DD.pdf` (impostato via `Blob` + nome nel link, comunque l'utente decide se stampare o salvare dall'anteprima).
