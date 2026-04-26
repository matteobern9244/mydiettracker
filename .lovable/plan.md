Correggerò il flusso login/logout rendendo l’autenticazione “atomica”: niente chiamate alla dashboard finché la sessione non è pronta, cache dati pulita al logout, e redirect sicuri.

Piano di intervento:

1. Rendere il guard più robusto
- Aggiornare il layout protetto (`/_authenticated`) per reindirizzare a `/login` con `replace: true` quando l’utente non è autenticato.
- Evitare che la dashboard venga montata o faccia richieste mentre lo stato auth è ancora in caricamento o appena invalidato.

2. Bloccare le chiamate dati senza sessione valida
- In `Dashboard`, usare anche `loading` e `isAuthenticated` da `useAuth()`.
- Impostare la query della dashboard con:
  - `enabled: !loading && isAuthenticated && !!user`
  - `queryKey` legata all’utente, ad esempio `['dashboard', user.id]`
- Così `getDashboardData` non parte durante login/logout o mentre il token non è ancora disponibile.

3. Sistemare il logout
- Nel click su “Esci”:
  - cancellare/interrompere le query della dashboard
  - eseguire `signOut()`
  - rimuovere la cache utente dalla dashboard
  - navigare a `/login` con `replace: true`
- In `use-auth`, rendere `signOut` più sicuro con aggiornamento locale dello stato anche se la chiamata di logout incontra un problema temporaneo.

4. Migliorare il login Google
- Dopo il ritorno da Google, usare `replace: true` nel redirect verso la destinazione richiesta per evitare stati di navigazione sporchi.
- Mantenere l’integrazione Google gestita già presente, senza cambiare provider o configurazione OAuth.

5. Gestire meglio l’errore “Importing a module script failed”
- Migliorare il componente di errore globale per distinguere gli errori di caricamento modulo/chunk dagli errori applicativi.
- Per questo caso mostrare un messaggio più chiaro e un pulsante che forza un refresh completo della pagina, utile quando il browser ha un vecchio chunk in cache dopo aggiornamenti.

6. Verifica finale
- Controllare che:
  - accesso non autenticato a `/` porti a `/login`
  - login Google ritorni alla dashboard
  - logout porti a `/login` senza error boundary
  - nessuna server function della dashboard venga chiamata senza utente loggato
- Eseguire build/typecheck per confermare che non ci siano import o route rotte.

Dettagli tecnici:
- Non modificherò `src/routeTree.gen.ts`, perché è generato automaticamente.
- Non modificherò i file autogenerati di integrazione backend/client.
- La correzione sarà concentrata su:
  - `src/hooks/use-auth.tsx`
  - `src/routes/_authenticated.tsx`
  - `src/routes/login.tsx`
  - `src/components/dashboard.tsx`
  - `src/router.tsx`, solo per rendere più chiaro e recuperabile l’errore di caricamento modulo.