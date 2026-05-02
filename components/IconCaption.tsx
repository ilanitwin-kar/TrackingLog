"use client";

import type { ReactNode } from "react";

/** אייקון + כיתוב קצר מתחת — לשימוש בשורות פעולה */
export function IconCaption({
  children,
  label,
  className = "",
  compact,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  /** שורת כלים צפופה — טקסט קטן יותר */
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex flex-col items-center ${compact ? "gap-0" : "gap-0.5"} ${className}`.trim()}
    >
      {children}
      <span
        className={
          compact
            ? "max-w-[3.25rem] text-center text-[8px] font-semibold leading-tight text-[var(--text)]/75 sm:max-w-[3.5rem] sm:text-[9px]"
            : "max-w-[4rem] text-center text-[9px] font-bold leading-tight text-[var(--text)]/85 sm:max-w-[4.5rem] sm:text-[10px]"
        }
      >
        {label}
      </span>
    </span>
  );
}
