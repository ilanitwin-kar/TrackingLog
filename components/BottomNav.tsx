"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import {
  IconNavBook,
  IconNavChart,
  IconNavHome,
  IconPlusCircle,
} from "@/components/Icons";
import { getTodayKey } from "@/lib/dateKey";

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

  const addFoodDateKey = useMemo(
    () => resolveAddFoodDateKey(pathname, searchParams.get("date")),
    [pathname, searchParams]
  );

  function goAddFood() {
    setSheetOpen(false);
    router.push(`/add-food?date=${encodeURIComponent(addFoodDateKey)}`);
  }

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[100] border-t-2 border-[#FADADD] bg-white pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_20px_rgba(250,218,221,0.5)] print:hidden"
        aria-label="ניווט ראשי"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4 items-end gap-0 px-1">
          {navLinks.slice(0, 2).map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <li key={href} className="flex min-w-0 justify-center">
                <Link
                  href={href}
                  className={`relative flex min-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition-colors sm:min-w-[3.75rem] sm:py-2 sm:text-xs ${
                    active
                      ? "text-[#333333]"
                      : "text-[#333333]/65 hover:text-[#333333]"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-xl bg-[#FADADD]/50 ring-1 ring-[#FADADD]"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 32,
                      }}
                    />
                  )}
                  <Icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
                  <span className="truncate px-0.5 text-center leading-tight">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}

          <li className="relative flex justify-center pb-1">
            <button
              type="button"
              className="absolute -top-8 flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-b from-[#ffe4e8] to-[#ffd0d8] text-[#4a1522] shadow-[0_6px_22px_rgba(200,100,120,0.5)] transition hover:brightness-105 active:scale-[0.96] sm:h-14 sm:w-14"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-controls={sheetOpen ? "add-food-sheet" : undefined}
              aria-label="הוספת מזון ליומן"
              onClick={() => setSheetOpen(true)}
            >
              <IconPlusCircle className="h-8 w-8 sm:h-9 sm:w-9" />
            </button>
            <span className="pointer-events-none pt-5 text-center text-[9px] font-bold text-[#333333]/55 sm:text-[10px]">
              הוספה
            </span>
          </li>

          {(() => {
            const { href, label, Icon } = navLinks[2];
            const active = pathname === href;
            return (
              <li key={href} className="flex min-w-0 justify-center">
                <Link
                  href={href}
                  className={`relative flex min-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition-colors sm:min-w-[3.75rem] sm:py-2 sm:text-xs ${
                    active
                      ? "text-[#333333]"
                      : "text-[#333333]/65 hover:text-[#333333]"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-xl bg-[#FADADD]/50 ring-1 ring-[#FADADD]"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 32,
                      }}
                    />
                  )}
                  <Icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
                  <span className="truncate px-0.5 text-center leading-tight">
                    {label}
                  </span>
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
              className="glass-panel w-full max-w-md rounded-t-[1.35rem] border-2 border-[#FADADD] p-5 shadow-2xl sm:rounded-2xl"
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#333333]/20 sm:hidden" />
              <h2
                id={titleId}
                className="text-center text-xl font-extrabold text-[#333333]"
              >
                הוספה ליומן
              </h2>
              <p
                id={subtitleId}
                className="mt-2 text-center text-sm leading-relaxed text-[#333333]/75"
              >
                חיפוש במאגרים שלך ובמאגר עולמי, עם מסך מלא שנוח לחיפוש.
              </p>
              <p className="mt-2 text-center text-xs font-medium text-[#333333]/55">
                נרשם לתאריך:{" "}
                <span className="font-bold text-[#333333]/80">
                  {addFoodDateKey}
                </span>
              </p>
              <motion.button
                type="button"
                className="btn-gold mt-5 w-full rounded-xl py-3.5 text-base font-bold"
                whileTap={{ scale: 0.98 }}
                onClick={goAddFood}
              >
                פתיחת מסך הוספת מזון
              </motion.button>
              <button
                type="button"
                className="mt-3 w-full rounded-xl border-2 border-[#FADADD] bg-white py-2.5 text-sm font-semibold text-[#333333] transition hover:bg-[#FADADD]/25"
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