"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import {
  addPersonalShoppingItem,
  type ShoppingItem,
  updateShoppingItem,
} from "@/lib/explorerStorage";

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
  const [category, setCategory] = useState("");
  const [calories, setCalories] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editingItem) {
      setName(editingItem.name);
      setBrand(editingItem.brand ?? "");
      const cat = editingItem.category?.trim() ?? "";
      setCategory(cat === "אישי" ? "" : cat);
      setCalories(
        editingItem.calories != null ? String(Math.round(editingItem.calories)) : ""
      );
      setQty(
        editingItem.qty != null && editingItem.qty > 0
          ? String(editingItem.qty)
          : "1"
      );
    } else {
      setName("");
      setBrand("");
      setCategory("");
      setCalories("");
      setQty("1");
    }
  }, [open, editingItem]);

  function buildNutrition() {
    const k100 = parseNum(calories, 0);
    const q = Math.max(0.01, parseNum(qty, 1));
    return { k100, q };
  }

  function applyShoppingPatch(): Partial<ShoppingItem> {
    const { k100, q } = buildNutrition();
    const catTrim = category.trim();
    return {
      name: name.trim(),
      brand: brand.trim() || undefined,
      category: catTrim || "אישי",
      calories: k100,
      qty: q,
    };
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
        category: patch.category ?? "אישי",
        calories: patch.calories ?? 0,
        brand: patch.brand,
        qty: patch.qty,
      });
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
              <label className="block text-sm font-semibold text-[var(--stem)]">
                קטגוריה (אופציונלי)
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                  placeholder="למשל: חלב, ירקות…"
                />
              </label>
              <p className="text-xs font-semibold text-[var(--cherry)]/90">
                קלוריות ל־100 גרם (אופציונלי — לרשימת הקניות)
              </p>
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

            <div className="mt-6">
              <button
                type="button"
                className="btn-stem w-full rounded-xl py-3 text-center text-sm font-bold"
                onClick={handleSaveShoppingOnly}
              >
                {editingItem ? "עדכן" : "הוסף לסל הקניות"}
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
