# Sicurezza e privacy

## Modello multi-tenant

Ogni utente vede esclusivamente i propri dati. Questa garanzia è applicata su **tre livelli**:

1. **Database (RLS)**: ogni tabella ha policy `auth.uid() = user_id` su SELECT/INSERT/UPDATE/DELETE. Le policy sono limitate al ruolo `authenticated`.
2. **Storage**: il bucket `referti` è privato. I file sono organizzati per `user_id` e accessibili solo via signed URL temporanee generate dal server.
3. **Server functions**: ogni call passa per `requireSupabaseAuth`, che valida il JWT e crea un client Supabase autenticato. Senza JWT valido la call fallisce prima di toccare il database.

Anche se un attaccante manipolasse direttamente le query lato client, le policy RLS impedirebbero qualsiasi accesso cross-utente.

## Validazione input

Tutte le server functions usano **schemi Zod** per validare il payload. Esempi:

```ts
const uuidSchema = z.string().uuid();

const bodyCompositionSchema = z.object({
  fat_mass_pct: z.number().min(0).max(100).nullable(),
  lean_mass_kg: z.number().min(0).max(500).nullable(),
  bmi: z.number().min(0).max(150).nullable(),
  // ...
});

const extractedVisitSchema = z.object({
  visit_date: z.string().max(20).nullable(),
  weight_kg: z.number().min(0).max(500).nullable(),
  notes: z.string().max(5000).nullable(),
  // ...
});
```

Range numerici realistici (peso 0–500 kg, percentuali 0–100, BMI 0–150) bloccano sia valori malformati sia tentativi di overflow / iniezione di dati assurdi. I campi testo hanno lunghezze massime per limitare payload abnormi.

## Errori sanitizzati

```ts
function safeError(userMessage: string, internal?: unknown): Error {
  if (internal !== undefined) console.error(`[dashboard] ${userMessage}`, internal);
  return new Error(userMessage);
}
```

Il client riceve sempre un messaggio user-friendly (es. "Impossibile caricare il documento"). Dettagli interni — nomi tabelle, vincoli di constraint, path di storage, stack trace — restano solo nei log del Worker.

## Autenticazione

- **Provider**: Google OAuth via Lovable Cloud.
- **Sessione**: token JWT gestiti dall'SDK Cloud (`@lovable.dev/cloud-auth-js`), refresh automatico.
- **Logout**: `signOut` azzera lo stato locale immediatamente e invalida la sessione lato server (best-effort).
- **Route protette**: `_authenticated.tsx` reindirizza a `/login` con `replace: true` quando non c'è sessione, preservando la destinazione originale.

## Anti-duplicato

Hash SHA-256 calcolato con Web Crypto su tutto il contenuto del file. L'unique index `(user_id, content_hash)` garantisce a livello DB che lo stesso file non possa essere duplicato per lo stesso utente. Lo scope è **per utente** (privacy-friendly): due utenti diversi possono avere file identici senza interferenze.

## Hard reset

L'utente può eliminare tutti i propri dati con `hardResetAllData`:
- Cancella tutte le `visits` (cascading su circonferenze, body composition, DEXA).
- Cancella tutti i `blood_tests`.
- Cancella tutti i `documents`.
- Rimuove tutti i file da Storage.
- Resetta i campi del profilo personale.

L'azione richiede una conferma esplicita nel `HardResetDialog`.

## Cosa NON facciamo

- **Niente API keys lato client**: l'AI Gateway è chiamato solo dal Worker server-side.
- **Niente service role key in browser**: il client browser usa solo l'anon key + JWT utente.
- **Niente ruoli sul `profile`**: se in futuro servissero ruoli admin, andranno in una tabella `user_roles` separata con funzione `has_role` `SECURITY DEFINER`, mai sul profilo (per evitare privilege escalation).

## Checklist di review periodica

- [ ] Tutte le tabelle hanno RLS attiva e policy per-utente?
- [ ] Tutte le server functions chiamano `requireSupabaseAuth`?
- [ ] Tutti i payload sono validati con Zod?
- [ ] Gli errori passano da `safeError` prima di tornare al client?
- [ ] Nessun dato sensibile è loggato in chiaro?
- [ ] Le signed URL hanno una scadenza ragionevole?
