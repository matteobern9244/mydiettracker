import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: (redirectUri?: string) => Promise<{ error?: Error; redirected?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // CRITICAL: register the listener BEFORE getSession (per knowledge guide)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (redirectUri?: string) => {
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUri ?? (typeof window !== "undefined" ? window.location.origin : undefined),
      });
      if (result.error) {
        return { error: result.error instanceof Error ? result.error : new Error(String(result.error)) };
      }
      return { redirected: result.redirected };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, []);

  const signOut = useCallback(async () => {
    // Aggiorna subito lo stato locale così la UI reagisce anche se la chiamata
    // remota è lenta o fallisce per problemi di rete temporanei.
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Best-effort: la sessione locale è già stata azzerata.
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isAuthenticated: !!session?.user,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}
