import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Il mio percorso dietologico" },
      { name: "description", content: "Dashboard personale per il monitoraggio dei progressi dietologici: peso, composizione corporea, esami." },
      { property: "og:title", content: "Il mio percorso dietologico" },
      { name: "twitter:title", content: "Il mio percorso dietologico" },
      { property: "og:description", content: "Dashboard personale per il monitoraggio dei progressi dietologici: peso, composizione corporea, esami." },
      { name: "twitter:description", content: "Dashboard personale per il monitoraggio dei progressi dietologici: peso, composizione corporea, esami." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9b05bcbb-744d-4f3f-bcbc-8c4943855e20/id-preview-fc34bc35--3bde3398-9e8f-4fc5-8664-63aefc1058e1.lovable.app-1777233500573.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9b05bcbb-744d-4f3f-bcbc-8c4943855e20/id-preview-fc34bc35--3bde3398-9e8f-4fc5-8664-63aefc1058e1.lovable.app-1777233500573.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
