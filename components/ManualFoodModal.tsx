"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import type { Gender } from "@/lib/tdee";
import { manualFoodIntroParagraph } from "@/lib/hebrewGenderUi";
import { addManualNutritionToToday } from "@/lib/storage";

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function ManualFoodModal({
  open,
  onClose,
  dateKey,
  onSuccess,
  gender = "female",
}: {
  open: boolean;
  onClose: () => void;
  dateKey: string;
  onSuccess: (message: string) => void;
  gender?: Gender;
}) {
  const titleId = useId();
  const [food, setFood] = useState("");
  const [brand, setBrand] = useState("");
  const [kcal100, setKcal100] = useState("");
  const [protein100, setProtein100] = useState("");
  const [fat100, setFat100] = useState("");
  const [carbs100, setCarbs100] = useState("");
  const [unitGrams, setUnitGrams] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFood("");
    setBrand("");
    setKcal100("");
    setProtein100("");
    setFat100("");
    setCarbs100("");
    setUnitGrams("");
    setError(null);
  }, [open]);

  const ug = parseNum(unitGrams);
  const hasUnit = unitGrams.trim() !== "" && ug > 0;
  const c100 = parseNum(kcal100);
  const p100 = parseNum(protein100);
  const f100 = parseNum(fat100);
  const cb100 = parseNum(carbs100);
  const factor = hasUnit ? ug / 100 : 1;
  const previewKcal =
    c100 > 0 ? Math.max(1, Math.round(c100 * factor)) : null;

  function submit() {
    const name = food.trim();
    if (!name) {
      setError("נא למלא שם מוצר");
      return;
    }
    const kcal = parseNum(kcal100);
    if (kcal <= 0) {
      setError("נא להזין קלוריות ל-100 גרם (מספר חיובי)");
      return;
    }
    if (unitGrams.trim() !== "" && ug <= 0) {
      setError("משקל יחידה חייב להיות מספר חיובי");
      return;
    }

    addManualNutritionToToday(
      {
        food: name,
        brand: brand.trim() || undefined,
        caloriesPer100g: kcal,
        proteinPer100g: parseNum(protein100),
        fatPer100g: parseNum(fat100),
        carbsPer100g: parseNum(carbs100),
        unitGrams: hasUnit ? ug : undefined,
      },
      dateKey
    );

    const kcalLabel = "\u05e7\u05e7\u05f4\u05dc";
    const pk = previewKcal ?? Math.max(1, Math.round(kcal));
    const msg = hasUnit
      ? `נוסף ליומן: מנה אחת (${ug} גרם ליחידה) · ${pk} ${kcalLabel}`
      : `נוסף ליומן: 100 גרם · ${pk} ${kcalLabel} · נשמר גם במילון`;
    onSuccess(msg);
    onClose();
  }

  const pScaled = Math.round(p100 * factor * 10) / 10;
  const fScaled = Math.round(f100 * factor * 10) / 10;
  const cScaled = Math.round(cb100 * factor * 10) / 10;
  const kcalLabel = "\u05e7\u05e7\u05f4\u05dc";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[420] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby={titleId}
            className="glass-panel relative max-h-[min(92vh,40rem)] w-full max-w-md overflow-y-auto p-5 shadow-2xl"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id={titleId}
                className="text-lg font-bold leading-tight text-[#333333]"
              >
                הוספת מזון ידנית
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border-2 border-[#fadadd] bg-white px-3 py-1.5 text-sm font-semibold text-[#333333] transition hover:bg-[#fadadd]/40"
              >
                סגירה
              </button>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-[#333333]/85">
              {(() => {
                const t = manualFoodIntroParagraph(gender);
                const m = "משקל יחידה";
                const i = t.indexOf(m);
                if (i < 0) return t;
                return (
                  <>
                    {t.slice(0, i)}
                    <strong>{m}</strong>
                    {t.slice(i + m.length)}
                  </>
                );
              })()}
            </p>

            <div className="space-y-3" dir="rtl">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#333333]">
                  שם המוצר <span className="text-[#b91c1c]">*</span>
                </span>
                <input
                  value={food}
                  onChange={(e) => setFood(e.target.value)}
                  className="input-luxury w-full rounded-xl border-2 border-[#fadadd] px-3 py-2.5 text-[#333333]"
                  placeholder={"למשל: " + "\u05d7\u05d8\u05d9\u05e3 \u05d7\u05dc\u05d1\u05d9"}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#333333]">
                  חברה / מותג (אופציונלי)
                </span>
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="input-luxury w-full rounded-xl border-2 border-[#fadadd] px-3 py-2.5 text-[#333333]"
                  placeholder="למשל: עלמא"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#333333]">
                  קלוריות ל-100 גרם <span className="text-[#b91c1c]">*</span>
                </span>
                <input
                  inputMode="decimal"
                  value={kcal100}
                  onChange={(e) => setKcal100(e.target.value)}
                  className="input-luxury w-full rounded-xl border-2 border-[#fadadd] px-3 py-2.5 text-[#333333]"
                  placeholder="למשל: 480"
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
                    חלבון ל-100ג
                  </span>
                  <input
                    inputMode="decimal"
                    value={protein100}
                    onChange={(e) => setProtein100(e.target.value)}
                    className="w-full rounded-xl border-2 border-[#fadadd] px-2 py-2 text-sm text-[#333333]"
                    placeholder="0"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
                    שומן ל-100ג
                  </span>
                  <input
                    inputMode="decimal"
                    value={fat100}
                    onChange={(e) => setFat100(e.target.value)}
                    className="w-full rounded-xl border-2 border-[#fadadd] px-2 py-2 text-sm text-[#333333]"
                    placeholder="0"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
                    פחמימות ל-100ג
                  </span>
                  <input
                    inputMode="decimal"
                    value={carbs100}
                    onChange={(e) => setCarbs100(e.target.value)}
                    className="w-full rounded-xl border-2 border-[#fadadd] px-2 py-2 text-sm text-[#333333]"
                    placeholder="0"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-[#333333]">
                  משקל יחידה (גרם) — אופציונלי
                </span>
                <input
                  inputMode="decimal"
                  value={unitGrams}
                  onChange={(e) => setUnitGrams(e.target.value)}
                  className="input-luxury w-full rounded-xl border-2 border-[#fadadd] px-3 py-2.5 text-[#333333]"
                  placeholder="ריק = נרשם כ-100 גרם"
                />
              </label>
              {hasUnit && previewKcal != null && (
                <p className="rounded-lg border border-[#fadadd] bg-[#fffafb] px-3 py-2 text-xs font-medium text-[#333333]/90">
                  לפי המשקל שציינת: כ-{previewKcal} {kcalLabel} למנה אחת
                  (יחידה), חלבון {pScaled.toLocaleString("he-IL")} גרם, שומן{" "}
                  {fScaled.toLocaleString("he-IL")} גרם, פחמימות{" "}
                  {cScaled.toLocaleString("he-IL")} גרם
                </p>
              )}
              {error && (
                <p className="text-center text-sm font-medium text-[#b91c1c]">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="btn-gold w-full rounded-xl py-3 text-base font-bold"
                onClick={submit}
              >
                הוספה ליומן ולמילון
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
