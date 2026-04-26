// Helper per chiamare le server function autenticate iniettando il Bearer token.
// Le server function di TanStack Start non passano automaticamente la sessione
// Supabase: il middleware `requireSupabaseAuth` legge l'header Authorization,
// quindi dobbiamo aggiungerlo esplicitamente prima di ogni chiamata.
import { supabase } from "@/integrations/supabase/client";

type ServerFn<TInput, TOutput> = (opts: {
  data?: TInput;
  headers?: Record<string, string>;
}) => Promise<TOutput>;

/**
 * Wrappa una server function aggiungendo automaticamente l'header
 * `Authorization: Bearer <access_token>` letto dalla sessione Supabase corrente.
 */
export function withAuth<TInput, TOutput>(fn: ServerFn<TInput, TOutput>) {
  return async (opts?: { data?: TInput }): Promise<TOutput> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error("Sessione scaduta. Effettua di nuovo il login.");
    }
    return fn({
      data: opts?.data,
      headers: { Authorization: `Bearer ${token}` },
    });
  };
}
