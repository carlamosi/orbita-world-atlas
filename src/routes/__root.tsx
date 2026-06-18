import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Navbar } from "@/components/layout/Navbar";
import { Starfield } from "@/components/atmosphere/Starfield";
import { Toaster } from "@/components/ui/sonner";
import { authDebug } from "@/lib/auth/debug";
import { ensureUserProfile } from "@/lib/auth/profile";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#050508" },
      { title: "Orbita — Master every corner of the world" },
      {
        name: "description",
        content:
          "Orbita is a cinematic geography mastery platform. 195 countries, every capital, every flag — explored from orbit.",
      },
      { property: "og:title", content: "Orbita — Master every corner of the world" },
      {
        property: "og:description",
        content: "A cinematic, immersive way to learn the world. 195 countries from orbit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Orbita — Master every corner of the world" },
      { name: "description", content: "Orbita is a cinematic geography mastery platform for immersive world learning." },
      { property: "og:description", content: "Orbita is a cinematic geography mastery platform for immersive world learning." },
      { name: "twitter:description", content: "Orbita is a cinematic geography mastery platform for immersive world learning." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fe58fc7b-2ae5-46e1-a1fe-5f3774573e05/id-preview-8574e703--5a8151b1-20df-4a18-b0bf-c85e4802cce9.lovable.app-1781638547317.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fe58fc7b-2ae5-46e1-a1fe-5f3774573e05/id-preview-8574e703--5a8151b1-20df-4a18-b0bf-c85e4802cce9.lovable.app-1781638547317.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.ico" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://flagcdn.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    let mounted = true;
    let unsubscribeAuth: (() => void) | null = null;
    void import("@/lib/sync/workers").then(({ startSyncWorkers }) => {
      if (!mounted) return;
      startSyncWorkers();
    });
    void Promise.all([
      import("@/integrations/supabase/client"),
      import("@/lib/db/dbProvider"),
      import("@/lib/sync/useSyncStore"),
    ]).then(([{ supabase }, { swap }, { useSyncStore }]) => {
      if (!mounted) return;
      supabase.auth.getSession().then(({ data }) => {
        const uid = data.session?.user.id ?? null;
        authDebug("root session restore", { hasSession: !!data.session, userId: uid });
        useSyncStore.getState().setSignedIn(!!uid);
        void swap(uid);
        if (data.session?.user) void ensureUserProfile(data.session.user).catch((error) => authDebug("root profile ensure failed", { error: error instanceof Error ? error.message : String(error) }));
      });
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED")
          return;
        const uid = session?.user.id ?? null;
        authDebug("root auth event", { event, hasSession: !!session, userId: uid });
        useSyncStore.getState().setSignedIn(!!uid);
        void swap(uid);
        if (session?.user) void ensureUserProfile(session.user).catch((error) => authDebug("root profile ensure failed", { error: error instanceof Error ? error.message : String(error) }));
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      unsubscribeAuth = () => sub.subscription.unsubscribe();
    });
    return () => {
      mounted = false;
      unsubscribeAuth?.();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      {/* Atmosphere layers (fixed, behind content) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <Starfield density={140} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(108,99,255,0.18), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 100%, rgba(0,212,255,0.12), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)",
          }}
        />
      </div>
      <Navbar />
      {children}
    </div>
  );
}
