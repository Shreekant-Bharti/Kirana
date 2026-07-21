// Authentication stub — future: fingerprint / device PIN.
// Currently bypassed. Keep this interface stable so real auth can slot in.
export type AuthMethod = "none" | "pin" | "fingerprint";

export interface AuthState {
  method: AuthMethod;
  authenticated: boolean;
}

export async function checkAuth(): Promise<AuthState> {
  // Bypass for now.
  return { method: "none", authenticated: true };
}

export async function authenticate(): Promise<boolean> {
  return true;
}
