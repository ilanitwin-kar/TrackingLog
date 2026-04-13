"use client";

import Link from "next/link";

/** כפתור חזרה לדשבורד (בית) — ממורכז בראש המסך */
export function BackToMenuButton({
  wrapperClassName = "",
}: {
  wrapperClassName?: string;
} = {}) {
  return (
    <div
      className={`mb-6 flex w-full justify-center ${wrapperClassName}`.trim()}
    >
      <Link
        href="/"
        className="inline-flex min-w-[12rem] items-center justify-center rounded-xl border-2 border-[#FADADD] bg-white px-6 py-2.5 text-sm font-semibold text-[#333333] shadow-sm transition hover:bg-[#fffafb] active:scale-[0.99]"
      >
        חזרה לתפריט
      </Link>
    </div>
  );
}
