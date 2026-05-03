## Obiettivo

Usare il font **Outfit Variable** (lo stesso di TightWallet) in tutta l'applicazione.

## Modifiche

**1. `src/styles.css`** — aggiungere in cima:
- `@import "@fontsource-variable/outfit";`
- Due `@font-face` di override con `font-display: block` (latin + latin-ext) come in TightWallet.
- Aggiungere nel blocco `@theme inline` due token:
  - `--font-sans: "Outfit Variable", ui-sans-serif, system-ui, sans-serif;`
  - `--font-display: "Outfit Variable", ui-sans-serif, system-ui, sans-serif;`
- In `@layer base`:
  - `body { font-family: var(--font-sans); }`
  - `button, input, textarea, select { font-family: inherit; }`
- Selettori globali per portali Radix/Sonner/menu/tooltip e Recharts → `font-family: var(--font-sans)`.
- `@media (display-mode: standalone)` → forza `font-family: var(--font-sans) !important` per PWA.

**2. `package.json`** — `@fontsource-variable/outfit` (già installato in questa sessione).

Nessuna modifica ai componenti: ereditano automaticamente.
