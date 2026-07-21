/**
 * Google Identity Services (GIS) — OAuth 2.0 Token flow.
 * No backend required. All auth happens client-side.
 * Loaded via script: https://accounts.google.com/gsi/client
 */

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

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
  return new Promise((resolve, reject) => {
    if (!hasGoogleClientId()) {
      reject(
        new Error(
          "Google sign-in is not configured for this build. Set VITE_GOOGLE_CLIENT_ID and rebuild the app.",
        ),
      );
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google Identity Services not loaded yet. Please wait and try again."));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description ?? resp.error ?? "Sign-in cancelled"));
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
          reject(err);
        }
      },
      error_callback: (err) => {
        reject(new Error(`Google sign-in error: ${err.type}`));
      },
    });
    // empty prompt = silent if session active, otherwise shows picker
    client.requestAccessToken({ prompt: "" });
  });
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
  return typeof window !== "undefined" && !!window.google?.accounts?.oauth2;
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
