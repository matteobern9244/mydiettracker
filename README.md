# Il mio percorso dietologico

Dashboard personale per il monitoraggio del proprio percorso dietologico: peso, composizione corporea, circonferenze, esami del sangue e referti DEXA. Gli utenti caricano i referti del proprio dietologo (PDF, .docx, .doc, .txt) e l'AI estrae automaticamente i dati strutturati che vengono poi mostrati in grafici, insight e storico.

App disponibile in produzione su <https://mydiettracker.lovable.app>.

---

## Indice

- [Funzionalità](#funzionalità)
- [Stack tecnologico](#stack-tecnologico)
- [Architettura](#architettura)
- [Modello dati](#modello-dati)
- [Flusso utente](#flusso-utente)
- [Sicurezza e privacy](#sicurezza-e-privacy)
- [Sviluppo locale](#sviluppo-locale)
- [Struttura del progetto](#struttura-del-progetto)
- [Documentazione aggiuntiva](#documentazione-aggiuntiva)

---

## Funzionalità

### Autenticazione
- Login con Google (OAuth) gestito da Lovable Cloud.
- Sessione persistente con auto-refresh del token.
- Logout sicuro con pulizia della cache locale.
- Le route della dashboard sono protette: gli utenti non autenticati vengono reindirizzati a `/login` preservando la destinazione originale.

### Upload referti con AI
- Drag & drop o selezione manuale di file `.pdf`, `.docx`, `.doc`, `.txt` (max 10 MB).
- **Rilevamento duplicati**: prima di processare, l'app calcola l'hash SHA-256 del file e segnala se l'utente ha già caricato lo stesso contenuto. L'utente può scegliere se mantenere il vecchio o sostituirlo (con eliminazione completa di visita, dati e file precedenti).
- Estrazione AI tramite **Lovable AI Gateway** (modello `google/gemini-2.5-flash-lite`):
  - `.docx` → testo via `mammoth`, poi prompt strutturato.
  - `.doc` legacy → estrazione "best-effort" da CFB; in fallback invio binario all'AI.
  - `.pdf` → invio diretto del binario all'AI.
- Il job di estrazione è asincrono: la UI mostra lo stato live (`pending` → `processing` → `extracted` / `failed`).
- Schermata di **revisione e conferma** dei dati estratti, navigabile per più visite contenute nello stesso documento.

### Dashboard
- **Peso**: grafico storico, distanza dall'obiettivo, variazioni recenti.
- **Composizione corporea**: massa grassa %, massa magra kg, grasso viscerale, età metabolica, idratazione, BMI con classificazione WHO.
- **Circonferenze**: braccio, vita, addome, coscia, fianchi, torace, collo, avambraccio, polso. Include valutazione del rapporto vita/altezza (WHtR).
- **Esami del sangue**: emoglobina, glicemia, gamma GT, ALT, AST, colesterolo totale/HDL/LDL, trigliceridi. Ogni marker è valutato secondo i range di riferimento.
- **Storico**: lista completa delle visite con possibilità di scaricare il file originale o eliminare la visita.
- **DEXA segmentale**: dati per arto e tronco quando disponibili.
- **Insight automatici**: messaggi in linguaggio naturale generati da regole locali (zero AI), per ogni sezione.
- **Filtri per sezione**: preset (3m, 6m, 1y, all) o range custom, persistiti negli URL search params.

### Sezione Dieta
- **Piano attivo unico**: un solo piano dietetico attivo per utente alla volta (vincolo applicato a livello DB con indice unico parziale).
- **Upload del piano** in `.docx`, `.pdf` o `.txt` (max 10 MB) con rilevamento duplicati via SHA-256, identico al flusso referti.
- **Estrazione AI** dedicata (`google/gemini-2.5-flash`) che struttura indicazioni generali, opzioni di pasto (alternative equivalenti) e schema settimanale (7 giorni × 5 slot: colazione, spuntino mattina, pranzo, spuntino pomeriggio, cena).
- **Revisione manuale** dei dati estratti prima del salvataggio: l'utente può correggere obiettivo, kcal, indicazioni e pasti.
- **Vista calendario duale**:
  - **Settimana**: griglia 7×5 giorni × pasti (ottimale su desktop).
  - **Giorno**: card a tutta larghezza con switch giorno (ottimale su mobile).
  - Toggle persistente tra le due viste.
- **Diario di aderenza**: check per ogni pasto consumato; calcolo percentuale di aderenza giornaliera/settimanale tramite `diet_meal_logs`.
- **Lista della spesa generata** dal piano attivo: aggregazione automatica degli ingredienti dallo schema settimanale, raggruppati per categoria, con possibilità di spuntare gli articoli e aggiungere voci manuali.
- **Indicazioni generali e opzioni pasto** consultabili in tab dedicate.

### Strumenti utente
- Modifica del peso obiettivo direttamente dalla dashboard.
- Toggle tema chiaro/scuro.
- Hard reset di tutti i dati personali (con conferma).
- PWA installabile su iOS, Android e macOS con icone e manifest dedicati.

---

## Stack tecnologico

| Area | Tecnologia |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) v1 (React 19 + SSR) |
| Build | Vite 7 |
| Routing | TanStack Router (file-based, type-safe) |
| Data fetching | TanStack Query v5 |
| Server functions | TanStack Start `createServerFn` |
| Styling | Tailwind CSS v4 + design tokens in `src/styles.css` |
| UI primitives | shadcn/ui (Radix) |
| Grafici | Recharts |
| Form e validazione | react-hook-form + Zod |
| Backend | Lovable Cloud (PostgreSQL, Storage, Auth, Edge runtime) |
| AI | Lovable AI Gateway (`google/gemini-2.5-flash-lite`) |
| Parser DOCX | mammoth |
| Deploy | Cloudflare Workers (via `@cloudflare/vite-plugin`) |

---

## Architettura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React 19)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Login   │  │Dashboard │  │UploadDialog  │  │ HardResetDlg │ │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  └──────┬───────┘ │
│       │             │               │                  │         │
│       │ useAuth     │ useQuery      │ useServerFn     │          │
└───────┼─────────────┼───────────────┼──────────────────┼─────────┘
        │             │               │                  │
        ▼             ▼               ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              Server Functions (Cloudflare Worker)                │
│  src/lib/dashboard.functions.ts                                  │
│   • getDashboardData     • uploadDocument    • replaceDocument   │
│   • updateTargetWeight   • processExtraction • getExtractionStatus│
│   • saveConfirmedData    • deleteVisit       • hardResetAllData  │
│   • getDocumentUrl                                                │
│                                                                  │
│  src/lib/extraction.server.ts                                    │
│   • extractDocumentInput (docx/pdf/doc/txt)                      │
│   • extractWithAI → Lovable AI Gateway                           │
└────────────────┬───────────────────────┬────────────────────────┘
                 │                       │
                 ▼                       ▼
       ┌──────────────────┐   ┌───────────────────────┐
       │  Lovable Cloud   │   │  Lovable AI Gateway   │
       │  (Postgres + RLS)│   │  Gemini 2.5 flash-lite│
       │  + Storage bucket│   └───────────────────────┘
       │  "referti"       │
       └──────────────────┘
```

### Punti chiave

- **Auth atomica**: nessuna chiamata server parte finché `useAuth` non ha confermato la sessione (`enabled: !loading && isAuthenticated && !!user.id` su tutte le query).
- **Server functions con auth middleware**: ogni call passa per `requireSupabaseAuth`, che propaga il JWT al client Supabase server-side, garantendo che le RLS policy si applichino sempre.
- **Errori sanitizzati**: la helper `safeError` logga il dettaglio internamente e restituisce al client solo un messaggio generico, evitando di esporre nomi tabelle, constraint o path di storage.
- **Validazione con Zod**: tutti i payload (uuid, dati estratti, aggiornamenti profilo) sono validati lato server prima di toccare il database.
- **Bootstrap profilo**: alla creazione di un utente in `auth.users`, un trigger `handle_new_user` crea la riga `profile` corrispondente.

---

## Modello dati

Tutte le tabelle sono **per utente** con FK a `auth.users(id) ON DELETE CASCADE` e **RLS** che limita l'accesso al proprio `auth.uid()`.

| Tabella | Scopo | Note |
|---|---|---|
| `profile` | Anagrafica e impostazioni dell'utente | unique su `user_id` |
| `documents` | File originali caricati | `content_hash` SHA-256, `extraction_status` (`pending`/`processing`/`extracted`/`confirmed`/`failed`) |
| `visits` | Singola visita dietologica | data, peso, note, link al documento |
| `circumferences` | Misure antropometriche per visita | unique per visita |
| `body_composition` | Composizione corporea per visita | BMI, % grasso, massa magra/ossea, viscerale, idratazione, età metabolica |
| `dexa_segments` | DEXA per arto/tronco | unique `(visit_id, segment)` |
| `blood_tests` | Esami ematochimici | indipendenti dalla visita o collegati |
| `diet_plans` | Piano dietetico | indicazioni generali, opzioni pasto, kcal target. Indice unico parziale: un solo piano attivo per utente |
| `diet_weekly_schedule` | Schema settimanale | riga per `(plan_id, day_of_week, meal_slot)` |
| `diet_meal_logs` | Aderenza giornaliera | check pasto consumato per data + slot |
| `diet_shopping_lists` | Liste della spesa | items aggregati dal piano per `week_start` |

**Storage**: bucket privato `referti` con policy che limitano l'accesso ai file dell'utente proprietario. Path generato come `{user_id}/{uuid}.{ext}`.

**Indice unico anti-duplicato**:
```sql
CREATE UNIQUE INDEX documents_user_content_hash_unique
  ON public.documents (user_id, content_hash)
  WHERE content_hash IS NOT NULL;
```

Schema dettagliato: vedi [`docs/database.md`](./docs/database.md).

---

## Flusso utente

1. **Login** — l'utente accede con Google. Se non autenticato e prova ad aprire `/`, viene reindirizzato a `/login?redirect=...`.
2. **Dashboard vuota** — al primo accesso vede il CTA per caricare il primo referto.
3. **Upload** — apre il dialog, seleziona il file:
   - L'app calcola l'hash SHA-256 e verifica i duplicati.
   - Se è un duplicato, l'utente può **mantenere l'esistente** o **sostituire** (eliminazione cascading + nuovo upload).
4. **Estrazione AI** — il job parte in background, la UI fa polling sullo stato.
5. **Revisione** — l'utente verifica e modifica i dati estratti per ogni visita contenuta nel documento, poi conferma.
6. **Visualizzazione** — la dashboard si ricarica con i nuovi dati e calcola gli insight.

Dettagli e diagrammi: [`docs/upload-flow.md`](./docs/upload-flow.md).

---

## Sicurezza e privacy

- **Single tenant per utente**: ogni utente vede solo i propri dati grazie alle RLS policy `auth.uid() = user_id` su ogni tabella e su Storage.
- **Validazione input** con Zod su ogni server function (uuid, range numerici realistici per peso/altezza/marker, lunghezze massime per testo).
- **Errori non leakati**: la helper `safeError` mostra al client solo messaggi generici e logga i dettagli solo lato server.
- **Storage privato**: i file dei referti non sono accessibili pubblicamente; vengono serviti via signed URL temporanei (`getDocumentUrl`).
- **Hard reset**: l'utente può cancellare tutti i propri dati con un'azione esplicita (visite + documenti + file di storage + esami).
- **Token OAuth**: gestiti da Lovable Cloud, mai salvati in localStorage in chiaro dall'app.

Dettagli e checklist: [`docs/security.md`](./docs/security.md).

---

## Sviluppo locale

### Prerequisiti
- Node 20+ o Bun
- Un progetto Lovable Cloud collegato (le variabili `.env` sono auto-popolate)

### Comandi

```bash
bun install        # installa dipendenze
bun run dev        # dev server (Vite)
bun run build      # build produzione (Cloudflare Worker)
bun run preview    # preview build locale
bun run lint       # ESLint
bun run format     # Prettier
```

### Variabili d'ambiente

Il file `.env` è gestito automaticamente da Lovable Cloud. Contiene:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Per il funzionamento dell'AI è richiesto `LOVABLE_API_KEY` come secret server-side (preconfigurato in Lovable Cloud).

---

## Struttura del progetto

```
src/
├── components/
│   ├── dashboard.tsx          # vista principale post-login
│   ├── upload-dialog.tsx      # wizard upload + duplicati + revisione
│   ├── hard-reset-dialog.tsx
│   ├── insight-card.tsx       # card riassuntive in linguaggio naturale
│   ├── section-filter.tsx     # filtro date per sezione
│   ├── status-badge.tsx       # badge stato estrazione
│   ├── theme-toggle.tsx
│   └── ui/                    # shadcn primitives
├── hooks/
│   ├── use-auth.tsx           # AuthProvider + signIn/signOut
│   ├── use-mobile.tsx
│   └── use-theme.ts
├── integrations/
│   ├── lovable/               # wrapper SDK Cloud
│   └── supabase/              # client browser/server + middleware
├── lib/
│   ├── dashboard.functions.ts # tutte le server functions
│   ├── extraction.server.ts   # parser docx/doc/pdf + AI gateway
│   ├── insights.ts            # regole per gli insight
│   ├── server-call.ts         # withAuth wrapper
│   ├── types.ts               # tipi condivisi
│   └── utils.ts
├── routes/
│   ├── __root.tsx             # shell HTML, providers, SEO base
│   ├── login.tsx              # login Google
│   ├── _authenticated.tsx     # guard: redirect → /login se anon
│   └── _authenticated/index.tsx # dashboard con search params Zod
├── router.tsx                 # createRouter + ErrorBoundary chunk-aware
└── styles.css                 # design tokens (oklch) + Tailwind v4
supabase/
└── migrations/                # schema DB versionato
```

---

## Documentazione aggiuntiva

- [`CHANGELOG.md`](./CHANGELOG.md) — storico delle modifiche
- [`docs/architecture.md`](./docs/architecture.md) — dettagli tecnici, decisioni di design
- [`docs/database.md`](./docs/database.md) — schema completo, RLS, indici, migrazioni
- [`docs/upload-flow.md`](./docs/upload-flow.md) — flusso upload + estrazione + duplicati
- [`docs/security.md`](./docs/security.md) — modello sicurezza, privacy, mitigazioni
- [`docs/ai-extraction.md`](./docs/ai-extraction.md) — prompt, modello, fallback
