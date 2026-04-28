"use client";

import { usePathname, useRouter } from "next/navigation";
import { CherryMark } from "@/components/CherryMark";
import { ArrowRight } from "lucide-react";
import { getActiveJournalDateKey } from "@/lib/storage";
import { getTodayKey } from "@/lib/dateKey";
import { HomeDrawer } from "@/components/HomeDrawer";

function titleForPathname(pathname: string): string {
  if (pathname === "/") return "בית";
  if (pathname === "/journal") return "היומן שלי";
  if (pathname === "/dictionary") return "המילון האישי";
  if (pathname === "/explorer") return "מגלה מזונות";
  if (pathname === "/shopping-list" || pathname === "/shopping") return "רשימת קניות";
  if (pathname === "/library") return "הספרייה שלי";
  if (pathname === "/my-recipes") return "המתכונים שלי";
  if (pathname === "/menus") return "התפריטים שלי";
  if (pathname === "/planner") return "בניית תפריט";
  if (pathname === "/recipes") return "מחשבון מתכונים";
  if (pathname === "/weight") return "מעקב משקל";
  if (pathname === "/control-center") return "מרכז השליטה";
  if (pathname === "/assistant") return "עוזר";
  if (pathname === "/settings") return "הגדרות";
  if (pathname === "/admin") return "ניהול מערכת";
  return "";
}

/** Header קבוע: ימין חזרה/תפריט, מרכז כותרת, שמאל לוגו */
export function AppBrandMark() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/welcome" || pathname === "/pick-theme") return null;

  const isHome = pathname === "/";
  const showBack = !isHome;
  const title = titleForPathname(pathname);

  function onBack() {
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
      /* ignore */
    }

    let date: string | null = null;
    try {
      if (typeof window !== "undefined") {
        date = new URLSearchParams(window.location.search).get("date");
      }
    } catch {
      /* ignore */
    }
    const dk =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : getActiveJournalDateKey() ?? null;
    if (dk && dk !== getTodayKey()) {
      router.push(`/journal?date=${encodeURIComponent(dk)}`);
      return;
    }
    router.push("/");
  }

  return (
    <div className="fixed left-0 right-0 top-0 z-[250] pointer-events-none">
      <div
        className="pointer-events-auto relative mx-auto flex h-[60px] w-full max-w-lg items-center px-3 pt-[env(safe-area-inset-top)]"
        dir="rtl"
      >
        <div className="pointer-events-auto absolute right-3 top-[env(safe-area-inset-top)] flex h-[60px] items-center">
          {showBack ? (
            <button
              type="button"
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/0 text-[var(--stem)] transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
              onClick={onBack}
              aria-label="חזרה"
              title="חזרה"
            >
              <ArrowRight className="h-6 w-6" />
            </button>
          ) : (
            <HomeDrawer />
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top)] flex h-[60px] items-center justify-center">
          <p className="pointer-events-none max-w-[14rem] truncate text-center text-sm font-extrabold text-[var(--cherry)]">
            {title}
          </p>
        </div>

        <div className="pointer-events-auto absolute left-3 top-[env(safe-area-inset-top)] flex h-[60px] items-center" dir="ltr">
          <button
            type="button"
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/0 transition hover:bg-white/25 active:scale-[0.99]"
            onClick={() => router.push("/")}
            aria-label="בית"
            title="בית"
          >
            <CherryMark className="h-6 w-8 shrink-0 drop-shadow-sm" />
          </button>
        </div>
        <div className="h-[60px] w-full" aria-hidden />
      </div>
    </div>
  );
}
