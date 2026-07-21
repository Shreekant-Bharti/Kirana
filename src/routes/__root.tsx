import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { initTheme } from "../lib/theme";
import { getSession } from "../lib/googleAuth";
import { AuthProvider, useAuth } from "../lib/authContext";
import { InstallPrompt } from "../components/InstallPrompt";
import { UpdatePrompt } from "../components/UpdatePrompt";

// ── Service worker registration ───────────────────────────────────────────────

function registerSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW not critical — fail silently
    });
  });
}

// ── 404 / Error components ────────────────────────────────────────────────────

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
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try refreshing or go back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
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

// ── Route definition ──────────────────────────────────────────────────────────

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { name: "theme-color", content: "#007aff" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Bharti Udhari" },
      { title: "Bharti Udhari — Offline Credit Ledger" },
      { name: "description", content: "Simple offline udhari (credit) ledger for local shops. Track customers, transactions and pending balances." },
      { property: "og:title", content: "Bharti Udhari — Offline Credit Ledger" },
      { property: "og:description", content: "Simple offline udhari (credit) ledger for local shops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Google Identity Services — async so it never blocks rendering */}
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// ── Auth guard ────────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const [ready, setReady] = useState(false);

  const isLoginPage = location.pathname === "/login";

  useEffect(() => {
    // Run only on client — localStorage is not available on server
    setReady(true);
    const s = getSession();
    if (!s && !isLoginPage) {
      navigate({ to: "/login", replace: true });
    } else if (s && isLoginPage) {
      navigate({ to: "/", replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also react to runtime session changes (login/logout without page reload)
  useEffect(() => {
    if (!ready) return;
    if (!session && !isLoginPage) {
      navigate({ to: "/login", replace: true });
    } else if (session && isLoginPage) {
      navigate({ to: "/", replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isLoginPage, ready]);

  // During SSR / before hydration: render children to avoid mismatch
  if (!ready) return <>{children}</>;

  // Client: if unauthenticated and not already on login, show nothing (redirect pending)
  if (!session && !isLoginPage) return null;

  return <>{children}</>;
}

// ── Root component ────────────────────────────────────────────────────────────

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    initTheme();
    registerSW();
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <Outlet />
        </AuthGuard>
        <InstallPrompt />
        <UpdatePrompt />
      </QueryClientProvider>
    </AuthProvider>
  );
}
