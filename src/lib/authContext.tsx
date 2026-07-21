/**
 * Shared React context for Google auth session.
 * Kept here (not in login.tsx) to avoid circular imports.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { getSession, type GoogleSession } from "./googleAuth";

export interface AuthContextValue {
  session: GoogleSession | null;
  setSession: (s: GoogleSession | null) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  setSession: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/** Wrap the app root with this provider. */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise from localStorage so there's no flash on refresh
  const [session, setSessionState] = useState<GoogleSession | null>(() => getSession());

  function setSession(s: GoogleSession | null) {
    setSessionState(s);
  }

  return (
    <AuthContext.Provider value={{ session, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}
