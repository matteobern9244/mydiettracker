// Helper per chiamare le server function autenticate iniettando il Bearer token.
// Le server function di TanStack Start non passano automaticamente la sessione
// Supabase: il middleware `requireSupabaseAuth` legge l'header Authorization,
// quindi dobbiamo aggiungerlo esplicitamente prima di ogni chiamata.
import { supabase } from "@/integrations/supabase/client";

/**
 * Wrappa una server function aggiungendo automaticamente l'header
 * `Authorization: Bearer <access_token>` letto dalla sessione Supabase corrente.
 *
 * Tipizzato in modo permissivo: il client server-fn di TanStack ha una firma
 * complessa con generics di middleware, ma a runtime accetta `{ data, headers }`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAuth<TFn extends (opts: any) => any>(fn: TFn) {
  return async (opts?: Parameters<TFn>[0]): Promise<Awaited<ReturnType<TFn>>> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error("Sessione scaduta. Effettua di nuovo il login.");
    }
    const merged = {
      ...(opts ?? {}),
      headers: {
        ...((opts as { headers?: Record<string, string> } | undefined)?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    };
    return fn(merged);
  };
}
