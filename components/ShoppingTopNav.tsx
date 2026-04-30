"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const btnClass =
  "flex min-h-[2.75rem] flex-1 min-w-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-1.5 py-2 text-xs font-semibold text-[var(--cherry)] shadow-sm transition-colors hover:bg-[var(--cherry-muted)] active:scale-[0.99] sm:gap-2 sm:px-2.5 sm:text-sm";

const stickyStripClass =
  "sticky top-0 z-50 mb-4 rounded-b-xl border-b border-[var(--border-cherry-soft)]/80 bg-white px-2.5 py-2.5 shadow-[0_1px_0_rgba(155,27,48,0.05)] sm:px-3 sm:py-3";

type Props = {
  onAddPersonal: () => void;
};

/** שורת פעולות דביקה בראש רשימת הקניות — עיצוב כמו סרגל החיפוש במילון */
export function ShoppingTopNav({ onAddPersonal }: Props) {
  const searchParams = useSearchParams();
  void searchParams;
  return (
    <div className={stickyStripClass}>
      <nav
        className="flex w-full gap-2 sm:gap-3"
        aria-label="ניווט רשימת קניות"
      >
        <Link href="/explorer" className={btnClass}>
          <span className="shrink-0 text-base leading-none sm:text-lg" aria-hidden>
            🔍
          </span>
          <span className="truncate text-center leading-tight">מגלה המזונות</span>
        </Link>
        <button type="button" className={btnClass} onClick={onAddPersonal}>
          <span className="shrink-0 text-base leading-none sm:text-lg" aria-hidden>
            ➕
          </span>
          <span className="truncate text-center leading-tight">הוספת פריט</span>
        </button>
      </nav>
    </div>
  );
}
