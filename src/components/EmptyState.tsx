import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-[color:var(--muted)] text-[color:var(--muted-foreground)]">
        {icon}
      </div>
      <div className="text-[17px] font-semibold">{title}</div>
      {description && (
        <div className="mt-1 max-w-[280px] text-[14px] leading-snug text-[color:var(--muted-foreground)]">
          {description}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-[16px] bg-[color:var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="skeleton h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-3 w-1/3" />
            </div>
            <div className="skeleton h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
