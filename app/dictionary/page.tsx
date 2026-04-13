"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DictionaryItem,
  type MealPreset,
  applyMealPresetToToday,
  loadDictionary,
  loadMealPresets,
  removeDictionaryItem,
  upsertDictionaryFromScan,
} from "@/lib/storage";
import { IconTrash, IconVerified } from "@/components/Icons";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

type FoodItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  category: string;
};

function sortSavedByQuery(items: DictionaryItem[], query: string): DictionaryItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return items;
  const p: DictionaryItem[] = [];
  const c: DictionaryItem[] = [];
  for (const d of items) {
    const f = d.food.toLowerCase();
    if (f.startsWith(q)) p.push(d);
    else if (f.includes(q)) c.push(d);
  }
  return [...p, ...c];
}

export default function DictionaryPage() {
  const [saved, setSaved] = useState<DictionaryItem[]>([]);
  const [presetMap, setPresetMap] = useState<Map<string, MealPreset>>(
    () => new Map()
  );
  const [rawQ, setRawQ] = useState("");
  const [dbQ, setDbQ] = useState("");
  const [debouncedDbQ, setDebouncedDbQ] = useState("");
  const [dbItems, setDbItems] = useState<FoodItem[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [appliedMealId, setAppliedMealId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setSaved(loadDictionary());
    const m = new Map<string, MealPreset>();
    for (const p of loadMealPresets()) {
      m.set(p.id, p);
    }
    setPresetMap(m);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    const trimmed = dbQ.trim();
    if (trimmed.length < 2) {
      setDebouncedDbQ("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedDbQ(trimmed), 250);
    return () => window.clearTimeout(t);
  }, [dbQ]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      if (debouncedDbQ.length < 2) {
        setDbItems([]);
        setDbLoading(false);
        return;
      }
      setDbLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedDbQ,
          sort: "proteinDesc",
          category: "הכל",
          page: "1",
          pageSize: "12",
        });
        const res = await fetch(`/api/food-explorer?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { items: FoodItem[] };
        if (ac.signal.aborted) return;
        setDbItems(data.items ?? []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setDbItems([]);
      } finally {
        if (!ac.signal.aborted) setDbLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedDbQ]);

  const clearSearch = useCallback(() => {
    setRawQ("");
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const addDbToDictionary = useCallback(
    (row: FoodItem) => {
      const next = upsertDictionaryFromScan({
        food: row.name,
        quantity: 100,
        unit: "גרם",
        lastCalories: Math.round(row.calories),
        caloriesPer100g: row.calories,
        proteinPer100g: row.protein,
        carbsPer100g: row.carbs,
        fatPer100g: row.fat,
      });
      setSaved(next);
    },
    []
  );

  const filteredSaved = useMemo(
    () => sortSavedByQuery(saved, rawQ),
    [saved, rawQ]
  );

  function applyPreset(preset: MealPreset) {
    applyMealPresetToToday(preset);
    setAppliedMealId(preset.id);
    window.setTimeout(() => setAppliedMealId(null), 2500);
  }

  return (
    <div
      className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`}
      dir="rtl"
    >
      <motion.h1
        className="mb-6 text-center text-3xl font-extrabold text-[#333333] md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        מילון מזונות
      </motion.h1>

      {appliedMealId && (
        <p className="mb-4 rounded-xl border border-[#FADADD] bg-[#fffafb] py-2 text-center text-sm font-medium text-[#333333]">
          נוסף ליומן היום
        </p>
      )}

      <motion.section
        className="glass-panel mb-4 space-y-3 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="rounded-2xl border-2 border-[#FADADD] bg-[#fffafb] px-4 py-3 text-center text-sm text-[#333333]">
          חיפוש במאגר המקומי זמין גם כאן, וגם ב־{" "}
          <Link href="/" className="font-bold text-[#a9446a] underline">
            מסך הבית
          </Link>
          .
        </p>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[#333333]">
            חיפוש במאגר המקומי
          </span>
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={dbQ}
            onChange={(e) => setDbQ(e.target.value)}
            placeholder="חפשי מזון…"
            className="input-luxury-search w-full"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <p className="mt-1 text-[11px] text-[#333333]/60">
            התחילי להקליד (לפחות 2 אותיות)
          </p>
        </label>

        <div className="min-h-[3rem]">
          {dbLoading ? (
            <p className="text-center text-sm text-[#333333]/80">טוען…</p>
          ) : debouncedDbQ.length < 2 ? (
            <p className="text-center text-xs text-[#333333]/60">
              חיפוש יופיע כאן
            </p>
          ) : dbItems.length === 0 ? (
            <p className="text-center text-sm text-[#333333]/80">
              לא נמצאו פריטים
            </p>
          ) : (
            <ul className="space-y-2">
              {dbItems.map((row) => (
                <li
                  key={`${row.id}-${row.name}`}
                  className="flex flex-wrap items-start gap-2 rounded-2xl border-2 border-[#FADADD] bg-gradient-to-b from-white to-[#fffafd] px-3 py-3 shadow-[inset_0_2px_6px_rgba(255,255,255,0.95),0_4px_0_rgba(0,0,0,0.06),0_10px_28px_rgba(250,218,221,0.42)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-[#333333]">
                      <span className="inline-flex shrink-0" aria-label="מאומת">
                        <IconVerified className="h-4 w-4 text-[#d4a017]" />
                      </span>
                      <span>{row.name}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#333333]/75">
                      {row.category}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[#333333]/95">
                      <span className="font-semibold">קלוריות</span>{" "}
                      {Math.round(row.calories)} (ל־100 גרם) ·{" "}
                      <span className="font-semibold">חלבון</span> {row.protein} ·{" "}
                      <span className="font-semibold">פחמימות</span> {row.carbs} ·{" "}
                      <span className="font-semibold">שומן</span> {row.fat}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-gold shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
                    onClick={() => addDbToDictionary(row)}
                    aria-label="שמירה למילון"
                    title="שמירה למילון"
                  >
                    שמירה למילון
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.section>

      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-semibold text-[#333333]">
          סינון הרשומות השמורות
        </span>
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={rawQ}
            onChange={(e) => setRawQ(e.target.value)}
            placeholder="הקלידי לסינון הרשימה…"
            className="input-luxury-search w-full ps-11 pe-11"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {rawQ.length > 0 && (
            <button
              type="button"
              className="absolute start-2 top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#FADADD] bg-white text-lg font-bold leading-none text-[#333333]/70 shadow-sm transition hover:bg-[#fffafb] hover:text-[#333333] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#FADADD]"
              aria-label="ניקוי חיפוש"
              title="ניקוי"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => clearSearch()}
            >
              ×
            </button>
          )}
        </div>
      </label>

      <motion.section
        className="glass-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="mb-3 text-lg font-bold text-[#333333]">המילון שלי</h2>
        {filteredSaved.length === 0 ? (
          <p className="text-[#333333]/85">
            עדיין ריק או אין התאמה לחיפוש. פריטים מהיומן, ארוחות שמורות מבית
            וסריקות יופיעו כאן.
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredSaved.map((d) => {
              const preset =
                d.mealPresetId != null
                  ? presetMap.get(d.mealPresetId)
                  : undefined;
              const isMeal = Boolean(d.mealPresetId && preset);
              return (
                <motion.li
                  key={d.id}
                  layout
                  className="rounded-xl border-2 border-[#FADADD] bg-white px-3 py-3"
                  style={{ boxShadow: "0 2px 12px rgba(250,218,221,0.35)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-[#333333]">
                        {d.food}
                        {isMeal && (
                          <span className="rounded-md bg-[#FADADD]/60 px-2 py-0.5 text-xs font-semibold text-[#333333]">
                            ארוחה שמורה
                          </span>
                        )}
                      </p>
                      {!isMeal && (
                        <p className="mt-1 text-sm text-[#333333]/80">
                          {d.quantity} {d.unit}
                          {d.lastCalories != null
                            ? ` · קלוריות (אחרון ביומן): ${d.lastCalories}`
                            : ""}
                        </p>
                      )}
                      {isMeal && preset && (
                        <ul className="mt-2 space-y-1 text-sm text-[#333333]/90">
                          {preset.components.map((c, i) => (
                            <li key={`${d.id}-c-${i}`}>
                              {c.food} — {c.quantity} {c.unit} ({c.calories}{" "}
                              קק״ל)
                            </li>
                          ))}
                        </ul>
                      )}
                      {d.caloriesPer100g != null && !isMeal && (
                        <p className="mt-1 text-xs text-[#333333]/70">
                          ל־100 גרם: {Math.round(d.caloriesPer100g)} קק״ל
                          {d.proteinPer100g != null &&
                            d.carbsPer100g != null &&
                            d.fatPer100g != null && (
                              <>
                                {" "}
                                · ח {d.proteinPer100g.toFixed(1)} · פחם{" "}
                                {d.carbsPer100g.toFixed(1)} · שומן{" "}
                                {d.fatPer100g.toFixed(1)} ג׳
                              </>
                            )}
                          {d.barcode ? ` · ברקוד ${d.barcode}` : ""}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSaved(removeDictionaryItem(d.id))}
                      className="btn-icon-luxury btn-icon-luxury-danger shrink-0 p-2"
                      aria-label="הסרה מהמילון"
                    >
                      <IconTrash className="h-6 w-6" />
                    </button>
                  </div>
                  {isMeal && preset && (
                    <button
                      type="button"
                      className="btn-gold mt-3 w-full rounded-xl py-3 text-sm font-semibold"
                      onClick={() => applyPreset(preset)}
                    >
                      הוספה ליומן היום
                    </button>
                  )}
                  {d.mealPresetId && !preset && (
                    <p className="mt-2 text-xs text-[#8b2e2e]">
                      לא נמצאה ארוחה — ניתן להסיר את הרשומה.
                    </p>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
