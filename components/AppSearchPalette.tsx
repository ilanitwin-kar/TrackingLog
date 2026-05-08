"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rankedFuzzySearchByText } from "@/lib/rankedSearch";
import { gf } from "@/lib/hebrewGenderUi";
import { loadProfile, resolveJournalTargetDateKey } from "@/lib/storage";
import { ADMIN_EMAIL } from "@/lib/adminConstants";
import { getFirebaseCurrentUser } from "@/lib/firebaseUserAuth";

type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  keywords: string;
};

function buildSearchItems(): SearchItem[] {
  const base: SearchItem[] = [
    { id: "home", title: "בית", href: "/", keywords: "בית דשבורד מסך ראשי" },
    {
      id: "journal",
      title: "היומן שלי",
      href: (() => {
        const dk = resolveJournalTargetDateKey({ allowFuture: false });
        return `/journal?date=${encodeURIComponent(dk)}`;
      })(),
      keywords: "יומן אכילה ימים רשומות",
    },
    { id: "add-food", title: "הוספת מזון", href: "/add-food", keywords: "הוספה מזון חיפוש רגיל" },
    { id: "add-food-ai", title: "AI ארוחה", href: "/add-food-ai", keywords: "ai ארוחה רישום חופשי קסם" },
    { id: "assistant", title: "עוזר", href: "/assistant", keywords: "עוזר ai שאלות" },
    { id: "dictionary", title: "המילון שלי", href: "/dictionary", keywords: "מילון מוצרים שמורים" },
    { id: "explorer", title: "מגלה מזונות", href: "/explorer", keywords: "מגלה מזונות מוצרים חיפוש מאגר" },
    { id: "shopping", title: "רשימת קניות", href: "/shopping", keywords: "קניות רשימה סופר" },
    { id: "recipes", title: "מחשבון מתכונים", href: "/recipes", keywords: "מתכונים מחשבון מתכון בניית מתכון" },
    { id: "my-recipes", title: "המתכונים שלי", href: "/my-recipes", keywords: "המתכונים שלי מתכונים שמורים ספרייה" },
    { id: "planner", title: "בניית תפריט", href: "/planner", keywords: "תפריט תכנון שבוע" },
    { id: "menus", title: "התפריטים שלי", href: "/menus", keywords: "התפריטים שלי תפריטים שמורים ספרייה" },
    { id: "library", title: "הספרייה שלי", href: "/library", keywords: "ספרייה שלי מתכונים תפריטים קניות" },
    { id: "weight", title: "מעקב משקל", href: "/weight", keywords: "משקל שקילה מעקב" },
    { id: "tdee", title: "פרופיל ויעדים (TDEE)", href: "/tdee", keywords: "פרופיל tdee יעד קלוריות" },
    { id: "report", title: "דוח", href: "/report", keywords: "דוח התקדמות" },
    { id: "daily", title: "סיכום יומי", href: "/daily-summary", keywords: "סיכום יומי" },
    { id: "board", title: "לוח צבירת קלוריות", href: "/calorie-board", keywords: "לוח צבירה קלוריות" },
    { id: "control", title: "מרכז השליטה", href: "/control-center", keywords: "מרכז השליטה עזרה הסברים" },
    { id: "settings", title: "הגדרות", href: "/settings", keywords: "הגדרות" },
  ];
  return base;
}

export function AppSearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const gender = loadProfile().gender;
  const items = useMemo(() => {
    const list = buildSearchItems();
    const fbEmail = (getFirebaseCurrentUser()?.email ?? "").trim().toLowerCase();
    if (fbEmail === ADMIN_EMAIL.toLowerCase()) {
      list.unshift({ id: "admin", title: "ניהול מערכת", href: "/admin", keywords: "אדמין admin ניהול מערכת" });
    }
    return list;
  }, []);

  const results = useMemo(() => {
    const query = q.trim();
    if (query.length < 2) return [] as Array<{ item: SearchItem }>;
    const hits = rankedFuzzySearchByText(items, query, {
      getText: (it) => `${it.title} ${it.subtitle ?? ""} ${it.keywords}`.trim(),
      getKey: (it) => it.id,
      limit: 14,
    });
    return hits.map((h) => ({ item: h.item }));
  }, [items, q]);

  function close() {
    setOpen(false);
    setQ("");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("cj-open-search", onOpen);
    return () => window.removeEventListener("cj-open-search", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const hint = gf(gender, "חיפוש בכל האפליקציה…", "חיפוש בכל האפליקציה…");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[260] flex items-start justify-center bg-black/40 p-3 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          role="presentation"
        >
          <motion.div
            className="w-full max-w-xl overflow-hidden rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white shadow-2xl"
            initial={{ y: 10, scale: 0.99, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.99, opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-labelledby={titleId}
            dir="rtl"
          >
            <div className="border-b border-[var(--border-cherry-soft)]/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p id={titleId} className="text-sm font-extrabold text-[var(--cherry)]">
                  חיפוש
                </p>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border-cherry-soft)] bg-white px-2 py-1 text-[11px] font-bold text-[var(--stem)]/80"
                  onClick={close}
                >
                  Esc
                </button>
              </div>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={hint}
                className="mt-2 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm font-semibold text-[var(--stem)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--focus-ring-outer)]"
              />
              <p className="mt-2 text-[11px] font-semibold text-[var(--text)]/60">
                טיפ: אפשר לפתוח דרך אייקון החיפוש במסך הבית.
              </p>
            </div>

            <div className="max-h-[60vh] overflow-auto p-2">
              {q.trim().length < 2 ? (
                <p className="p-3 text-sm text-[var(--text)]/70">התחילי להקליד כדי לחפש.</p>
              ) : results.length === 0 ? (
                <p className="p-3 text-sm text-[var(--text)]/70">לא נמצאו תוצאות.</p>
              ) : (
                <ul className="space-y-1">
                  {results.map(({ item }) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full rounded-xl px-3 py-2 text-start transition hover:bg-[var(--cherry-muted)]/35"
                        onClick={() => {
                          close();
                          router.push(item.href);
                        }}
                      >
                        <p className="text-sm font-extrabold text-[var(--stem)]">{item.title}</p>
                        {item.subtitle ? (
                          <p className="mt-0.5 text-xs font-semibold text-[var(--text)]/65">{item.subtitle}</p>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

