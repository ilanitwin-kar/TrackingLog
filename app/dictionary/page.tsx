"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DictionaryItem,
  type FoodUnit,
  type MealPreset,
  type MealPresetComponent,
  applyMealPresetToToday,
  loadDictionary,
  loadMealPresets,
  patchDictionaryItemById,
  removeDictionaryItem,
} from "@/lib/storage";
import {
  addToShopping,
  loadShoppingFoodIds,
} from "@/lib/explorerStorage";
import { IconCart, IconPencil, IconTrash } from "@/components/Icons";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

const UNITS: FoodUnit[] = [
  "גרם",
  "כוס",
  "כף",
  "כפית",
  "מריחה",
  "יחידה",
];

function clampGramQty(q: number): number {
  if (!Number.isFinite(q)) return 100;
  return Math.min(5000, Math.max(1, Math.round(q)));
}

function clampOtherQty(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.min(50, Math.max(0.25, Math.round(q * 100) / 100));
}

function parseQtyForUnit(text: string, unit: FoodUnit): number {
  const n = parseFloat(text.replace(",", "."));
  if (unit === "גרם") return clampGramQty(n);
  return clampOtherQty(n);
}

function parseGramsPerUnitField(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = parseFloat(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5000, Math.max(0.1, Math.round(n * 100) / 100));
}

function servingTotalGrams(
  qty: number,
  unit: FoodUnit,
  gramsPerUnit: number | null
): number | null {
  if (unit === "גרם") return clampGramQty(qty);
  if (unit === "יחידה" && gramsPerUnit != null && gramsPerUnit > 0) {
    return clampGramQty(qty * gramsPerUnit);
  }
  return null;
}

function kcalPer100FromMealComponent(c: MealPresetComponent): number {
  if (c.unit === "גרם" && c.quantity > 0 && c.calories > 0) {
    return Math.round((c.calories / c.quantity) * 100);
  }
  return 0;
}

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
  const [appliedMealId, setAppliedMealId] = useState<string | null>(null);
  const [shopTick, setShopTick] = useState(0);
  const [shopToast, setShopToast] = useState(false);
  const [editTarget, setEditTarget] = useState<DictionaryItem | null>(null);
  const [editFood, setEditFood] = useState("");
  const [editQtyText, setEditQtyText] = useState("1");
  const [editUnit, setEditUnit] = useState<FoodUnit>("גרם");
  const [editGramsPerUnitText, setEditGramsPerUnitText] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const editTitleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setSaved(loadDictionary());
    const m = new Map<string, MealPreset>();
    for (const p of loadMealPresets()) {
      m.set(p.id, p);
    }
    setPresetMap(m);
    setShopTick((x) => x + 1);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const clearSearch = useCallback(() => {
    setRawQ("");
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const filteredSaved = useMemo(
    () => sortSavedByQuery(saved, rawQ),
    [saved, rawQ]
  );

  const cartLookup = useMemo(() => {
    void shopTick;
    return new Set(loadShoppingFoodIds());
  }, [shopTick]);

  useEffect(() => {
    if (!shopToast) return;
    const t = window.setTimeout(() => setShopToast(false), 2200);
    return () => window.clearTimeout(t);
  }, [shopToast]);

  function onCartDictionaryItem(d: DictionaryItem) {
    const k100 =
      d.caloriesPer100g != null && Number.isFinite(d.caloriesPer100g)
        ? Math.round(d.caloriesPer100g)
        : 0;
    const added = addToShopping({
      foodId: `dictionary:${d.id}`,
      name: d.food.trim(),
      category: "מילון אישי",
      calories: k100,
    });
    setShopTick((x) => x + 1);
    if (added) setShopToast(true);
  }

  function onCartMealPreset(preset: MealPreset) {
    let anyNew = false;
    preset.components.forEach((c, i) => {
      const added = addToShopping({
        foodId: `dictionary-meal:${preset.id}:${i}`,
        name: c.food.trim(),
        category: `מרכיב: ${preset.name}`,
        calories: kcalPer100FromMealComponent(c),
      });
      if (added) anyNew = true;
    });
    setShopTick((x) => x + 1);
    if (anyNew) setShopToast(true);
  }

  function mealFullyInCart(preset: MealPreset): boolean {
    if (preset.components.length === 0) return false;
    return preset.components.every((_, i) =>
      cartLookup.has(`dictionary-meal:${preset.id}:${i}`)
    );
  }

  function applyPreset(preset: MealPreset) {
    applyMealPresetToToday(preset);
    setAppliedMealId(preset.id);
    window.setTimeout(() => setAppliedMealId(null), 2500);
  }

  function openEdit(d: DictionaryItem) {
    setEditError(null);
    setEditTarget(d);
    setEditFood(d.food);
    setEditQtyText(String(d.quantity));
    setEditUnit(d.unit);
    setEditGramsPerUnitText(
      d.gramsPerUnit != null && d.gramsPerUnit > 0 ? String(d.gramsPerUnit) : ""
    );
  }

  function closeEdit() {
    setEditTarget(null);
    setEditError(null);
  }

  function saveDictionaryEdit() {
    if (!editTarget) return;
    const name = editFood.trim();
    if (!name) {
      setEditError("הקלידי שם מזון");
      return;
    }
    const qty = parseQtyForUnit(editQtyText, editUnit);
    const gPerU = parseGramsPerUnitField(editGramsPerUnitText);
    const totalG = servingTotalGrams(qty, editUnit, gPerU);

    const patch: Parameters<typeof patchDictionaryItemById>[1] = {
      food: name,
      quantity: qty,
      unit: editUnit,
      lastCalories: editTarget.lastCalories,
    };

    const c100 = editTarget.caloriesPer100g;
    if (c100 != null && Number.isFinite(c100) && totalG != null) {
      patch.lastCalories = Math.max(1, Math.round(c100 * (totalG / 100)));
    }

    if (editUnit === "יחידה") {
      patch.gramsPerUnit = gPerU ?? undefined;
    }

    const next = patchDictionaryItemById(editTarget.id, patch);
    if (next) {
      setSaved(next);
      closeEdit();
    }
  }

  return (
    <div
      className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`}
      dir="rtl"
    >
      <motion.h1
        className="heading-page mb-6 text-center text-3xl md:text-4xl"
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

      <p className="mb-4 rounded-2xl border-2 border-[#FADADD] bg-[#fffafb] px-4 py-3 text-center text-sm text-[#333333]">
        חיפוש במאגר המזונות (מקומי) ב־
        <Link href="/" className="font-bold text-[#a9446a] underline">
          מסך הבית
        </Link>
        .
      </p>

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
              const inCart = isMeal
                ? preset != null && mealFullyInCart(preset)
                : cartLookup.has(`dictionary:${d.id}`);
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
                    <div className="flex shrink-0 gap-1">
                      {!isMeal && (
                        <button
                          type="button"
                          className="btn-icon-luxury p-2"
                          title="עריכה"
                          aria-label={`עריכת «${d.food}»`}
                          onClick={() => openEdit(d)}
                        >
                          <IconPencil className="h-6 w-6" />
                        </button>
                      )}
                      {preset && isMeal ? (
                        <button
                          type="button"
                          className={`btn-icon-luxury p-2 transition-colors ${
                            inCart ? "bg-[#FADADD]/60 ring-2 ring-[#FADADD]" : ""
                          }`}
                          title="רשימת קניות"
                          aria-label="הוספת מרכיבי הארוחה לרשימת קניות"
                          aria-pressed={inCart}
                          onClick={() => onCartMealPreset(preset)}
                        >
                          <IconCart
                            filled={inCart}
                            className={`h-6 w-6 ${
                              inCart ? "text-[#FADADD]" : "text-[#333333]"
                            }`}
                          />
                        </button>
                      ) : !isMeal ? (
                        <button
                          type="button"
                          className={`btn-icon-luxury p-2 transition-colors ${
                            inCart ? "bg-[#FADADD]/60 ring-2 ring-[#FADADD]" : ""
                          }`}
                          title="רשימת קניות"
                          aria-label="הוספה לרשימת קניות"
                          aria-pressed={inCart}
                          onClick={() => onCartDictionaryItem(d)}
                        >
                          <IconCart
                            filled={inCart}
                            className={`h-6 w-6 ${
                              inCart ? "text-[#FADADD]" : "text-[#333333]"
                            }`}
                          />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setSaved(removeDictionaryItem(d.id))}
                        className="btn-icon-luxury btn-icon-luxury-danger shrink-0 p-2"
                        aria-label="הסרה מהמילון"
                      >
                        <IconTrash className="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                  {isMeal && preset && (
                    <button
                      type="button"
                      className="btn-stem mt-3 w-full rounded-xl py-3 text-sm font-semibold"
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

      <AnimatePresence>
        {shopToast && (
          <motion.div
            role="status"
            className="fixed bottom-24 left-1/2 z-[150] -translate-x-1/2 rounded-2xl border-2 border-[#FADADD] bg-white px-5 py-3 text-center text-sm font-semibold text-[#333333] shadow-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            נוסף לרשימה!
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTarget && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeEdit();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              aria-labelledby={editTitleId}
              className="glass-panel w-full max-w-md space-y-4 p-5 shadow-2xl"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={editTitleId}
                  className="panel-title-cherry text-lg"
                >
                  עריכת פריט במילון
                </h2>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-lg border-2 border-[#fadadd] bg-white px-3 py-1.5 text-sm font-semibold text-[#333333] transition hover:bg-[#fadadd]/40"
                >
                  סגירה
                </button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#333333]">
                  שם
                </span>
                <input
                  type="text"
                  value={editFood}
                  onChange={(e) => setEditFood(e.target.value)}
                  className="input-luxury-dark w-full"
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="min-w-[6rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
                    כמות
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editQtyText}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setEditQtyText("");
                        return;
                      }
                      const cleaned = raw
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      const parts = cleaned.split(".");
                      setEditQtyText(
                        parts.length <= 1
                          ? parts[0]
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() =>
                      setEditQtyText((x) => {
                        const n = parseFloat(x.replace(",", "."));
                        if (!Number.isFinite(n)) return "1";
                        return String(parseQtyForUnit(x, editUnit));
                      })
                    }
                    className="input-luxury-dark w-full"
                  />
                </label>
                <label className="min-w-[8rem] flex-[2]">
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
                    יחידה
                  </span>
                  <select
                    value={editUnit}
                    onChange={(e) => {
                      const u = e.target.value as FoodUnit;
                      setEditUnit(u);
                      setEditQtyText((q) =>
                        String(parseQtyForUnit(q, u))
                      );
                      if (u !== "יחידה") setEditGramsPerUnitText("");
                    }}
                    className="select-luxury w-full"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {editUnit === "יחידה" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
                    משקל יחידה (גרם, אופציונלי)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editGramsPerUnitText}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setEditGramsPerUnitText("");
                        return;
                      }
                      const cleaned = raw
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      const parts = cleaned.split(".");
                      setEditGramsPerUnitText(
                        parts.length <= 1
                          ? parts[0]
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() => {
                      const g = parseGramsPerUnitField(editGramsPerUnitText);
                      setEditGramsPerUnitText(
                        g != null ? String(g) : ""
                      );
                    }}
                    placeholder="למשל 120"
                    className="input-luxury-dark w-full"
                  />
                </label>
              )}
              {editTarget.caloriesPer100g != null && (
                <p className="text-xs text-[#333333]/75">
                  יש ערכי קלוריות ל־100 ג׳ — הקק״ל למנה יחושבו מחדש כשהכמות
                  בגרם או ביחידה עם משקל יחידה.
                </p>
              )}
              {editError && (
                <p className="text-sm font-semibold text-[#a94444]">
                  {editError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-stem flex-1 rounded-xl py-3 font-semibold"
                  onClick={saveDictionaryEdit}
                >
                  שמירה
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[#FADADD] bg-white py-3 font-semibold text-[#333333]"
                  onClick={closeEdit}
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
