"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CherryMark } from "@/components/CherryMark";
import { ArrowRight } from "lucide-react";
import { getActiveJournalDateKey } from "@/lib/storage";
import { getTodayKey } from "@/lib/dateKey";
import { HomeDrawer } from "@/components/HomeDrawer";

function titleForPathname(pathname: string): string {
  if (pathname === "/") return "בית";
  if (pathname === "/journal") return "היומן שלי";
  if (pathname === "/add-food") return "הוספת מזון";
  if (pathname === "/add-food-ai") return "הוספת מזון (AI)";
  if (pathname === "/dictionary") return "מילון אישי";
  if (pathname === "/explorer") return "מגלה מזונות";
  if (pathname === "/shopping-list" || pathname === "/shopping") return "רשימת קניות";
  if (pathname === "/library") return "הספרייה שלי";
  if (pathname === "/my-recipes") return "המתכונים שלי";
  if (pathname === "/menus") return "התפריטים שלי";
  if (pathname === "/planner") return "בניית תפריט";
  if (pathname === "/recipes") return "מחשבון מתכונים";
  if (pathname === "/weight") return "מעקב משקל";
  if (pathname === "/calorie-board") return "לוח צבירת קלוריות";
  if (pathname === "/daily-summary") return "סיכום";
  if (pathname === "/report") return "דוח אסטרטגי";
  if (pathname === "/tdee") return "יעד קלוריות ופרופיל";
  if (pathname === "/wizard") return "התחלה";
  if (pathname === "/welcome") return "ברוכים הבאים";
  if (pathname === "/forgot-password") return "שחזור סיסמה";
  if (pathname === "/privacy") return "מדיניות פרטיות";
  if (pathname === "/terms") return "תנאי שימוש";
  if (pathname === "/presets") return "ערכות מוכנות";
  if (pathname === "/experiment") return "נסיון";
  if (pathname === "/control-center") return "מרכז השליטה";
  if (pathname === "/assistant") return "עוזר";
  if (pathname === "/settings") return "הגדרות";
  if (pathname === "/admin") return "ניהול מערכת";
  return "מסך";
}

function HeaderBarContent({
  showBack,
  title,
  titleClassName,
  titleAccessory,
  onBack,
}: {
  showBack: boolean;
  title: string;
  titleClassName: string;
  titleAccessory?: ReactNode;
  onBack: () => void;
}) {
  const router = useRouter();
  return (
    <div className="relative h-[60px] w-full">
      <div className="absolute right-3 top-0 flex h-[60px] items-center">
        {showBack ? (
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/0 text-[var(--stem)] transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
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

      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[60px] items-center justify-center gap-1.5 px-14">
        <p
          className={`pointer-events-none max-w-[11rem] truncate text-center font-extrabold text-[var(--cherry)] sm:max-w-[13rem] ${titleClassName}`}
        >
          {title}
        </p>
        {titleAccessory ? (
          <span className="pointer-events-auto shrink-0">{titleAccessory}</span>
        ) : null}
      </div>

      <div
        className="absolute left-3 top-0 flex h-[60px] items-center"
        dir="ltr"
      >
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/0 transition hover:bg-white/25 active:scale-[0.99]"
          onClick={() => router.push("/")}
          aria-label="בית"
          title="בית"
        >
          <CherryMark className="h-6 w-8 shrink-0 drop-shadow-sm" />
        </button>
      </div>
    </div>
  );
}

/** הדר גלובלי אחיד — sticky, ללא קו תחתון. */
export function AppBrandMark() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/welcome" || pathname === "/pick-theme") return null;

  const isHome = pathname === "/";
  const showBack = !isHome;
  const title = titleForPathname(pathname);
  const titleSizeClass =
    pathname === "/journal" ||
    pathname === "/dictionary" ||
    pathname === "/shopping"
      ? "text-base sm:text-[1.05rem]"
      : "text-sm";

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

  const flowHeader =
    pathname === "/journal" ||
    pathname === "/dictionary" ||
    pathname === "/shopping";
  const isDictionary = pathname === "/dictionary";
  const isShopping = pathname === "/shopping";

  return (
    <header
      className={`pointer-events-none w-full shrink-0 bg-[var(--cherry-muted)]/45 ${
        flowHeader ? "relative z-[1]" : "sticky top-0 z-[250]"
      }`}
    >
      <div
        className="pointer-events-auto relative mx-auto flex w-full max-w-lg flex-col px-3 pt-[env(safe-area-inset-top)]"
        dir="rtl"
      >
        <HeaderBarContent
          showBack={showBack}
          title={title}
          titleClassName={titleSizeClass}
          titleAccessory={
            isDictionary ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--border-cherry-soft)] bg-white text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                aria-label="הסבר על המילון"
                title="הסבר"
                onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent("cj-dictionary-help"));
                  } catch {
                    /* ignore */
                  }
                }}
              >
                ?
              </button>
            ) : isShopping ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--border-cherry-soft)] bg-white text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                aria-label="הסבר על רשימת הקניות"
                title="הסבר"
                onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent("cj-shopping-help"));
                  } catch {
                    /* ignore */
                  }
                }}
              >
                ?
              </button>
            ) : undefined
          }
          onBack={onBack}
        />
      </div>
    </header>
  );
}
