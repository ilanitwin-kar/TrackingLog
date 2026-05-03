"use client";

import Link from "next/link";

export type RecipeShelfNavActive = "calculator" | "library";

const segmentWrap =
  "flex min-h-[52px] flex-1 items-center justify-center rounded-xl px-2 py-2.5 text-center leading-snug transition sm:min-h-[56px] sm:px-3 sm:py-3";

/** טאב פעיל — כרטיס לבן בולט בתוך מסגרת */
const activeClass = `${segmentWrap} border-2 border-[var(--cherry)]/35 bg-white text-[var(--cherry)] shadow-md ring-2 ring-[color-mix(in_srgb,var(--accent)_55%,transparent)] text-base font-extrabold sm:text-lg`;

/** טאב לא פעיל — קישור עם מסגרת */
const linkClass = `${segmentWrap} border-2 border-[var(--border-cherry-soft)] bg-white/90 text-[var(--stem-deep)] shadow-sm hover:border-[var(--cherry)]/25 hover:bg-[color-mix(in_srgb,var(--accent)_18%,white)] active:scale-[0.99] text-base font-extrabold sm:text-lg`;

/** ניווט בין מחשבון מתכונים לבין רשימת המתכונים — טאבים ברורים */
export function RecipeShelfNav({ active }: { active: RecipeShelfNavActive }) {
  return (
    <div
      className="mb-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-[color-mix(in_srgb,var(--accent)_32%,white)] p-2 shadow-md"
      role="navigation"
      aria-label="מחשבון מתכונים ומתכונים"
    >
      <div className="grid grid-cols-2 gap-2">
        {active === "calculator" ? (
          <span className={activeClass} aria-current="page">
            מחשבון מתכונים
          </span>
        ) : (
          <Link href="/recipes" className={linkClass}>
            מחשבון מתכונים
          </Link>
        )}
        {active === "library" ? (
          <span className={activeClass} aria-current="page">
            מתכונים
          </span>
        ) : (
          <Link href="/my-recipes" className={linkClass}>
            מתכונים
          </Link>
        )}
      </div>
    </div>
  );
}
