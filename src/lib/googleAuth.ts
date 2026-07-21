/**
 * Google Identity Services (GIS) — OAuth 2.0 Token flow.
 * No backend required. All auth happens client-side.
 * Loaded via script: https://accounts.google.com/gsi/client
 */

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GSI_INIT_TIMEOUT_MS = 10_000;

let gisInitPromise: Promise<void> | null = null;
let gisInitialized = false;
let missingClientIdLogged = false;

const SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export interface GoogleSession {
  userId: string;
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  expiresAt: number; // Unix ms
}

const SESSION_KEY = "bharti-google-session";

export function hasGoogleClientId(): boolean {
  return CLIENT_ID.length > 0;
}

function logMissingClientId(): void {
  if (missingClientIdLogged || typeof window === "undefined") return;
  missingClientIdLogged = true;
  console.error(
    "Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID in the environment and rebuild the app.",
  );
}

function mapGoogleAuthError(error: unknown): Error {
  const raw = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const lowered = raw.toLowerCase();

  if (lowered.includes("popup_closed") || lowered.includes("popup closed") || lowered.includes("cancel")) {
    return new Error("Google sign-in was cancelled.");
  }

  if (lowered.includes("popup_failed") || lowered.includes("popup failed")) {
    return new Error("Google sign-in popup failed to open. Allow popups and try again.");
  }

  if (
    lowered.includes("access_denied") ||
    lowered.includes("403") ||
    lowered.includes("verification") ||
    lowered.includes("not authorized") ||
    lowered.includes("not currently authorized")
  ) {
    return new Error(
      "This Google account is not currently authorized to access this application. Please add this account as a Test User in Google Cloud Console.",
    );
  }

  if (lowered.includes("401") || lowered.includes("unauthorized")) {
    return new Error("Google rejected this sign-in request. Please try again after refreshing the page.");
  }

  if (lowered.includes("network")) {
    return new Error("Network error while contacting Google. Check your connection and try again.");
  }

  return new Error(raw || "Google sign-in failed.");
}

export function ensureGoogleIdentityReady(): Promise<void> {
  if (!hasGoogleClientId()) {
    logMissingClientId();
    return Promise.reject(
      new Error("Google sign-in is not configured for this build. Set VITE_GOOGLE_CLIENT_ID and rebuild the app."),
    );
  }

  if (gisInitialized && window.google?.accounts?.oauth2 && window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (gisInitPromise) {
    return gisInitPromise;
  }

  gisInitPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Google Identity Services can only initialize in the browser."));
      return;
    }

    const startedAt = Date.now();

    function tick() {
      const google = window.google;
      const oauth2 = google?.accounts?.oauth2;
      const id = google?.accounts?.id;

      if (oauth2 && id) {
        if (!gisInitialized) {
          id.initialize({
            client_id: CLIENT_ID,
            callback: () => {},
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          gisInitialized = true;
        }
        resolve();
        return;
      }

      if (Date.now() - startedAt >= GSI_INIT_TIMEOUT_MS) {
        reject(new Error(`Google Identity Services failed to load from ${GSI_SCRIPT_URL}.`));
        return;
      }

      window.setTimeout(tick, 50);
    }

    tick();
  }).catch((error) => {
    gisInitPromise = null;
    throw error;
  });

  return gisInitPromise;
}

// ── Session persistence ───────────────────────────────────────────────────────

export function getSession(): GoogleSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GoogleSession;
    if (Date.now() >= s.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function saveSession(s: GoogleSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function deleteSession(): void {
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
}

// ── User info ─────────────────────────────────────────────────────────────────

async function fetchUserInfo(
  accessToken: string,
): Promise<{ sub: string; email: string; name: string; picture: string }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Google profile");
  return res.json();
}

// ── Sign-in ───────────────────────────────────────────────────────────────────

/** Triggers the Google OAuth picker and returns a resolved session. */
export function signIn(): Promise<GoogleSession> {
  return ensureGoogleIdentityReady().then(
    () =>
      new Promise<GoogleSession>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: async (resp) => {
            if (resp.error || !resp.access_token) {
              reject(mapGoogleAuthError(resp.error_description ?? resp.error ?? "Google sign-in failed."));
              return;
            }
            try {
              const info = await fetchUserInfo(resp.access_token);
              const session: GoogleSession = {
                userId: info.sub,
                email: info.email,
                name: info.name,
                picture: info.picture,
                accessToken: resp.access_token,
                expiresAt: Date.now() + 3500_000, // ~58 min
              };
              saveSession(session);
              resolve(session);
            } catch (err) {
              reject(mapGoogleAuthError(err));
            }
          },
          error_callback: (err) => {
            reject(mapGoogleAuthError(err.type));
          },
        });
        // empty prompt = silent if session active, otherwise shows picker
        client.requestAccessToken({ prompt: "" });
      }),
  );
}

// ── Sign-out ──────────────────────────────────────────────────────────────────

/** Revokes the access token and clears the local session. */
export function signOut(): void {
  const s = getSession();
  if (s?.accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(s.accessToken);
  }
  deleteSession();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/** Returns true when the GIS library script is ready. */
export function isGISReady(): boolean {
  return typeof window !== "undefined" && !!window.google?.accounts?.oauth2 && !!window.google?.accounts?.id;
}

/**
 * Silently refreshes the access token if it expires within the next 5 minutes.
 * Resolves with the (possibly refreshed) session, or null if the user is signed out.
 */
export function silentRefresh(): Promise<GoogleSession | null> {
  return new Promise((resolve) => {
    const s = getSession();
    if (!s) {
      resolve(null);
      return;
    }
    if (s.expiresAt - Date.now() > 5 * 60_000) {
      resolve(s);
      return;
    }
    if (!hasGoogleClientId()) {
      resolve(s);
      return;
    }
    if (!isGISReady()) {
      resolve(s);
      return;
    } // can't refresh, return stale

    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          resolve(s);
          return;
        }
        const updated: GoogleSession = {
          ...s,
          accessToken: resp.access_token,
          expiresAt: Date.now() + 3500_000,
        };
        saveSession(updated);
        resolve(updated);
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}
