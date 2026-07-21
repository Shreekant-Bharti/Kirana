import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      {title && (
        <div className="mb-2 px-4 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          {title}
        </div>
      )}
      <div className="ios-group mx-3">{children}</div>
      {footer && <div className="mt-2 px-4 text-[12px] text-[color:var(--muted-foreground)]">{footer}</div>}
    </div>
  );
}

export function Row({
  icon,
  iconBg = "#8e8e93",
  label,
  value,
  onClick,
  right,
  danger,
}: {
  icon?: ReactNode;
  iconBg?: string;
  label: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const Wrap: any = onClick ? "button" : "div";
  return (
    <Wrap
      onClick={onClick}
      className={`ios-row w-full text-left ${onClick ? "tap" : ""}`}
    >
      {icon && (
        <span
          className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[7px] text-white"
          style={{ background: iconBg }}
        >
          {icon}
        </span>
      )}
      <span className={`flex-1 truncate text-[16px] ${danger ? "text-[color:var(--danger)]" : ""}`}>{label}</span>
      {value !== undefined && (
        <span className="max-w-[55%] truncate text-right text-[15px] text-[color:var(--muted-foreground)]">
          {value}
        </span>
      )}
      {right ?? (onClick && <ChevronRight size={18} className="text-[color:var(--hairline)] shrink-0" />)}
    </Wrap>
  );
}
