"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import {
  addPersonalShoppingItem,
  isPersonalShoppingFood,
  type ShoppingItem,
  updateShoppingItem,
} from "@/lib/explorerStorage";
import {
  patchDictionaryItemNutritionById,
  upsertDictionaryFromShoppingPersonal,
  upsertExplorerFoodInDictionary,
} from "@/lib/storage";

function parseOptionalNum(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, n);
}

function parseNum(s: string, fallback = 0): number {
  const t = s.trim().replace(",", ".");
  if (t === "") return fallback;
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** null = הוספה חדשה */
  editingItem: ShoppingItem | null;
  onSaved: () => void;
};

export function ShoppingItemModal({
  open,
  onClose,
  editingItem,
  onSaved,
}: Props) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editingItem) {
      setName(editingItem.name);
      setBrand(editingItem.brand ?? "");
      setCalories(
        editingItem.calories != null ? String(Math.round(editingItem.calories)) : ""
      );
      setProtein(
        editingItem.protein != null ? String(editingItem.protein) : ""
      );
      setCarbs(editingItem.carbs != null ? String(editingItem.carbs) : "");
      setFat(editingItem.fat != null ? String(editingItem.fat) : "");
      setQty(
        editingItem.qty != null && editingItem.qty > 0
          ? String(editingItem.qty)
          : "1"
      );
    } else {
      setName("");
      setBrand("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setQty("1");
    }
  }, [open, editingItem]);

  function buildNutrition() {
    const k100 = parseNum(calories, 0);
    const p = parseOptionalNum(protein) ?? 0;
    const c = parseOptionalNum(carbs) ?? 0;
    const f = parseOptionalNum(fat) ?? 0;
    const q = Math.max(0.01, parseNum(qty, 1));
    return { k100, p, c, f, q };
  }

  function applyShoppingPatch(): Partial<ShoppingItem> {
    const { k100, p, c, f, q } = buildNutrition();
    return {
      name: name.trim(),
      brand: brand.trim() || undefined,
      calories: k100,
      protein: p || undefined,
      carbs: c || undefined,
      fat: f || undefined,
      qty: q,
    };
  }

  function saveDictionaryForRow(
    shoppingId: string,
    foodIdForLink: string,
    personal: boolean
  ) {
    const { k100, p, c, f } = buildNutrition();
    const foodName = name.trim();
    if (personal) {
      upsertDictionaryFromShoppingPersonal(shoppingId, {
        food: foodName,
        brand: brand.trim() || undefined,
        caloriesPer100g: k100,
        proteinPer100g: p,
        carbsPer100g: c,
        fatPer100g: f,
      });
      return;
    }
    if (foodIdForLink.startsWith("dictionary-meal:")) {
      return;
    }
    if (foodIdForLink.startsWith("dictionary:")) {
      const dictId = foodIdForLink.slice("dictionary:".length);
      patchDictionaryItemNutritionById(dictId, {
        food: foodName,
        brand: brand.trim() || undefined,
        caloriesPer100g: k100,
        proteinPer100g: p,
        carbsPer100g: c,
        fatPer100g: f,
      });
      return;
    }
    upsertExplorerFoodInDictionary({
      id: foodIdForLink,
      name: foodName,
      calories: k100,
      protein: p,
      fat: f,
      carbs: c,
    });
  }

  function handleSaveShoppingOnly() {
    const n = name.trim();
    if (!n) {
      setError("נא למלא שם מוצר.");
      return;
    }
    const patch = applyShoppingPatch();
    if (editingItem) {
      updateShoppingItem(editingItem.id, patch);
    } else {
      addPersonalShoppingItem({
        name: n,
        category: "אישי",
        calories: patch.calories ?? 0,
        brand: patch.brand,
        protein: patch.protein,
        carbs: patch.carbs,
        fat: patch.fat,
        qty: patch.qty,
      });
    }
    onSaved();
    onClose();
  }

  function handleSaveWithDictionary() {
    const n = name.trim();
    if (!n) {
      setError("נא למלא שם מוצר.");
      return;
    }
    const patch = applyShoppingPatch();
    if (editingItem) {
      updateShoppingItem(editingItem.id, patch);
      const personal = isPersonalShoppingFood(editingItem);
      saveDictionaryForRow(editingItem.id, editingItem.foodId, personal);
    } else {
      const row = addPersonalShoppingItem({
        name: n,
        category: "אישי",
        calories: patch.calories ?? 0,
        brand: patch.brand,
        protein: patch.protein,
        carbs: patch.carbs,
        fat: patch.fat,
        qty: patch.qty,
      });
      saveDictionaryForRow(row.id, row.foodId, true);
    }
    onSaved();
    onClose();
  }

  const inputClass =
    "mt-1 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-3 py-2 text-sm text-[var(--stem)] outline-none ring-0 focus:border-[var(--cherry)]";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[240] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="glass-panel max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-[var(--border-cherry-soft)] p-5 shadow-xl"
            dir="rtl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id={titleId}
              className="text-lg font-extrabold text-[var(--cherry)]"
            >
              {editingItem ? "עריכת פריט" : "הוספת פריט אישי"}
            </h2>

            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-[var(--stem)]">
                שם המוצר <span className="text-[var(--cherry)]">*</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm font-semibold text-[var(--stem)]">
                מותג / חברה (אופציונלי)
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <p className="text-xs font-semibold text-[var(--cherry)]/90">
                ערכים תזונתיים ל־100 גרם (אופציונלי)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-[var(--stem)]">
                  קלוריות
                  <input
                    type="text"
                    inputMode="decimal"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--stem)]">
                  חלבון (גרם)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--stem)]">
                  פחמימה (גרם)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-xs font-semibold text-[var(--stem)]">
                  שומן (גרם)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block text-sm font-semibold text-[var(--stem)]">
                כמות
                <input
                  type="text"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            {error ? (
              <p className="mt-3 text-sm font-semibold text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                className="btn-stem flex-1 rounded-xl py-3 text-center text-sm font-bold"
                onClick={handleSaveShoppingOnly}
              >
                {editingItem ? "עדכן את הסל בלבד" : "הוסף לסל הקניות בלבד"}
              </button>
              <button
                type="button"
                className="btn-stem flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)] py-3 text-center text-sm font-bold text-[var(--cherry)] shadow-sm hover:bg-white/90"
                onClick={handleSaveWithDictionary}
              >
                {editingItem
                  ? "עדכן ושמור במילון"
                  : "שמור גם במילון האישי שלי"}
              </button>
            </div>

            <button
              type="button"
              className="mt-3 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/80 py-2.5 text-sm font-semibold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
              onClick={onClose}
            >
              ביטול
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
