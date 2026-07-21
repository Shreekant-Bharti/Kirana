import { Link } from "@tanstack/react-router";
import { BookMarked, Printer, Settings as SettingsIcon, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

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
        <div className="flex w-[64px] items-center justify-end gap-1">
          {right}
          {onPrint && (
            <button onClick={onPrint} aria-label="Print" className="tap grid h-10 w-10 place-items-center rounded-lg text-[color:var(--accent)]">
              <Printer size={20} />
            </button>
          )}
          {!showBack && (
            <Link to="/settings" aria-label="Settings" className="tap grid h-10 w-10 place-items-center rounded-lg text-[color:var(--accent)]">
              <SettingsIcon size={20} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
