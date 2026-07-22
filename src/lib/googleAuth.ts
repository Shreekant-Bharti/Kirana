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

const BASIC_SCOPES = ["openid", "email", "profile"];
export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

export interface GoogleSession {
  userId: string;
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  expiresAt: number; // Unix ms
  grantedScopes?: string[];
}

const SESSION_KEY = "bharti-google-session";

export function hasGoogleClientId(): boolean {
  return CLIENT_ID.length > 0;
}

function normalizeScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)));
}

function scopeString(scopes: string[]): string {
  return normalizeScopes(scopes).join(" ");
}

function scopesFromResponse(scope: string | undefined, fallback: string[]): string[] {
  const parsed = normalizeScopes((scope ?? "").split(/\s+/).filter(Boolean));
  return parsed.length > 0 ? parsed : normalizeScopes(fallback);
}

function sessionScopes(session: GoogleSession | null): string[] {
  return normalizeScopes(session?.grantedScopes ?? BASIC_SCOPES);
}

function hasScope(session: GoogleSession | null, scope: string): boolean {
  return sessionScopes(session).includes(scope);
}

export function hasDrivePermission(session: GoogleSession | null = getSession()): boolean {
  return hasScope(session, DRIVE_APPDATA_SCOPE);
}

function requestToken(
  scopes: string[],
  prompt: "" | "consent" = "",
): Promise<{ access_token?: string; scope?: string; error?: string; error_description?: string }> {
  return ensureGoogleIdentityReady().then(
    () =>
      new Promise((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: scopeString(scopes),
          callback: (resp) => resolve(resp),
          error_callback: (err) => reject(new Error(err.type)),
        });
        client.requestAccessToken({ prompt });
      }),
  );
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

  gisInitPromise = new Promise<void>((resolve, reject) => {
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
  }).catch((error: unknown) => {
    gisInitPromise = null;
    throw error;
  }) as Promise<void>;

  return gisInitPromise;
}

// ── Session persistence ───────────────────────────────────────────────────────
// Session NEVER expires on its own — only explicit signOut() clears it.
// The access token may expire, but the user identity persists.

export function getSession(): GoogleSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleSession;
  } catch {
    return null;
  }
}

/** Returns true when the access token is still valid (>5 min remaining). */
export function isTokenFresh(session?: GoogleSession | null): boolean {
  const s = session ?? getSession();
  if (!s) return false;
  return s.expiresAt - Date.now() > 5 * 60_000;
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
  return requestToken(BASIC_SCOPES).then(async (resp) => {
    if (resp.error || !resp.access_token) {
      throw mapGoogleAuthError(resp.error_description ?? resp.error ?? "Google sign-in failed.");
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
        grantedScopes: scopesFromResponse(resp.scope, BASIC_SCOPES),
      };
      saveSession(session);
      return session;
    } catch (err) {
      throw mapGoogleAuthError(err);
    }
  });
}

export async function requestDrivePermission(actionMessage: string): Promise<GoogleSession> {
  const session = getSession();
  if (!session) {
    throw new Error("Sign in with Google first.");
  }

  if (hasDrivePermission(session)) {
    return session;
  }

  try {
    const requestedScopes = [...sessionScopes(session), DRIVE_APPDATA_SCOPE];
    const resp = await requestToken(requestedScopes, "consent");
    if (resp.error || !resp.access_token) {
      throw new Error(resp.error_description ?? resp.error ?? "Google Drive permission request failed.");
    }
    const updated: GoogleSession = {
      ...session,
      accessToken: resp.access_token,
      expiresAt: Date.now() + 3500_000,
      grantedScopes: scopesFromResponse(resp.scope, requestedScopes),
    };
    saveSession(updated);
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (
      message.includes("access_denied") ||
      message.includes("403") ||
      message.includes("not authorized") ||
      message.includes("not currently authorized")
    ) {
      throw new Error(actionMessage);
    }
    if (message.includes("popup_closed") || message.includes("popup closed") || message.includes("cancel")) {
      throw new Error("Google Drive permission request was cancelled.");
    }
    if (message.includes("popup_failed") || message.includes("popup failed")) {
      throw new Error("Google Drive permission popup failed to open. Allow popups and try again.");
    }
    if (message.includes("network")) {
      throw new Error("Network error while contacting Google. Check your connection and try again.");
    }
    throw mapGoogleAuthError(err);
  }
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
    if (isTokenFresh(s)) {
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

    const scopes = sessionScopes(s);
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: scopeString(scopes),
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          resolve(s);
          return;
        }
        const updated: GoogleSession = {
          ...s,
          accessToken: resp.access_token,
          expiresAt: Date.now() + 3500_000,
          grantedScopes: scopesFromResponse(resp.scope, scopes),
        };
        saveSession(updated);
        resolve(updated);
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/**
 * Ensures a fresh access token is available before any API call.
 * If the token is stale, silently refreshes it.
 * Throws if the user is not signed in.
 * Returns the valid session with a fresh token.
 */
export async function ensureFreshToken(): Promise<GoogleSession> {
  const s = getSession();
  if (!s) throw new Error("Not signed in to Google");
  if (isTokenFresh(s)) return s;

  // Attempt silent refresh
  const refreshed = await silentRefresh();
  if (refreshed && isTokenFresh(refreshed)) return refreshed;

  // Token is stale and refresh failed (likely offline) — return stale session
  // Caller will get a 401 from the API and handle it
  if (refreshed) return refreshed;
  return s;
}
