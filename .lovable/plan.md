# Login Google + multi-utente

Obiettivo: nessuno può vedere/usare l'app senza prima accedere con Google. Ogni utente vede solo i propri dati. Le estrazioni AI continuano a usare Lovable AI Gateway così com'è.

---

## 1. Migrazione DB — multi-utente

Una sola migrazione che:

**a) Aggiunge `user_id uuid` a tutte le tabelle dati**
- `profile.user_id` UNIQUE NOT NULL (un profilo per utente, FK → `auth.users(id) ON DELETE CASCADE`)
- `documents.user_id` NOT NULL
- `visits.user_id` NOT NULL
- `circumferences.user_id` NOT NULL
- `body_composition.user_id` NOT NULL
- `dexa_segments.user_id` NOT NULL
- `blood_tests.user_id` NOT NULL

Per i dati esistenti uso un placeholder UUID temporaneo (NULL all'inizio, poi i dati vecchi resteranno orfani — come da scelta utente "multi-utente completo"). Non li migro automaticamente: dopo il primo login l'utente potrà eventualmente farsi assegnare manualmente i dati storici via SQL, oppure ripartire pulito con hard reset.
→ pratica: aggiungo le colonne **NULLABLE**, poi aggiungo un secondo passaggio nello stesso file che (i) DELETE-a le righe orfane esistenti (è una single-user demo) e (ii) le imposta NOT NULL.

**b) Sostituisce le policy `open_all` con policy per utente**
Per ogni tabella: 4 policy (SELECT/INSERT/UPDATE/DELETE) che controllano `user_id = auth.uid()`.

**c) Restringe le policy storage del bucket `referti`**
Lo `storage_path` continua a essere `referti/{ts}_{name}` ma le policy filtrano sulla colonna `owner` (popolata automaticamente da Supabase con `auth.uid()` quando si carica con un client autenticato). Le 4 policy diventano `bucket_id='referti' AND owner = auth.uid()`.

**d) Trigger di auto-creazione profilo al signup**
Function `public.handle_new_user()` SECURITY DEFINER + trigger su `auth.users` AFTER INSERT che inserisce una riga in `public.profile` con `user_id = NEW.id` ed `email = NEW.email`. Così appena un utente fa il primo login Google, ha già il suo profilo vuoto.

**e) Rimozione della riga profilo iniziale "Matteo Bernardini"** — verrà sostituita dal profilo reale post-login.

Nota: `auth.users` resta intoccata, modifico solo trigger (consentito).

## 2. Configurazione auth (configure_auth tool)

- Email signups disabilitati (solo Google).
- `password_hibp_enabled: true` per sicurezza generale.
- Niente auto-confirm: Google è già verificato di default.

(Google OAuth in Lovable Cloud è già pronto out-of-the-box, nessuna configurazione manuale richiesta.)

## 3. Schermata di login dedicata

Nuovo file `src/routes/login.tsx`:
- pulsante grande "Accedi con Google" (usa `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`)
- riconosce `?redirect=/...` per tornare sulla pagina richiesta dopo il login
- se l'utente è già loggato, redirect immediato alla home

Per usare `lovable.auth.signInWithOAuth` devo prima chiamare il tool **Configure Social Login** per Google (che genera `src/integrations/lovable/`). Questo passaggio è automatico.

## 4. Guard di autenticazione

Nuovo file `src/routes/_authenticated.tsx` (pathless layout):
- in `beforeLoad` controlla la sessione Supabase; se assente, `redirect({ to: "/login", search: { redirect: location.href } })`
- altrimenti renderizza `<Outlet />`

Sposto `src/routes/index.tsx` in `src/routes/_authenticated/index.tsx` così la dashboard finisce automaticamente sotto il guard. Stesso trattamento per qualsiasi futura route protetta.

## 5. Hook auth + AuthProvider

Nuovo `src/hooks/use-auth.tsx`:
- inizializza con `supabase.auth.getSession()`
- ascolta `supabase.auth.onAuthStateChange` (listener montato PRIMA di getSession come da knowledge)
- espone `{ user, session, loading, signInWithGoogle, signOut }`
- `useAuth()` per i componenti

Wrap del provider nel `RootComponent` in `__root.tsx` così è disponibile ovunque (incluso il guard via context router).

Aggiungo anche `auth: { user, isAuthenticated }` nel router context (`createRootRouteWithContext`) e lo passo dal `RootComponent` con un piccolo wrapper, così il `beforeLoad` del guard può leggerlo senza chiamate async ridondanti.

## 6. Server functions: scope per utente

Refactor di `src/lib/dashboard.functions.ts`. Tutte le 8 server functions oggi usano `supabaseAdmin` (bypassa RLS). Le converto a usare il middleware `requireSupabaseAuth` + `context.supabase` (client autenticato che rispetta RLS) e `context.userId` per popolare `user_id` su INSERT.

Modifiche puntuali:
- `uploadDocument`: aggiunge `user_id: userId` all'insert su `documents`. Il file in storage viene caricato con il client autenticato (così `owner` viene popolato e le policy storage funzionano).
- `processExtraction`: usa `context.supabase` (l'utente vede solo i suoi documenti — quindi l'idempotenza/ricerca documento è automaticamente scoped).
- `getExtractionStatus`: idem.
- `saveConfirmedData`: aggiunge `user_id: userId` su tutte le insert (visits, circumferences, body_composition, dexa_segments, blood_tests).
- `getDashboardData`: rimuove il "limit(1)" sul profilo perché ora c'è un profilo per utente; le altre query sono già auto-filtrate da RLS.
- `updateTargetWeight`, `deleteVisit`, `getDocumentUrl`: scoped via RLS.
- `hardResetAllData`: cancella SOLO le righe dell'utente loggato (non più tutto il DB). Il bucket storage viene listato e filtrato per file dell'utente (uso `owner = userId` via query SQL su `storage.objects`).

`supabaseAdmin` resta importato solo dove serve per operazioni che richiedono service role (al momento, nessuna).

## 7. Frontend: chiamate alle server function

Le server function di TanStack Start chiamate dal client passano automaticamente i cookie ma il middleware `requireSupabaseAuth` controlla l'header `Authorization: Bearer <token>`. Quindi creo un piccolo wrapper `callServerFn` che prima di ogni chiamata legge `supabase.auth.getSession()` e aggiunge l'header. In alternativa, più semplice: aggiungo nel `QueryClient` un `defaultOptions.queries.meta` o uso direttamente `fetch` con header custom.

Approccio scelto: piccolo helper `withAuth(fn)` che wrappa la chiamata e usa `getSession()` per iniettare l'header. Aggiorno `dashboard.tsx` e `upload-dialog.tsx` per usare il wrapper.

## 8. UI: pulsante logout + stato utente

In `dashboard.tsx` (header in alto) aggiungo:
- avatar/iniziale + email dell'utente
- menu dropdown con "Esci" che chiama `signOut()` e fa redirect a `/login`

## 9. Pulizia / coerenza

- Rimuovo l'INSERT iniziale del profilo "Matteo Bernardini" (è nella migrazione vecchia, ma il trigger nuovo se ne occuperà).
- Aggiorno il titolo della pagina login con `head()` proprio.
- Le route esistenti (solo `/`) restano funzionanti dopo il move sotto `_authenticated/`.

---

## File toccati

| File | Tipo |
|---|---|
| `supabase/migrations/<new>.sql` | nuovo |
| `src/integrations/lovable/*` | generato dal tool Configure Social Login |
| `src/routes/login.tsx` | nuovo |
| `src/routes/_authenticated.tsx` | nuovo |
| `src/routes/_authenticated/index.tsx` | spostato da `src/routes/index.tsx` |
| `src/routes/index.tsx` | eliminato |
| `src/routes/__root.tsx` | aggiunge AuthProvider + router context auth |
| `src/router.tsx` | tipizza `auth` nel context |
| `src/hooks/use-auth.tsx` | nuovo |
| `src/lib/dashboard.functions.ts` | refactor: middleware + user_id |
| `src/lib/server-call.ts` | nuovo helper `withAuth` |
| `src/components/dashboard.tsx` | header con utente+logout, callServerFn wrapper |
| `src/components/upload-dialog.tsx` | callServerFn wrapper |

## File NON toccati
- `extraction.server.ts` (Lovable AI invariato)
- `insights.ts`, `types.ts`, schema KPI
- `client.ts`, `client.server.ts`, `auth-middleware.ts`, `types.ts` (auto-generati)

## Risultato atteso
- Ad ogni avvio dell'app, se non sei loggato vedi `/login` con il pulsante Google.
- Dopo il login Google torni esattamente sulla pagina dove stavi.
- Vedi solo i tuoi dati; un altro utente che fa login con un altro account Google parte da zero con un profilo vuoto auto-creato.
- L'estrazione referti continua a funzionare via Lovable AI Gateway senza modifiche.
- "Hard reset" pulisce solo i tuoi dati, non quelli degli altri.
