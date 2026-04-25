"use client";

import Link from "next/link";

/** כפתור חזרה לדשבורד (בית) — ממורכז בראש המסך */
export function BackToMenuButton({
  wrapperClassName = "",
  href = "/",
  label = "חזרה לבית",
}: {
  wrapperClassName?: string;
  href?: string;
  label?: string;
} = {}) {
  return (
    <div
      className={`mb-6 flex w-full justify-center ${wrapperClassName}`.trim()}
    >
      <Link
        href={href}
        className="inline-flex min-w-[12rem] items-center justify-center rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-6 py-2.5 text-sm font-semibold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
      >
        {label}
      </Link>
    </div>
  );
}
