"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadProfile } from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import { loadSavedMenus, removeSavedMenu, type SavedMenu } from "@/lib/menuStorage";
import { DictionarySwipeDeleteRow } from "@/components/DictionarySwipeDeleteRow";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function MenusPage() {
  const gender = loadProfile().gender;
  const searchParams = useSearchParams();
  const [menus, setMenus] = useState<SavedMenu[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  void searchParams;

  useEffect(() => {
    setMenus(loadSavedMenus());
    function onStorage(e: StorageEvent) {
      if (e.key === "cj_saved_menus_v1") setMenus(loadSavedMenus());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`} dir="rtl">
      <motion.div
        className="mt-4 glass-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {menus.length === 0 ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-[var(--stem)]/75">
              {gf(
                gender,
                "עדיין אין תפריטים שמורים. בקשי מהעוזרת לבנות תפריט ואז אשרי אותו.",
                "עדיין אין תפריטים שמורים. בקש מהעוזרת לבנות תפריט ואז אשר אותו."
              )}
            </p>
            <Link
              href="/assistant"
              className="mt-4 inline-flex items-center justify-center rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
            >
              מעבר לעוזרת
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {menus.map((m) => (
              <li key={m.id}>
                <DictionarySwipeDeleteRow
                  onDelete={() => {
                    setMenus(removeSavedMenu(m.id));
                    setOpenId((x) => (x === m.id ? null : x));
                  }}
                >
                  <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div
                    role="button"
                    tabIndex={0}
                    className="min-w-0 flex-1 cursor-pointer rounded-xl text-start"
                    onClick={() => setOpenId((x) => (x === m.id ? null : m.id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId((x) => (x === m.id ? null : m.id));
                      }
                    }}
                  >
                    <p className="break-words text-base font-extrabold text-[var(--stem)]">
                      {m.title}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-[var(--stem)]/60">
                      {formatTs(m.createdAt)}
                    </p>
                    <p className="mt-2 text-sm text-[var(--stem)]/85">
                      <span className="font-extrabold text-[var(--cherry)]">
                        {Math.round(m.totalCalories)}
                      </span>{" "}
                      קק״ל · חלבון {m.totalProtein.toFixed(0)} · פחמ׳ {m.totalCarbs.toFixed(0)} · שומן{" "}
                      {m.totalFat.toFixed(0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-dict-no-swipe
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[var(--stem)]/55"
                    aria-expanded={openId === m.id}
                    onClick={() => setOpenId((x) => (x === m.id ? null : m.id))}
                  >
                    {openId === m.id ? "▲" : "▼"}
                  </button>
                </div>

                <AnimatePresence>
                  {openId === m.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 border-t border-[var(--border-cherry-soft)]/60 pt-3"
                      data-dict-no-swipe
                    >
                      <div className="space-y-3">
                        {m.meals.map((meal, idx) => (
                          <div key={`${m.id}-meal-${idx}`} className="rounded-xl bg-[var(--cherry-muted)]/35 p-3">
                            <p className="text-sm font-extrabold text-[var(--stem)]">{meal.name}</p>
                            <p className="mt-1 text-xs text-[var(--stem)]/70">
                              {Math.round(meal.calories)} קק״ל · ח {meal.protein.toFixed(0)} · פח {meal.carbs.toFixed(0)} · ש {meal.fat.toFixed(0)}
                            </p>
                            <ul className="mt-2 space-y-1 text-sm text-[var(--stem)]/90">
                              {meal.items.map((it, j) => (
                                <li key={`${m.id}-meal-${idx}-it-${j}`}>
                                  <span className="font-semibold">{it.name}</span>{" "}
                                  <span className="text-xs text-[var(--stem)]/70">({it.portionLabel})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                  </div>
                </DictionarySwipeDeleteRow>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}

