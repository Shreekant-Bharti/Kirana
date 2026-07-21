import { useState, useEffect } from "react";
import { Download, Share } from "lucide-react";

/**
 * Shows a custom PWA install prompt card:
 * - On Android Chrome/Edge: listens for `beforeinstallprompt` and triggers native install dialog.
 * - On iOS Safari: displays instructions ("Tap Share -> Add to Home Screen").
 * Respects a 7-day dismissal cooldown stored in localStorage.
 */
export function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if already running as standalone PWA
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Check dismissal cooldown (7 days)
    const dismissed = Number(localStorage.getItem("bharti-install-dismissed") ?? 0);
    if (Date.now() - dismissed < 7 * 24 * 60 * 60 * 1000) return;

    // Detect iOS Safari
    const ua = window.navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua);

    if (ios) {
      setIsIos(true);
      setVisible(true);
      return;
    }

    // Android / Chrome / Edge native install prompt listener
    function handleBeforeInstallPrompt(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      setPrompt(e);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
  }

  function handleLater() {
    localStorage.setItem("bharti-install-dismissed", String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="no-print fixed bottom-[90px] inset-x-4 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm rounded-[20px] bg-[color:var(--surface)] border border-[color:var(--border)] shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-4 animate-fade-up">
        <div className="flex items-start gap-3">
          <img
            src="/icon-192.png"
            alt="Bharti Udhari"
            className="w-12 h-12 rounded-[10px] shadow-sm flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] text-[color:var(--foreground)]">
              Install Bharti Udhari App
            </div>
            <div className="mt-0.5 text-[13px] text-[color:var(--muted-foreground)] leading-relaxed">
              {isIos
                ? 'Tap the Share button below, then select "Add to Home Screen"'
                : "Install for faster access and full offline support."}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={handleLater}
            className="flex-1 h-10 rounded-[10px] bg-[color:var(--muted)] text-[color:var(--muted-foreground)] text-[14px] font-medium tap"
          >
            Later
          </button>
          {!isIos && prompt ? (
            <button
              onClick={handleInstall}
              className="flex-1 h-10 rounded-[10px] bg-[color:var(--accent)] text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 tap"
            >
              <Download size={15} strokeWidth={2.5} />
              Install
            </button>
          ) : isIos ? (
            <div className="flex-1 h-10 rounded-[10px] bg-[color:var(--accent)]/15 text-[color:var(--accent)] text-[13px] font-semibold flex items-center justify-center gap-1.5">
              <Share size={15} />
              Tap Share → Add
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
