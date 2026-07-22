import { Link } from "@tanstack/react-router";
import { BookMarked, Printer, Settings as SettingsIcon, ChevronLeft, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useSyncStatus, type SyncStatus } from "../lib/sync/syncStatus";

function SyncDot() {
  const status: SyncStatus = useSyncStatus();

  if (status.state === "syncing") {
    return (
      <div className="grid h-5 w-5 place-items-center" title="Syncing...">
        <RefreshCw size={12} className="animate-spin text-[color:var(--accent)]" />
      </div>
    );
  }

  const colors: Record<string, string> = {
    synced: "#34c759",
    pending: "#ff9500",
    offline: "#ff3b30",
    error: "#ff3b30",
  };

  const labels: Record<string, string> = {
    synced: "Synced",
    pending: `${status.pendingCount} pending`,
    offline: "Offline",
    error: status.error ?? "Sync error",
  };

  return (
    <div
      className="grid h-5 w-5 place-items-center"
      title={labels[status.state] ?? ""}
    >
      <span
        className="block h-2 w-2 rounded-full"
        style={{ backgroundColor: colors[status.state] ?? "#8e8e93" }}
      />
    </div>
  );
}

export function TopBar({
  title,
  onPrint,
  showBack = false,
  right,
}: {
  title: string;
  onPrint?: () => void;
  showBack?: boolean;
  right?: ReactNode;
}) {
  return (
    <header className="no-print sticky top-0 z-20 bg-[color:var(--background)]/85 backdrop-blur-xl">
      <div className="flex items-center gap-1 px-2 py-2.5" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <div className="flex w-[64px] items-center">
          {showBack ? (
            <Link
              to="/"
              aria-label="Back"
              className="tap flex h-10 items-center rounded-lg pl-1 pr-2 text-[color:var(--accent)]"
            >
              <ChevronLeft size={26} strokeWidth={2.25} />
              <span className="ml-0.5 text-[16px] font-normal">Back</span>
            </Link>
          ) : (
            <div className="tap flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--accent)]">
              <BookMarked size={22} />
            </div>
          )}
        </div>
        <h1 className="flex-1 truncate text-center text-[17px] font-semibold">{title}</h1>
        <div className="flex w-[64px] items-center justify-end gap-0.5">
          {right}
          {onPrint && (
            <button onClick={onPrint} aria-label="Print" className="tap grid h-10 w-10 place-items-center rounded-lg text-[color:var(--accent)]">
              <Printer size={20} />
            </button>
          )}
          {!showBack && (
            <>
              <SyncDot />
              <Link to="/settings" aria-label="Settings" className="tap grid h-10 w-10 place-items-center rounded-lg text-[color:var(--accent)]">
                <SettingsIcon size={20} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

