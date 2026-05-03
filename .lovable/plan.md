## Problema

L'hook `useTheme` (in `src/hooks/use-theme.ts`) è quello che applica la classe `.dark` al `<html>` e legge la preferenza salvata. Però viene invocato SOLO dentro il componente `ThemeToggle`, che è montato nella dashboard ma non nella pagina Dieta.

Risultato: se apri direttamente `/diet` (anche dopo refresh in PWA o navigando senza passare dalla dashboard), la classe `.dark` non viene applicata e la pagina resta in tema chiaro indipendentemente dalla preferenza salvata.

## Fix

Spostare l'inizializzazione del tema al livello del root layout così è sempre attiva, indipendentemente dalla pagina visitata.

### Modifiche

**`src/routes/__root.tsx`**
- Importare `useTheme` da `@/hooks/use-theme`.
- Invocarlo dentro `RootComponent` (basta `useTheme()` — l'effect interno gestisce la classe `.dark` su `document.documentElement`).

Questo garantisce che ogni pagina (Dieta, Dashboard, ecc.) rispetti la preferenza tema salvata in `localStorage` o quella di sistema.

Nessuna modifica necessaria a `diet.tsx`: usa già token semantici (`bg-background`, `bg-card`, `text-muted-foreground`, ecc.) e il gradiente `--gradient-soft` ha già la variante dark in `styles.css`.
