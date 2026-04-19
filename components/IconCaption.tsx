"use client";

import type { ReactNode } from "react";

/** אייקון + כיתוב קצר מתחת — לשימוש בשורות פעולה */
export function IconCaption({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex flex-col items-center gap-0.5 ${className}`.trim()}
    >
      {children}
      <span className="max-w-[4rem] text-center text-[9px] font-bold leading-tight text-[var(--text)]/85 sm:max-w-[4.5rem] sm:text-[10px]">
        {label}
      </span>
    </span>
  );
}
