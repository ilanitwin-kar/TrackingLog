"use client";

import Link from "next/link";

const btnClass =
  "flex min-h-[2.75rem] flex-1 min-w-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/70 px-1.5 py-2 text-xs font-semibold text-[var(--cherry)] shadow-[0_4px_16px_rgba(0,0,0,0.07)] backdrop-blur-md transition-colors hover:bg-[var(--cherry-muted)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] active:scale-[0.99] sm:gap-2 sm:px-2.5 sm:text-sm";

type Props = {
  onAddPersonal: () => void;
};

/** שורת ניווט בראש רשימת הקניות — עקבי עם מגלה המזונות */
export function ShoppingTopNav({ onAddPersonal }: Props) {
  return (
    <nav
      className="mb-6 flex w-full gap-2 sm:gap-3"
      aria-label="ניווט רשימת קניות"
    >
      <Link href="/" className={btnClass}>
        <span className="shrink-0 text-base leading-none sm:text-lg" aria-hidden>
          🏠
        </span>
        <span className="truncate text-center leading-tight">חזרה לתפריט</span>
      </Link>
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
  );
}
