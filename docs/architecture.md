# Architettura

Documento di riferimento per la struttura tecnica dell'applicazione.

## Runtime

L'app è una single-page TanStack Start v1 con SSR, distribuita come **Cloudflare Worker** tramite `@cloudflare/vite-plugin`. Il bundle SSR e i server functions girano sullo stesso Worker; gli asset statici sono serviti dal CDN di Cloudflare.

Compatibilità: `nodejs_compat` flag attiva. Le librerie usate (Web Crypto, mammoth, fetch) sono Worker-friendly. Non usiamo dipendenze Node-only.

## Routing

Routing file-based su `src/routes/`. Il plugin TanStack Router genera `routeTree.gen.ts` automaticamente.

```
src/routes/
├── __root.tsx              # shell HTML, providers (Query + Auth), <head> base
├── login.tsx               # /login?redirect=...
├── _authenticated.tsx      # layout guard
└── _authenticated/
    └── index.tsx           # / (dashboard, search params validati con Zod)
```

- `_authenticated.tsx` controlla `useAuth()` e fa redirect a `/login` con `replace: true` quando l'utente non è autenticato.
- `_authenticated/index.tsx` valida tutti i filtri URL con `zodValidator(...)`: tab attivo, preset, range custom, lista metriche visibili.

## Provider

In `__root.tsx`:

```tsx
<QueryClientProvider client={queryClient}>
  <AuthProvider>
    <Outlet />
    <Toaster />
  </AuthProvider>
</QueryClientProvider>
```

Il `QueryClient` è creato dentro `getRouter()` (in `src/router.tsx`) per evitare singleton globali che leggerebbero dati di altri utenti tra richieste SSR.

## Server functions

Tutte le server functions vivono in `src/lib/dashboard.functions.ts` e usano `createServerFn` di TanStack Start. Ogni funzione:

1. Passa per il middleware `requireSupabaseAuth` (in `src/integrations/supabase/auth-middleware.ts`) che valida il JWT e crea un client Supabase server-side con il token dell'utente: in questo modo le RLS policy si applicano automaticamente.
2. Valida il payload con uno schema Zod.
3. Esegue le query tramite il client Supabase autenticato.
4. Cattura gli errori interni con `safeError(userMessage, internal)`: il dettaglio finisce solo nei log del server, il client riceve solo un messaggio generico.

### Funzioni esposte

| Funzione | Scopo |
|---|---|
| `getDashboardData` | Carica profilo, visite, body composition, circonferenze, DEXA, esami, documenti |
| `updateTargetWeight` | Aggiorna `profile.target_weight_kg` |
| `uploadDocument` | Upload file + calcolo hash SHA-256 + check duplicati |
| `replaceDocument` | Sostituzione atomica di un documento (delete cascading + nuovo upload) |
| `processExtraction` | Avvia il job di estrazione AI sul documento |
| `getExtractionStatus` | Polling stato del job |
| `saveConfirmedData` | Persiste i dati confermati dall'utente dopo la revisione |
| `deleteVisit` | Elimina una visita e i dati collegati |
| `getDocumentUrl` | Genera signed URL temporanea per il download |
| `hardResetAllData` | Cancella tutti i dati dell'utente (visite, documenti, esami, file di storage) |

## Estrazione documenti

`src/lib/extraction.server.ts` contiene la logica di estrazione, separata in due fasi:

1. **`extractDocumentInput(buffer, fileName, mimeType)`** — restituisce `{ kind: "text", text }` o `{ kind: "binary", base64, mimeType, fileName }` a seconda del formato:
   - `.docx` → mammoth → testo.
   - `.txt` → UTF-8 decode.
   - `.doc` legacy → estrazione naive UTF-16 dal CFB; se il risultato è troppo povero (< 80 char), fallback binario.
   - `.pdf` → sempre binario.
2. **`extractWithAI(input)`** — chiama il **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`) col modello `google/gemini-2.5-flash-lite` e timeout di 90 s, restituendo un `ExtractedData` strutturato.

Vedi [`ai-extraction.md`](./ai-extraction.md) per il prompt e lo schema di output.

## Frontend

- **Stato server**: TanStack Query, query key sempre legata a `user.id` per isolare le cache.
- **Stato URL**: i filtri della dashboard sono nei search params, validati con Zod (`fallback` per resilienza a valori sporchi).
- **Stato locale**: `useState` per UI ephemeral (apertura dialog, step del wizard upload).
- **Mutazioni**: `useMutation` con `onSuccess` che invalida `["dashboard", user.id]`.

## Design system

- Tailwind CSS v4 configurato via `src/styles.css` con `@import "tailwindcss"` e tema custom in `@theme`.
- Tutti i colori sono **design tokens** in `oklch` (mai colori hardcoded nei componenti).
- Modalità chiara/scura tramite classe `dark` sul `<html>`, gestita da `useTheme`.
- Primitive shadcn/ui in `src/components/ui/`, customizzate solo via varianti.

## Performance

- `staleTime: 30s` di default per le query (vedi `getRouter` in `src/router.tsx`).
- Modello AI veloce (`flash-lite`) e timeout 90 s.
- Le pagine pesanti (dashboard) caricano i dati con un singolo `getDashboardData` server function: una sola network round-trip.

## Sezione Dieta

La sezione Dieta riusa l'architettura dell'app:

- Server functions in `src/lib/diet.functions.ts`, parser/AI in `src/lib/diet-extraction.server.ts`.
- Estrazione AI con `google/gemini-2.5-flash` via Lovable AI Gateway, structured output con tool calling.
- UI in `src/routes/_authenticated/diet.tsx` con toggle vista Settimana/Giorno e tab dedicate (calendario, opzioni pasto, indicazioni, lista della spesa).
- Wizard di upload `src/components/diet/upload-diet-dialog.tsx` allineato al wizard dei referti (hash duplicati, polling stato, revisione manuale).
- Vincolo "un solo piano attivo" applicato a livello DB con indice unico parziale; transizione gestita atomicamente in `confirmDietPlan`.
