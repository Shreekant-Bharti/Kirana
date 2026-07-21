import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Detects when a new service worker version is waiting and shows a
 * non-intrusive "Update available" toast with an Update Now / Later choice.
 */
export function UpdatePrompt() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function checkForUpdate(reg: ServiceWorkerRegistration) {
      if (reg.waiting) {
        setWaitingSW(reg.waiting);
        setVisible(true);
      }
    }

    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
      if (!reg) return;
      checkForUpdate(reg);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingSW(installing);
            setVisible(true);
          }
        });
      });
    });
  }, []);

  function handleUpdate() {
    if (!waitingSW) return;
    waitingSW.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }

  if (!visible) return null;

  return (
    <div className="no-print fixed top-4 inset-x-4 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm rounded-[16px] bg-[color:var(--surface)] border border-[color:var(--border)] shadow-[0_8px_24px_rgba(0,0,0,0.15)] px-4 py-3 flex items-center gap-3 animate-fade-up">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--accent)]/15 text-[color:var(--accent)]">
          <RefreshCw size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[color:var(--foreground)]">
            New Update Available
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setVisible(false)}
            className="text-[13px] text-[color:var(--muted-foreground)] px-2 py-1"
          >
            Later
          </button>
          <button
            onClick={handleUpdate}
            className="rounded-[8px] bg-[color:var(--accent)] text-white text-[13px] font-semibold px-3 py-1.5 tap"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
