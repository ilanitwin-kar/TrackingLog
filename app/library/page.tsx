"use client";

import Link from "next/link";

export default function LibraryPage() {
  return (
    <div
      className="mx-auto min-h-[100dvh] max-w-lg bg-gradient-to-b from-[#fff8fa] via-white to-[#f6faf3] px-4 py-8 pb-28 md:py-12"
      dir="rtl"
    >
      <h1 className="heading-page mb-2 text-center text-2xl md:text-3xl">
        הספרייה שלי
      </h1>
      <p className="mb-8 text-center text-sm font-medium leading-relaxed text-[var(--stem)]/80">
        כאן נמצאים המתכונים, התפריטים ורשימת הקניות שלך — במקום אחד.
      </p>

      <div className="grid gap-3">
        <Link
          href="/my-recipes?from=library"
          className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 px-4 py-4 shadow-sm transition hover:bg-[var(--cherry-muted)]/20"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--stem)]">
                המתכונים שלי
              </p>
              <p className="mt-1 text-xs font-medium text-[var(--stem)]/80">
                מתכונים ששמרת לעריכה ושימוש חוזר.
              </p>
            </div>
            <span className="text-xl" aria-hidden>
              🍲
            </span>
          </div>
        </Link>

        <Link
          href="/menus?from=library"
          className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 px-4 py-4 shadow-sm transition hover:bg-[var(--cherry-muted)]/20"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--stem)]">
                התפריטים שלי
              </p>
              <p className="mt-1 text-xs font-medium text-[var(--stem)]/80">
                תפריטים ששמרת לטעינה חוזרת ותכנון שבועי.
              </p>
            </div>
            <span className="text-xl" aria-hidden>
              🗓️
            </span>
          </div>
        </Link>

        <Link
          href="/shopping?from=library"
          className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 px-4 py-4 shadow-sm transition hover:bg-[var(--cherry-muted)]/20"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--stem)]">
                הקניות שלי
              </p>
              <p className="mt-1 text-xs font-medium text-[var(--stem)]/80">
                רשימה אחת לסופר — מסמנים מה נקנה.
              </p>
            </div>
            <span className="text-xl" aria-hidden>
              🧺
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}

