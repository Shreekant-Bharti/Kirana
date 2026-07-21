// Type declarations for Google Identity Services (GIS)
// Loaded via https://accounts.google.com/gsi/client CDN script

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

interface OverridableTokenClientConfig {
  prompt?: string;
  hint?: string;
  state?: string;
  enable_granular_consent?: boolean;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  prompt?: string;
  hint?: string;
  state?: string;
  hosted_domain?: string;
  error_callback?: (error: { type: string }) => void;
}

interface TokenClient {
  requestAccessToken(overrideConfig?: OverridableTokenClientConfig): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: TokenClientConfig): TokenClient;
          revoke(token: string, callback?: () => void): void;
          hasGrantedAllScopes(
            tokenResponse: TokenResponse,
            firstScope: string,
            ...restScopes: string[]
          ): boolean;
        };
        id: {
          initialize(config: unknown): void;
          renderButton(parent: HTMLElement, options: unknown): void;
          prompt(callback?: (notification: unknown) => void): void;
          disableAutoSelect(): void;
        };
      };
    };
  }

  // beforeinstallprompt event — not in standard lib types yet
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    prompt(): Promise<void>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

export {};
