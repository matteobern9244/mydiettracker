import { createRouter, useRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

function isChunkLoadError(error: Error): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  const name = (error?.name ?? "").toLowerCase();
  return (
    name === "chunkloaderror" ||
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("load failed")
  );
}

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const chunk = isChunkLoadError(error);

  const handleRetry = () => {
    if (chunk && typeof window !== "undefined") {
      // Una nuova versione dell'app è stata pubblicata o il chunk in cache
      // non è più valido: forziamo un refresh completo per ricaricare i moduli.
      window.location.reload();
      return;
    }
    router.invalidate();
    reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {chunk ? "Aggiornamento disponibile" : "Qualcosa è andato storto"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {chunk
            ? "L'app è stata aggiornata o la connessione si è interrotta. Ricarica la pagina per continuare."
            : error.message}
        </p>
        <button
          onClick={handleRetry}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {chunk ? "Ricarica" : "Riprova"}
        </button>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });
};
