import { useState, useEffect } from "react";
import { Download } from "lucide-react";

/**
 * Shows a "Install Bharti Udhari" banner when the browser fires the
 * beforeinstallprompt event (Chrome/Edge on Android and desktop).
 * Respects a 7-day dismissal cooldown stored in localStorage.
 */
export function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check dismissal cooldown
    const dismissed = Number(localStorage.getItem("bharti-install-dismissed") ?? 0);
    if (Date.now() - dismissed < 7 * 24 * 60 * 60 * 1000) return;

    // Already installed?
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    function handle(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      setPrompt(e);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", handle);
    return () => window.removeEventListener("beforeinstallprompt", handle);
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

  if (!visible || !prompt) return null;

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
              Install Bharti Udhari
            </div>
            <div className="mt-0.5 text-[13px] text-[color:var(--muted-foreground)] leading-relaxed">
              Faster access and complete offline support.
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
          <button
            onClick={handleInstall}
            className="flex-1 h-10 rounded-[10px] bg-[color:var(--accent)] text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 tap"
          >
            <Download size={15} strokeWidth={2.5} />
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
