import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { signIn } from "../lib/googleAuth";
import { hasGoogleClientId } from "../lib/googleAuth";
import { driveBackupExists, restoreFromDrive, clearDriveMeta } from "../lib/driveBackup";
import { useAuth } from "../lib/authContext";
import { db } from "../lib/db";
import { Sheet } from "../components/Sheet";
import type { GoogleSession } from "../lib/googleAuth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gisReady, setGisReady] = useState(false);

  // Conflict resolution
  const [showConflict, setShowConflict] = useState(false);
  const [pendingSession, setPendingSession] = useState<GoogleSession | null>(null);
  const [conflictMsg, setConflictMsg] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  // Poll until GIS CDN script is ready
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    function check() {
      if (window.google?.accounts?.oauth2) {
        setGisReady(true);
        clearInterval(timer);
      }
    }
    check();
    timer = setInterval(check, 200);
    return () => clearInterval(timer);
  }, []);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const session = await signIn();

      const localCount = await db.customers.count();
      let hasDrive = false;
      try {
        hasDrive = await driveBackupExists();
      } catch {
        /* offline */
      }

      if (localCount > 0 && hasDrive) {
        setPendingSession(session);
        setConflictMsg(
          `You have ${localCount} local customer${localCount !== 1 ? "s" : ""} and a Google Drive backup.`,
        );
        setShowConflict(true);
        return;
      }
      if (localCount === 0 && hasDrive) {
        await doRestore(session);
        return;
      }
      finishLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function doRestore(session: GoogleSession) {
    setRestoring(true);
    try {
      const r = await restoreFromDrive();
      setRestoreMsg(`✓ Restored ${r.customers} customers, ${r.transactions} transactions`);
      setTimeout(() => finishLogin(session), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
      setRestoring(false);
    }
  }

  async function handleConflict(choice: "restore" | "keep") {
    setShowConflict(false);
    if (!pendingSession) return;
    if (choice === "restore") {
      await doRestore(pendingSession);
    } else {
      clearDriveMeta();
      finishLogin(pendingSession);
    }
  }

  function finishLogin(session: GoogleSession) {
    setSession(session);
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="app-frame flex flex-col items-center justify-center min-h-dvh bg-[color:var(--background)] px-6">
      {/* Logo card */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <div
          className="grid h-24 w-24 place-items-center rounded-[28px] shadow-[0_8px_32px_rgba(0,122,255,0.35)]"
          style={{ background: "linear-gradient(145deg,#007aff,#0051d5)" }}
        >
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <rect x="8" y="6" width="28" height="36" rx="4" fill="white" fillOpacity="0.9" />
            <rect x="36" y="8" width="4" height="32" rx="2" fill="white" fillOpacity="0.5" />
            <rect x="13" y="14" width="18" height="2.5" rx="1.25" fill="#007aff" />
            <rect x="13" y="20" width="14" height="2.5" rx="1.25" fill="#007aff" />
            <rect x="13" y="26" width="18" height="2.5" rx="1.25" fill="#007aff" />
            <rect x="13" y="32" width="10" height="2.5" rx="1.25" fill="#007aff" />
          </svg>
        </div>
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight text-[color:var(--foreground)]">
            Bharti Udhari
          </h1>
          <p className="mt-1 text-[15px] text-[color:var(--muted-foreground)]">
            Offline First Digital Udhari Register
          </p>
        </div>
      </div>

      {/* Status */}
      {restoring && (
        <p className="mb-6 text-[14px] text-[color:var(--accent)] font-medium animate-pulse text-center">
          {restoreMsg ?? "Restoring your data from Google Drive…"}
        </p>
      )}
      {restoreMsg && !restoring && (
        <p className="mb-6 text-[14px] text-[color:var(--success)] font-medium text-center">
          {restoreMsg}
        </p>
      )}

      {/* Google Sign-In button */}
      <button
        id="google-signin-btn"
        onClick={handleSignIn}
        disabled={loading || !gisReady || restoring || !hasGoogleClientId()}
        className="flex w-full max-w-xs items-center justify-center gap-3 h-14 rounded-[14px] bg-white border border-gray-200 text-[15px] font-semibold text-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="3" />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="#007aff"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        {loading
          ? "Signing in…"
          : !gisReady
            ? "Loading…"
            : !hasGoogleClientId()
              ? "Google sign-in not configured"
              : "Continue with Google"}
      </button>

      {error && (
        <p className="mt-4 text-center text-[13px] text-[color:var(--danger)] max-w-xs">{error}</p>
      )}

      {!hasGoogleClientId() && !error && (
        <p className="mt-4 text-center text-[13px] text-[color:var(--danger)] max-w-xs">
          Google sign-in is not configured for this build. Add VITE_GOOGLE_CLIENT_ID and rebuild the
          app.
        </p>
      )}

      <p className="mt-6 text-center text-[12px] text-[color:var(--muted-foreground)] max-w-[280px] leading-relaxed">
        Your data stays private and belongs only to your Google account.
      </p>

      {/* Data conflict sheet */}
      {showConflict && (
        <Sheet open title="Existing Data Found" onClose={() => setShowConflict(false)}>
          <p className="text-[14px] text-[color:var(--muted-foreground)] text-center leading-relaxed">
            {conflictMsg}
            <br />
            <br />
            What would you like to do?
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => handleConflict("restore")}
              className="w-full h-12 rounded-[12px] bg-[color:var(--accent)] text-white font-semibold text-[15px] tap"
            >
              Restore from Google Drive
            </button>
            <button
              onClick={() => handleConflict("keep")}
              className="w-full h-12 rounded-[12px] bg-[color:var(--surface-2)] border border-[color:var(--border)] text-[color:var(--foreground)] font-semibold text-[15px] tap"
            >
              Keep Local Data
            </button>
            <button
              onClick={() => setShowConflict(false)}
              className="w-full h-10 text-[color:var(--muted-foreground)] text-[14px]"
            >
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
