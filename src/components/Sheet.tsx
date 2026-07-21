import { type ReactNode, useEffect } from "react";

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-[28px] bg-[color:var(--surface)] px-5 pb-8 pt-3 animate-sheet-in shadow-[0_-8px_32px_rgba(0,0,0,0.18)]"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-[color:var(--hairline)]" />
        <h2 className="mb-4 text-center text-[17px] font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SheetButtons({
  onCancel,
  onConfirm,
  confirmLabel = "Save",
  danger = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="mt-5 space-y-2">
      <button
        onClick={onConfirm}
        className={`tap h-12 w-full rounded-[14px] text-[16px] font-semibold text-white ${
          danger ? "bg-[color:var(--danger)]" : "bg-[color:var(--accent)]"
        }`}
      >
        {confirmLabel}
      </button>
      <button
        onClick={onCancel}
        className="tap h-12 w-full rounded-[14px] bg-[color:var(--muted)] text-[16px] font-medium text-[color:var(--foreground)]"
      >
        Cancel
      </button>
    </div>
  );
}
