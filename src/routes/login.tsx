import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Accedi · Il mio percorso dietologico" },
      { name: "description", content: "Accedi con il tuo account Google per accedere alla tua dashboard personale." },
    ],
  }),
});

function LoginPage() {
  const { isAuthenticated, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [submitting, setSubmitting] = useState(false);

  // Se sei già loggato, redirect immediato
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: search.redirect || "/", replace: true });
    }
  }, [isAuthenticated, loading, navigate, search.redirect]);

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        toast.error(result.error.message);
        setSubmitting(false);
        return;
      }
      // Se è una redirect, il browser sta già andando su Google: niente da fare.
      // Altrimenti i token sono già impostati e il listener farà scattare il redirect.
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[image:var(--gradient-soft)] flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-soft)]">
        <CardContent className="p-8 space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
              <Activity className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Il mio percorso</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Accedi per visualizzare la tua dashboard personale.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full rounded-full"
            onClick={handleGoogle}
            disabled={submitting || loading}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reindirizzamento…
              </>
            ) : (
              <>
                <GoogleIcon className="mr-2 h-4 w-4" />
                Accedi con Google
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            I tuoi dati sono privati e visibili solo a te.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 14-5.3l-6.5-5.3c-1.9 1.3-4.3 2.1-7.5 2.1-5.3 0-9.7-3.3-11.3-7.9l-6.6 5.1C9.6 39 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2.1-2 3.9-3.7 5.2l6.5 5.3C42.4 35 43.5 30 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
