"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useMemo, useState } from "react";
import {
  IconNavBook,
  IconNavChart,
  IconNavHome,
  IconPlusCircle,
} from "@/components/Icons";
import { getTodayKey } from "@/lib/dateKey";
import {
  loadDayJournalClosedMap,
  loadProfile,
  saveDayJournalClosedMap,
} from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";

const navLinks = [
  { href: "/", label: "בית", Icon: IconNavHome },
  { href: "/dictionary", label: "מילון", Icon: IconNavBook },
  { href: "/report", label: "דוח", Icon: IconNavChart },
] as const;

function resolveAddFoodDateKey(
  pathname: string,
  dateParam: string | null
): string {
  const today = getTodayKey();
  if (pathname === "/" && dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    if (dateParam <= today) return dateParam;
  }
  return today;
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const titleId = useId();
  const subtitleId = useId();
  const gender = loadProfile().gender;

  const addFoodDateKey = useMemo(
    () => resolveAddFoodDateKey(pathname, searchParams.get("date")),
    [pathname, searchParams]
  );

  const [journalClosedTick, setJournalClosedTick] = useState(0);
  useEffect(() => {
    const onClosed = () => setJournalClosedTick((n) => n + 1);
    window.addEventListener("cj-journal-closed-changed", onClosed);
    return () =>
      window.removeEventListener("cj-journal-closed-changed", onClosed);
  }, []);

  const isAddFoodDateClosed = useMemo(() => {
    void journalClosedTick;
    return loadDayJournalClosedMap()[addFoodDateKey] === true;
  }, [addFoodDateKey, journalClosedTick]);

  function goAddFood() {
    setSheetOpen(false);
    router.push(`/add-food?date=${encodeURIComponent(addFoodDateKey)}`);
  }

  function openJournalDayAndGoAddFood() {
    const m = { ...loadDayJournalClosedMap() };
    delete m[addFoodDateKey];
    saveDayJournalClosedMap(m);
    window.dispatchEvent(new Event("cj-journal-closed-changed"));
    goAddFood();
  }

  return (
    <>
      <nav
        className="bottom-nav-shell fixed bottom-0 left-0 right-0 z-[100] border-t-2 border-[var(--border-cherry-soft)] bg-white/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-sm print:hidden"
        aria-label="ניווט ראשי"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4 items-center gap-0.5 px-0.5 sm:gap-1 sm:px-1">
          {navLinks.slice(0, 2).map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <li key={href} className="flex min-w-0 justify-center">
                <Link
                  href={href}
                  className={`relative flex min-h-[2.75rem] min-w-0 max-w-full flex-row items-center justify-center gap-1 rounded-xl py-1 pe-1 ps-1 text-[9px] font-bold leading-tight transition-colors sm:min-h-0 sm:gap-1.5 sm:py-1.5 sm:text-[10px] sm:font-semibold ${
                    active
                      ? "text-[var(--cherry)]"
                      : "text-[var(--stem)]/85 hover:text-[var(--cherry)]"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-xl bg-cherry-faint ring-1 ring-[var(--border-cherry-soft)]"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 32,
                      }}
                    />
                  )}
                  <span className="max-w-[3.2rem] text-end leading-[1.15] sm:max-w-[4rem]">
                    {label}
                  </span>
                  <Icon
                    className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${active ? "text-[var(--cherry)]" : "text-[var(--stem)]"}`}
                  />
                </Link>
              </li>
            );
          })}

          <li className="flex min-w-0 justify-center">
            <button
              type="button"
              className="flex min-h-[2.75rem] min-w-0 max-w-full flex-row items-center justify-center gap-1 rounded-full border-[2px] border-white bg-gradient-to-b from-[var(--stem-mid)] to-[var(--stem)] px-2 py-1.5 text-white shadow-[0_4px_16px_var(--stem-shadow)] transition hover:brightness-105 active:scale-[0.97] sm:min-h-0 sm:px-3 sm:py-2"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-controls={sheetOpen ? "add-food-sheet" : undefined}
              aria-label="הוספת מזון ליומן"
              onClick={() => setSheetOpen(true)}
            >
              <span className="max-w-[3rem] text-end text-[9px] font-extrabold leading-[1.15] sm:max-w-none sm:text-[10px]">
                הוספה
              </span>
              <IconPlusCircle className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
            </button>
          </li>

          {(() => {
            const { href, label, Icon } = navLinks[2];
            const active = pathname === href;
            return (
              <li key={href} className="flex min-w-0 justify-center">
                <Link
                  href={href}
                  className={`relative flex min-h-[2.75rem] min-w-0 max-w-full flex-row items-center justify-center gap-1 rounded-xl py-1 pe-1 ps-1 text-[9px] font-bold leading-tight transition-colors sm:min-h-0 sm:gap-1.5 sm:py-1.5 sm:text-[10px] sm:font-semibold ${
                    active
                      ? "text-[var(--cherry)]"
                      : "text-[var(--stem)]/85 hover:text-[var(--cherry)]"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-xl bg-cherry-faint ring-1 ring-[var(--border-cherry-soft)]"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 32,
                      }}
                    />
                  )}
                  <span className="max-w-[3.2rem] text-end leading-[1.15] sm:max-w-[4rem]">
                    {label}
                  </span>
                  <Icon
                    className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${active ? "text-[var(--cherry)]" : "text-[var(--stem)]"}`}
                  />
                </Link>
              </li>
            );
          })()}
        </ul>
      </nav>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            role="presentation"
            className="fixed inset-0 z-[180] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              id="add-food-sheet"
              role="dialog"
              aria-modal
              aria-labelledby={titleId}
              aria-describedby={subtitleId}
              className="glass-panel w-full max-w-md rounded-t-[1.35rem] border-2 border-[var(--border-cherry-soft)] p-5 shadow-2xl sm:rounded-2xl"
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--text)]/20 sm:hidden" />
              <h2
                id={titleId}
                className="panel-title-cherry text-center text-xl"
              >
                הוספה ליומן
              </h2>
              <p
                id={subtitleId}
                className="mt-2 text-center text-sm leading-relaxed text-[var(--text)]/75"
              >
                חיפוש במאגרים שלך ובמאגר עולמי, עם מסך מלא שנוח לחיפוש.
              </p>
              <p className="mt-2 text-center text-xs font-medium text-[var(--text)]/55">
                נרשם לתאריך:{" "}
                <span className="font-bold text-[var(--text)]/80">
                  {addFoodDateKey}
                </span>
              </p>
              {isAddFoodDateClosed && (
                <p
                  className="mt-3 rounded-xl border border-[var(--border-cherry-soft)] bg-cherry-faint px-3 py-2.5 text-center text-xs font-semibold leading-relaxed text-[var(--cherry)]"
                  role="status"
                >
                  {gf(
                    gender,
                    "היום הזה סגור ביומן. לחצי למטה כדי לפתוח אותו שוב ואז להוסיף רשומות.",
                    "היום הזה סגור ביומן. לחץ למטה כדי לפתוח אותו שוב ואז להוסיף רשומות."
                  )}
                </p>
              )}
              <motion.button
                type="button"
                className="btn-stem mt-5 w-full rounded-xl py-3.5 text-base font-bold"
                whileTap={{ scale: 0.98 }}
                onClick={
                  isAddFoodDateClosed ? openJournalDayAndGoAddFood : goAddFood
                }
              >
                {isAddFoodDateClosed
                  ? "פתיחת היום ומעבר להוספת מזון"
                  : "פתיחת מסך הוספת מזון"}
              </motion.button>
              <button
                type="button"
                className="btn-gold mt-3 w-full rounded-xl py-2.5 text-sm font-bold"
                onClick={() => setSheetOpen(false)}
              >
                סגירה
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}