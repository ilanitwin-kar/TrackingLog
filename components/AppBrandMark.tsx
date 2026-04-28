"use client";

import { usePathname, useRouter } from "next/navigation";
import { BlueberryMark } from "@/components/BlueberryMark";
import { CherryMark } from "@/components/CherryMark";
import { useAppVariant } from "@/components/useAppVariant";
import { getBrandName } from "@/lib/appVariant";

/** מותג Cherry / BLUEBERRY בפינה השמאלית העליונה (LTR) */
export function AppBrandMark() {
  const pathname = usePathname();
  const router = useRouter();
  const variant = useAppVariant();
  if (pathname === "/welcome" || pathname === "/pick-theme") return null;

  const Mark = variant === "blueberry" ? BlueberryMark : CherryMark;

  return (
    <div className="sticky top-0 z-[250] bg-white/55 backdrop-blur-sm">
      <div
        className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 pb-1 pt-[max(0.4rem,env(safe-area-inset-top))]"
        dir="ltr"
      >
        <button
          type="button"
          onClick={() => router.push("/assistant")}
          className="flex items-center gap-1 rounded-xl bg-white/0 px-1 py-0.5 transition hover:bg-white/25 active:scale-[0.99]"
          dir="ltr"
          aria-label="פתיחת העוזר"
          title="פתיחת העוזר"
        >
          <Mark className="h-6 w-8 shrink-0 drop-shadow-sm sm:h-7 sm:w-9" />
          <span className="select-none font-[system-ui,'Segoe_UI',sans-serif] text-[0.82rem] font-extrabold tracking-tight text-[var(--ui-brand-wordmark)] drop-shadow-[0_1px_0_rgba(255,255,255,0.85)] sm:text-[0.9rem]">
            {getBrandName(variant)}
          </span>
        </button>

        <button
          type="button"
          className="hidden flex-1 items-center justify-between gap-2 rounded-full border-2 border-[var(--border-cherry-soft)] bg-white/70 px-3 py-1 text-[11px] font-semibold text-[var(--stem)] shadow-sm transition hover:bg-white md:flex"
          onClick={() => {
            try {
              window.dispatchEvent(new Event("cj-open-search"));
            } catch {
              /* ignore */
            }
          }}
          aria-label="חיפוש באפליקציה"
          title="חיפוש באפליקציה (Ctrl/⌘+K)"
          dir="rtl"
        >
          <span className="truncate text-[var(--text)]/70">חיפוש…</span>
          <span className="shrink-0 text-[10px] font-bold text-[var(--stem)]/60">⌘K</span>
        </button>

        <button
          type="button"
          className="flex flex-1 items-center justify-between gap-2 rounded-full border-2 border-[var(--border-cherry-soft)] bg-white/70 px-3 py-1 text-[11px] font-semibold text-[var(--stem)] shadow-sm transition hover:bg-white md:hidden"
          onClick={() => {
            try {
              window.dispatchEvent(new Event("cj-open-search"));
            } catch {
              /* ignore */
            }
          }}
          aria-label="חיפוש באפליקציה"
          title="חיפוש באפליקציה"
          dir="rtl"
        >
          <span className="truncate text-[var(--text)]/70">חיפוש…</span>
          <span className="shrink-0 text-sm" aria-hidden>
            🔍
          </span>
        </button>
      </div>
    </div>
  );
}
