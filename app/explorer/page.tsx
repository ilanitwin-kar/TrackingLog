"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { IconCart, IconHeart, IconVerified } from "@/components/Icons";
import {
  addToShopping,
  loadFavoriteIds,
  loadShoppingFoodIds,
  toggleFavorite,
} from "@/lib/explorerStorage";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

type SortKey = "caloriesAsc" | "proteinDesc" | "carbsDesc" | "fatAsc";

type FoodItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  category: string;
};

export default function ExplorerPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<SortKey>("caloriesAsc");
  const [category, setCategory] = useState("הכל");
  const [categories, setCategories] = useState<string[]>(["הכל"]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [favTick, setFavTick] = useState(0);
  const [shopTick, setShopTick] = useState(0);
  const [toast, setToast] = useState(false);

  const refreshFavs = useCallback(() => setFavTick((x) => x + 1), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setDebouncedQ("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedQ(trimmed), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedQ,
          sort,
          category,
          page: "1",
          pageSize: "60",
        });
        const res = await fetch(`/api/food-explorer?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as {
          items: FoodItem[];
          total: number;
          categories?: string[];
        };
        if (ac.signal.aborted) return;
        setItems(data.items);
        setTotal(data.total);
        setPage(1);
        if (data.categories?.length) setCategories(data.categories);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setItems([]);
        setTotal(0);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [sort, category, debouncedQ]);

  async function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        q: debouncedQ,
        sort,
        category,
        page: String(next),
        pageSize: "60",
      });
      const res = await fetch(`/api/food-explorer?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: FoodItem[] };
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = items.length < total;

  function onHeart(row: FoodItem) {
    toggleFavorite(row.id);
    refreshFavs();
  }

  function onCart(row: FoodItem) {
    const added = addToShopping({
      foodId: row.id,
      name: row.name,
      category: row.category,
      calories: row.calories,
    });
    setShopTick((x) => x + 1);
    if (added) setToast(true);
  }

  const favLookup = useMemo(() => {
    void favTick;
    return new Set(loadFavoriteIds());
  }, [favTick]);

  const cartLookup = useMemo(() => {
    void shopTick;
    return new Set(loadShoppingFoodIds());
  }, [shopTick]);

  return (
    <div
      className={`mx-auto max-w-lg px-4 pb-28 pt-8 md:pt-12 ${fontFood}`}
      dir="rtl"
    >
      <BackToMenuButton />
      <motion.h1
        className="heading-page mb-6 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        מגלה המזונות
      </motion.h1>

      <motion.div
        className="mb-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-3 text-center text-sm text-[var(--stem)]"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        חיפוש במאגר המקומי — ישירות ממגלה המזונות.
      </motion.div>

      <motion.section
        className="glass-panel mb-4 space-y-3 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
            חיפוש
          </span>
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חפשי מזון…"
            className="input-luxury-search w-full"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <p className="mt-1 text-[11px] text-[var(--cherry)]/60">
            התחילי להקליד (לפחות 2 אותיות)
          </p>
        </label>

        <div>
          <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
            מיון
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["caloriesAsc", "קלוריות: נמוך > גבוה"],
                ["proteinDesc", "חלבון: גבוה > נמוך"],
                ["carbsDesc", "פחמימות: גבוה > נמוך"],
                ["fatAsc", "שומן: נמוך > גבוה"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  sort === key
                    ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                    : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
            קטגוריה
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="select-luxury w-full"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </motion.section>

      <motion.section
        className="glass-panel min-h-[12rem] p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        {loading ? (
          <p className="text-center text-sm text-[var(--cherry)]/80">טוען…</p>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-[var(--cherry)]/80">לא נמצאו פריטים</p>
        ) : (
          <ul className="space-y-2">
            {items.map((row) => {
              const fav = favLookup.has(row.id);
              const inCart = cartLookup.has(row.id);
              return (
                <li
                  key={`${row.id}-${row.name}`}
                  className="flex flex-wrap items-start gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-b from-white to-[var(--welcome-gradient-to)] px-3 py-3"
                  style={{ boxShadow: "var(--explorer-bubble-shadow)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-[var(--stem)]">
                      <span className="inline-flex shrink-0" aria-label="מאומת">
                        <IconVerified className="h-4 w-4 text-[#d4a017]" />
                      </span>
                      <span>{row.name}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--cherry)]/75">
                      {row.category}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--stem)]/95">
                      <span className="font-semibold">קלוריות</span>{" "}
                      {Math.round(row.calories)} (ל־100 גרם) ·{" "}
                      <span className="font-semibold">חלבון</span> {row.protein} ·{" "}
                      <span className="font-semibold">פחמימות</span> {row.carbs} ·{" "}
                      <span className="font-semibold">שומן</span> {row.fat}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={`btn-icon-luxury transition-colors ${
                        fav
                          ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                          : ""
                      }`}
                      title="מועדפים"
                      aria-label="מועדפים"
                      aria-pressed={fav}
                      onClick={() => onHeart(row)}
                    >
                      <IconHeart
                        filled={fav}
                        className={`h-5 w-5 ${
                          fav ? "text-[var(--cherry)]" : "text-[var(--stem)]"
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      className={`btn-icon-luxury transition-colors ${
                        inCart
                          ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                          : ""
                      }`}
                      title="רשימת קניות"
                      aria-label="הוספה לרשימת קניות"
                      aria-pressed={inCart}
                      onClick={() => onCart(row)}
                    >
                      <IconCart
                        filled={inCart}
                        className={`h-5 w-5 ${
                          inCart ? "text-[var(--cherry)]" : "text-[var(--stem)]"
                        }`}
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="btn-stem rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "טוען…" : "עוד תוצאות"}
            </button>
          </div>
        )}
      </motion.section>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="fixed bottom-24 left-1/2 z-[150] -translate-x-1/2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-5 py-3 text-center text-sm font-semibold text-[var(--cherry)] shadow-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            נוסף לרשימה!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
