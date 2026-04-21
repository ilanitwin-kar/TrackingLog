"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadProfile, loadDictionary } from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import { addRecipe, loadRecipes, removeRecipe, type SavedRecipe } from "@/lib/recipeStorage";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

type IngredientDraft = {
  id: string;
  name: string;
  gramsText: string;
  caloriesPer100gText: string;
  proteinPer100gText: string;
  carbsPer100gText: string;
  fatPer100gText: string;
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function num(text: string): number {
  const t = text.trim().replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function computeTotals(ingredients: IngredientDraft[]) {
  let grams = 0;
  let kcal = 0;
  let p = 0;
  let c = 0;
  let f = 0;
  for (const row of ingredients) {
    const g = clamp(num(row.gramsText), 0, 50000);
    if (g <= 0) continue;
    grams += g;
    const kcal100 = clamp(num(row.caloriesPer100gText), 0, 2000);
    const p100 = clamp(num(row.proteinPer100gText), 0, 500);
    const c100 = clamp(num(row.carbsPer100gText), 0, 500);
    const f100 = clamp(num(row.fatPer100gText), 0, 500);
    const mul = g / 100;
    kcal += kcal100 * mul;
    p += p100 * mul;
    c += c100 * mul;
    f += f100 * mul;
  }
  return {
    grams,
    calories: Math.round(kcal),
    protein: Math.round(p * 10) / 10,
    carbs: Math.round(c * 10) / 10,
    fat: Math.round(f * 10) / 10,
  };
}

export default function RecipesPage() {
  const gender = loadProfile().gender;
  const [title, setTitle] = useState("");
  const [servingsText, setServingsText] = useState("1");
  const [rows, setRows] = useState<IngredientDraft[]>(() => [
    {
      id: makeId(),
      name: "",
      gramsText: "100",
      caloriesPer100gText: "",
      proteinPer100gText: "",
      carbsPer100gText: "",
      fatPer100gText: "",
    },
  ]);

  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const qRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSaved(loadRecipes());
    function onStorage(e: StorageEvent) {
      if (e.key === "cj_recipes_v1") setSaved(loadRecipes());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const servings = clamp(Math.round(num(servingsText) || 1), 1, 60);
  const totals = useMemo(() => computeTotals(rows), [rows]);
  const perGram = useMemo(() => {
    if (totals.grams <= 0) return null;
    const g = totals.grams;
    return {
      calories: Math.round((totals.calories / g) * 1000) / 1000,
      protein: Math.round((totals.protein / g) * 1000) / 1000,
      carbs: Math.round((totals.carbs / g) * 1000) / 1000,
      fat: Math.round((totals.fat / g) * 1000) / 1000,
    };
  }, [totals]);
  const perServing = useMemo(() => {
    if (servings <= 0) return null;
    return {
      calories: Math.round(totals.calories / servings),
      protein: Math.round((totals.protein / servings) * 10) / 10,
      carbs: Math.round((totals.carbs / servings) * 10) / 10,
      fat: Math.round((totals.fat / servings) * 10) / 10,
    };
  }, [totals, servings]);

  const dictMatches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return loadDictionary()
      .filter((d) => d.food.toLowerCase().includes(t))
      .slice(0, 8)
      .map((d) => ({
        id: d.id,
        name: d.food,
        caloriesPer100g: d.caloriesPer100g ?? 0,
        proteinPer100g: d.proteinPer100g ?? 0,
        carbsPer100g: d.carbsPer100g ?? 0,
        fatPer100g: d.fatPer100g ?? 0,
      }));
  }, [q]);

  function addRowFromDictionary(match: (typeof dictMatches)[number]) {
    setRows((prev) => [
      ...prev,
      {
        id: makeId(),
        name: match.name,
        gramsText: "100",
        caloriesPer100gText: String(Math.round(match.caloriesPer100g)),
        proteinPer100gText: String(match.proteinPer100g),
        carbsPer100gText: String(match.carbsPer100g),
        fatPer100gText: String(match.fatPer100g),
      },
    ]);
    setQ("");
    qRef.current?.focus();
  }

  function addEmptyRow() {
    setRows((prev) => [
      ...prev,
      {
        id: makeId(),
        name: "",
        gramsText: "100",
        caloriesPer100gText: "",
        proteinPer100gText: "",
        carbsPer100gText: "",
        fatPer100gText: "",
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function saveCurrentRecipe() {
    const t = title.trim();
    if (!t) return;
    const clean = rows
      .map((r) => ({
        id: r.id,
        name: r.name.trim(),
        grams: clamp(num(r.gramsText), 0, 50000),
        caloriesPer100g: clamp(num(r.caloriesPer100gText), 0, 2000),
        proteinPer100g: clamp(num(r.proteinPer100gText), 0, 500),
        carbsPer100g: clamp(num(r.carbsPer100gText), 0, 500),
        fatPer100g: clamp(num(r.fatPer100gText), 0, 500),
      }))
      .filter((x) => x.name && x.grams > 0);
    if (clean.length < 1) return;
    const row = addRecipe({
      title: t,
      servings,
      ingredients: clean,
    });
    setSaved((prev) => [row, ...prev]);
  }

  return (
    <div className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`} dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
        >
          חזרה
        </Link>
        <h1 className="panel-title-cherry text-lg">מחשבון מתכונים</h1>
        <div className="w-[4.25rem]" aria-hidden />
      </div>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm font-semibold text-[var(--stem)]/75">
          {gf(
            gender,
            "בני מתכון/ארוחה ביתית לפי מרכיבים ומשקל בגרמים. אפשר למשוך ערכים מהמילון שלך או להזין ידנית. תקבלי סה״כ, ל־1 גרם ולמנה.",
            "בנה מתכון/ארוחה ביתית לפי מרכיבים ומשקל בגרמים. אפשר למשוך ערכים מהמילון שלך או להזין ידנית. תקבל סה״כ, ל־1 גרם ולמנה."
          )}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">שם מתכון</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-luxury-search w-full" placeholder={gf(gender, "למשל: פסטה ברוטב עגבניות", "למשל: פסטה ברוטב עגבניות")} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">מספר מנות</span>
            <input value={servingsText} onChange={(e) => setServingsText(e.target.value)} className="input-luxury-search w-full" inputMode="numeric" />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
          <p className="text-sm font-extrabold text-[var(--stem)]">הוספה מהמילון</p>
          <input
            ref={qRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input-luxury-search mt-2 w-full"
            placeholder={gf(gender, "חפשי מוצר במילון…", "חפש מוצר במילון…")}
          />
          {dictMatches.length > 0 && (
            <ul className="mt-2 space-y-1">
              {dictMatches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-start text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                    onClick={() => addRowFromDictionary(m)}
                  >
                    {m.name}
                    <span className="ms-2 text-xs font-semibold text-[var(--stem)]/60">ל־100ג׳</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">מרכיב</span>
                    <input value={r.name} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} className="input-luxury-search w-full" placeholder={gf(gender, "לדוגמה: ביצה", "לדוגמה: ביצה")} />
                  </label>
                </div>
                <button
                  type="button"
                  className="rounded-xl border-2 border-red-300/70 bg-white px-3 py-2 text-xs font-extrabold text-red-800 hover:bg-red-50"
                  onClick={() => removeRow(r.id)}
                  title="הסר מרכיב"
                >
                  מחק
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">גרמים</span>
                  <input value={r.gramsText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, gramsText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">קק״ל ל־100ג׳</span>
                  <input value={r.caloriesPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, caloriesPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">חלבון ל־100ג׳</span>
                  <input value={r.proteinPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, proteinPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">פחמ׳ ל־100ג׳</span>
                  <input value={r.carbsPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, carbsPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">שומן ל־100ג׳</span>
                  <input value={r.fatPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, fatPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-stem flex-1 rounded-xl py-3 text-sm font-extrabold" onClick={addEmptyRow}>
            הוספת מרכיב
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] disabled:opacity-50"
            disabled={!title.trim() || totals.grams <= 0}
            onClick={saveCurrentRecipe}
          >
            שמירה למתכונים שלי
          </button>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
          <p className="text-sm font-extrabold text-[var(--stem)]">תוצאות</p>
          <p className="mt-2 text-sm text-[var(--stem)]/85">
            סה״כ משקל: <span className="font-extrabold">{Math.round(totals.grams)}</span> ג׳ · סה״כ{" "}
            <span className="font-extrabold text-[var(--cherry)]">{Math.round(totals.calories)}</span> קק״ל
          </p>
          <p className="mt-1 text-xs text-[var(--stem)]/70">
            חלבון {totals.protein} · פחמ׳ {totals.carbs} · שומן {totals.fat}
          </p>
          {perGram && (
            <p className="mt-2 text-xs text-[var(--stem)]/70">
              ל־1 גרם: קק״ל {perGram.calories} · ח {perGram.protein} · פח {perGram.carbs} · ש {perGram.fat}
            </p>
          )}
          {perServing && (
            <p className="mt-2 text-sm font-semibold text-[var(--stem)]/85">
              למנה ({servings} מנות):{" "}
              <span className="font-extrabold text-[var(--cherry)]">{perServing.calories}</span> קק״ל · ח{" "}
              {perServing.protein} · פח {perServing.carbs} · ש {perServing.fat}
            </p>
          )}
        </div>
      </motion.section>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="panel-title-cherry mb-3 text-lg">המתכונים שלי</h2>
        {saved.length === 0 ? (
          <p className="text-sm text-[var(--stem)]/75">
            {gf(gender, "עדיין אין מתכונים שמורים.", "עדיין אין מתכונים שמורים.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {saved.map((r) => (
              <li key={r.id} className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
                <button type="button" className="w-full text-start" onClick={() => setOpenId((x) => (x === r.id ? null : r.id))}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-base font-extrabold text-[var(--stem)]">{r.title}</p>
                      <p className="mt-1 text-xs text-[var(--stem)]/65">
                        מנות: {r.servings} · מרכיבים: {r.ingredients.length}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-[var(--stem)]/55">
                      {openId === r.id ? "▲" : "▼"}
                    </span>
                  </div>
                </button>
                <AnimatePresence>
                  {openId === r.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 border-t border-[var(--border-cherry-soft)]/60 pt-3"
                    >
                      <ul className="space-y-1 text-sm text-[var(--stem)]/90">
                        {r.ingredients.map((it) => (
                          <li key={it.id}>
                            <span className="font-semibold">{it.name}</span> — {Math.round(it.grams)} ג׳ · {Math.round(it.caloriesPer100g)} קק״ל/100ג׳
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="mt-3 w-full rounded-xl border-2 border-red-300/70 bg-white px-3 py-2.5 text-sm font-extrabold text-red-800 shadow-sm transition hover:bg-red-50"
                        onClick={() => {
                          setSaved(removeRecipe(r.id));
                          if (openId === r.id) setOpenId(null);
                        }}
                      >
                        מחיקת מתכון
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}

