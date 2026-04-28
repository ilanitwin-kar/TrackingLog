"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const btnClass =
  "flex min-h-[2.75rem] flex-1 min-w-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/70 px-2.5 py-2.5 text-sm font-semibold text-[var(--cherry)] shadow-[0_4px_16px_rgba(0,0,0,0.07)] backdrop-blur-md transition-colors hover:bg-[var(--cherry-muted)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] active:scale-[0.99] sm:px-3";

/** שורת ניווט בראש מגלה המזונות — מסגרת וצבע טקסט לפי מסלול (Cherry / Blueberry) דרך משתני ערכת הנושא */
export function ExplorerTopNav() {
  useSearchParams();
  return (
    <nav
      className="mb-6 flex w-full gap-3"
      aria-label="ניווט מסך מגלה המזונות"
    >
      <Link href="/shopping-list" className={btnClass}>
        <span className="shrink-0 text-lg leading-none" aria-hidden>
          🛒
        </span>
        <span className="truncate text-center leading-tight">רשימת קניות</span>
      </Link>
    </nav>
  );
}
