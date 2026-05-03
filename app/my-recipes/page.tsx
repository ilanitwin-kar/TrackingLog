"use client";

import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { gf } from "@/lib/hebrewGenderUi";
import {
  getEntriesForDate,
  loadDictionary,
  loadProfile,
  saveDayLogEntries,
  saveDictionary,
  type DictionaryItem,
  type LogEntry,
} from "@/lib/storage";
import { getTodayKey } from "@/lib/dateKey";
import { formatRecipeMacroAbbrev } from "@/lib/recipeMacroFormat";
import { loadRecipes, removeRecipe, type RecipeIngredient, type SavedRecipe } from "@/lib/recipeStorage";
import { loadRecipesFromCloud } from "@/lib/recipeCloud";
import { RecipeShelfNav } from "@/components/RecipeShelfNav";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function num(text: string): number {
  const t = text.trim().replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function computeTotalsFromIngredients(ingredients: RecipeIngredient[]) {
  let grams = 0;
  let kcal = 0;
  let p = 0;
  let c = 0;
  let f = 0;
  for (const row of ingredients) {
    const g = clamp(Number(row.grams) || 0, 0, 500000);
    if (g <= 0) continue;
    grams += g;
    const mul = g / 100;
    kcal += clamp(Number(row.caloriesPer100g) || 0, 0, 2000) * mul;
    p += clamp(Number(row.proteinPer100g) || 0, 0, 500) * mul;
    c += clamp(Number(row.carbsPer100g) || 0, 0, 500) * mul;
    f += clamp(Number(row.fatPer100g) || 0, 0, 500) * mul;
  }
  return {
    grams,
    calories: Math.round(kcal),
    protein: Math.round(p * 10) / 10,
    carbs: Math.round(c * 10) / 10,
    fat: Math.round(f * 10) / 10,
  };
}

function getRecipeFinalWeightG(r: SavedRecipe): number {
  const rawGrams = computeTotalsFromIngredients(r.ingredients).grams;
  const fw = typeof r.finalCookedWeightG === "number" && Number.isFinite(r.finalCookedWeightG) && r.finalCookedWeightG > 0
    ? r.finalCookedWeightG
    : rawGrams;
  return Math.max(1, Math.round(fw));
}

function getRecipeTotals(r: SavedRecipe) {
  return r.totals ?? computeTotalsFromIngredients(r.ingredients);
}

function per100FromRecipe(r: SavedRecipe) {
  const totals = getRecipeTotals(r);
  const finalW = getRecipeFinalWeightG(r);
  const mul = 100 / finalW;
  return {
    calories: Math.round(totals.calories * mul),
    protein: Math.round(totals.protein * mul * 10) / 10,
    carbs: Math.round(totals.carbs * mul * 10) / 10,
    fat: Math.round(totals.fat * mul * 10) / 10,
  };
}

function portionFromRecipe(r: SavedRecipe, grams: number) {
  const per100 = per100FromRecipe(r);
  const g = clamp(grams, 0, 200000);
  if (g <= 0) return null;
  const mul = g / 100;
  return {
    grams: Math.round(g),
    calories: Math.round(per100.calories * mul),
    protein: Math.round(per100.protein * mul * 10) / 10,
    carbs: Math.round(per100.carbs * mul * 10) / 10,
    fat: Math.round(per100.fat * mul * 10) / 10,
  };
}

function ingredientLineKcalFromIng(ing: RecipeIngredient): number {
  const g = clamp(Number(ing.grams) || 0, 0, 500000);
  const k100 = clamp(Number(ing.caloriesPer100g) || 0, 0, 2000);
  return Math.round(k100 * (g / 100));
}

const recipeSectionTitleClass =
  "mb-2 w-fit border-b-2 border-[var(--cherry)] pb-1 text-lg font-extrabold tracking-tight text-black sm:text-xl";

function upsertRecipeToDictionary(recipe: SavedRecipe) {
  const per100 = per100FromRecipe(recipe);
  const src = `recipe:${recipe.id}`;
  const rest = loadDictionary().filter((d) => d.source !== src);
  const row: DictionaryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    food: `מתכון: ${recipe.title}`.slice(0, 140),
    quantity: 100,
    unit: "גרם",
    lastCalories: Math.max(0, per100.calories),
    caloriesPer100g: per100.calories,
    proteinPer100g: per100.protein,
    carbsPer100g: per100.carbs,
    fatPer100g: per100.fat,
    source: src,
  };
  saveDictionary([row, ...rest]);
}

function addRecipePortionToToday(recipe: SavedRecipe, grams: number) {
  const p = portionFromRecipe(recipe, grams);
  if (!p) return false;
  const dateKey = getTodayKey();
  const existing = getEntriesForDate(dateKey);
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    food: `מתכון: ${recipe.title}`.slice(0, 140),
    calories: Math.max(1, p.calories),
    quantity: p.grams,
    unit: "גרם",
    createdAt: new Date().toISOString(),
    verified: false,
    proteinG: p.protein,
    carbsG: p.carbs,
    fatG: p.fat,
  };
  saveDayLogEntries(dateKey, [entry, ...existing]);
  return true;
}

function makeShareText(recipe: SavedRecipe, portionGrams?: number) {
  const totals = getRecipeTotals(recipe);
  const finalW = getRecipeFinalWeightG(recipe);
  const per100 = per100FromRecipe(recipe);
  const portion = portionGrams != null ? portionFromRecipe(recipe, portionGrams) : null;
  const lines: string[] = [];
  lines.push(`מתכון: ${recipe.title}`);
  lines.push(`משקל סופי: ${finalW}g`);
  lines.push(`סה״כ: ${formatRecipeMacroAbbrev(totals.calories, totals.protein, totals.carbs, totals.fat)}`);
  lines.push(`ל־100 ג׳: ${formatRecipeMacroAbbrev(per100.calories, per100.protein, per100.carbs, per100.fat)}`);
  if (portion) {
    lines.push(
      `מנה (${portion.grams}g): ${formatRecipeMacroAbbrev(portion.calories, portion.protein, portion.carbs, portion.fat)}`
    );
  }
  lines.push("");
  lines.push("מרכיבים:");
  for (const ing of recipe.ingredients) {
    const g = Math.round(ing.grams);
    const k = ingredientLineKcalFromIng(ing);
    lines.push(`- ${ing.name} — ${g} ג׳ - ${k} קל׳`);
  }
  return lines.join("\n");
}

export default function MyRecipesPage() {
  const gender = loadProfile().gender;
  void useSearchParams();
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [portionById, setPortionById] = useState<Record<string, string>>({});
  const [shareId, setShareId] = useState<string | null>(null);
  const [recipeRowMenuId, setRecipeRowMenuId] = useState<string | null>(null);
  const shareTextRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (recipeRowMenuId == null) return;
    const onDocPointer = (e: PointerEvent) => {
      const raw = e.target;
      if (!(raw instanceof Node)) return;
      const el = raw instanceof Element ? raw : raw.parentElement;
      if (el?.closest("[data-recipe-menu-wrap]")) return;
      setRecipeRowMenuId(null);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [recipeRowMenuId]);

  useEffect(() => {
    setRecipeRowMenuId(null);
  }, [openId]);

  useEffect(() => {
    setRecipes(loadRecipes());
    void (async () => {
      try {
        const cloud = await loadRecipesFromCloud();
        if (cloud.length > 0) {
          const byId = new Map<string, SavedRecipe>();
          for (const r of [...cloud, ...loadRecipes()]) byId.set(r.id, r);
          setRecipes(Array.from(byId.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const openPortionText = openId ? portionById[openId] ?? "" : "";
  const openPortionG = clamp(num(openPortionText), 0, 200000);

  // back is handled globally by the fixed header

  return (
    <div className={`mx-auto max-w-lg px-4 pt-2 pb-28 md:pt-3 md:pb-12 ${fontFood}`} dir="rtl">
      <RecipeShelfNav active="library" />

      <motion.section className="pt-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {recipes.length === 0 ? (
          <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
            <p className="text-sm font-semibold text-[var(--stem)]/75">אין עדיין מתכונים שמורים.</p>
            <Link href="/recipes" className="mt-3 inline-block rounded-xl bg-[var(--stem)] px-4 py-2.5 text-sm font-extrabold text-white">
              בואי לבנות מתכון
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {recipes.map((r) => {
              const totals = getRecipeTotals(r);
              const finalW = getRecipeFinalWeightG(r);
              const per100 = per100FromRecipe(r);
              const isOpen = openId === r.id;
              return (
                <li key={r.id}>
                  <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      role="button"
                      tabIndex={0}
                      className="min-w-0 flex-1 cursor-pointer rounded-xl text-start"
                      onClick={() => setOpenId((x) => (x === r.id ? null : r.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId((x) => (x === r.id ? null : r.id));
                        }
                      }}
                    >
                      <p className="break-words text-lg font-extrabold leading-tight text-[var(--cherry)] sm:text-xl">
                        {r.title}
                      </p>
                      <p className="mt-2 text-sm font-normal leading-snug text-black sm:text-base">
                        ל־100 ג׳: {formatRecipeMacroAbbrev(per100.calories, per100.protein, per100.carbs, per100.fat)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-0.5" data-recipe-menu-wrap={r.id}>
                      <div className="relative">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                          aria-haspopup="menu"
                          aria-expanded={recipeRowMenuId === r.id}
                          aria-label="תפריט פעולות על המתכון"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecipeRowMenuId((x) => (x === r.id ? null : r.id));
                          }}
                        >
                          <MoreVertical className="h-5 w-5" strokeWidth={2.2} />
                        </button>
                        {recipeRowMenuId === r.id ? (
                          <div
                            role="menu"
                            className="absolute end-0 top-full z-30 mt-1 min-w-[11.5rem] rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white py-1 shadow-lg"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full px-3 py-2.5 text-start text-sm font-extrabold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                              onClick={() => {
                                upsertRecipeToDictionary(r);
                                window.alert(gf(gender, "נשמר במילון האישי.", "נשמר במילון האישי."));
                                setRecipeRowMenuId(null);
                              }}
                            >
                              שמור במילון
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full px-3 py-2.5 text-start text-sm font-extrabold text-[var(--cherry)] transition hover:bg-[var(--cherry-muted)]"
                              onClick={() => {
                                setShareId(r.id);
                                setRecipeRowMenuId(null);
                              }}
                            >
                              שתף מתכון (PDF/ווטסאפ/מייל)
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full px-3 py-2.5 text-start text-sm font-extrabold text-red-800 transition hover:bg-red-50"
                              onClick={() => {
                                setRecipes((prev) => prev.filter((x) => x.id !== r.id));
                                setOpenId((x) => (x === r.id ? null : x));
                                setShareId((x) => (x === r.id ? null : x));
                                removeRecipe(r.id);
                                setRecipeRowMenuId(null);
                              }}
                            >
                              מחיקת מתכון
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[var(--stem)]/55"
                        aria-expanded={isOpen}
                        onClick={() => setOpenId((x) => (x === r.id ? null : r.id))}
                      >
                        {isOpen ? "▲" : "▼"}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="mt-3 border-t border-[var(--border-cherry-soft)]/60 pt-3"
                      >
                        <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-[color-mix(in_srgb,var(--accent)_8%,white)] p-3">
                          <p className={recipeSectionTitleClass}>מרכיבים:</p>
                          <ul className="mt-2 space-y-1.5">
                            {r.ingredients.map((ing) => {
                              const lineK = ingredientLineKcalFromIng(ing);
                              const g = Math.round(ing.grams);
                              return (
                                <li key={ing.id} className="text-base leading-relaxed">
                                  <span className="font-semibold text-[var(--stem-deep)]">{ing.name}</span>
                                  <span className="font-extrabold text-black">
                                    {" "}
                                    · {g} ג׳ - {lineK} קל׳
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        <div className="mt-3 rounded-xl border border-[var(--border-cherry-soft)] bg-white p-3">
                          <p className={recipeSectionTitleClass}>סה״כ ערכים לכל המנה:</p>
                          <p className="mt-1 text-sm font-normal leading-snug text-black sm:text-base">
                            {formatRecipeMacroAbbrev(totals.calories, totals.protein, totals.carbs, totals.fat)}
                          </p>
                          <div
                            className="my-3 border-t-2 border-[var(--stem)]"
                            aria-hidden
                          />
                          <p className="text-lg font-semibold leading-snug text-black sm:text-xl">
                            משקל לחישוב: {finalW} ג׳ · {r.ingredients.length} מרכיבים
                          </p>
                        </div>

                        <div className="mt-2 rounded-xl border border-[var(--border-cherry-soft)] bg-[color-mix(in_srgb,var(--accent)_12%,white)] p-2.5">
                          <p className="mb-2 border-b-2 border-black pb-1 text-base font-extrabold text-black sm:text-lg">
                            מחשבון מנה
                          </p>
                          <label className="block">
                            <input
                              value={portionById[r.id] ?? ""}
                              onChange={(e) => setPortionById((p) => ({ ...p, [r.id]: e.target.value }))}
                              className="input-luxury-search w-full py-2 text-sm"
                              inputMode="numeric"
                              placeholder={gf(
                                gender,
                                "הזיני כמות בגרמים (למשל 180)",
                                "הזן כמות בגרמים (למשל 180)"
                              )}
                              aria-label={gf(gender, "הזנת כמות בגרמים למנה", "הזנת כמות בגרמים למנה")}
                            />
                          </label>
                          {openId === r.id && openPortionG > 0 ? (() => {
                            const pt = portionFromRecipe(r, openPortionG);
                            if (!pt) return null;
                            return (
                              <p className="mt-1.5 text-xs font-normal leading-snug text-black">
                                מנה ({pt.grams} ג׳):{" "}
                                {formatRecipeMacroAbbrev(pt.calories, pt.protein, pt.carbs, pt.fat)}
                              </p>
                            );
                          })() : null}
                        </div>

                        <button
                          type="button"
                          className="btn-add-journal mt-3 w-full rounded-2xl px-4 py-3.5 transition active:scale-[0.99] sm:text-xl sm:py-4"
                          disabled={!(portionById[r.id] && clamp(num(portionById[r.id] ?? ""), 0, 200000) > 0)}
                          onClick={() => {
                            const g = clamp(num(portionById[r.id] ?? ""), 0, 200000);
                            if (g <= 0) {
                              window.alert(
                                gf(
                                  gender,
                                  "יש להזין גרם למנה בשדה מחשבון המנה.",
                                  "יש להזין גרם למנה בשדה מחשבון המנה."
                                )
                              );
                              return;
                            }
                            const ok = addRecipePortionToToday(r, g);
                            if (ok) window.alert(gf(gender, "נוסף ליומן היום.", "נוסף ליומן היום."));
                          }}
                        >
                          הוסף ליומן
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>

      <AnimatePresence>
        {shareId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
            onClick={() => setShareId(null)}
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-lg rounded-3xl border-2 border-[var(--border-cherry-soft)] bg-white p-4"
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              {(() => {
                const r = recipes.find((x) => x.id === shareId) ?? null;
                if (!r) return null;
                const portionG = clamp(num(portionById[r.id] ?? ""), 0, 200000);
                const text = makeShareText(r, portionG > 0 ? portionG : undefined);
                const encoded = encodeURIComponent(text);
                return (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-extrabold text-[var(--stem)]">שיתוף מתכון</p>
                      <button
                        type="button"
                        className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                        onClick={() => setShareId(null)}
                      >
                        סגור
                      </button>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[var(--stem)]/70">
                      ל‑PDF: לחצי “הדפסה” ואז “Save as PDF”. בווטסאפ/מייל נשלח טקסט מסודר (בלי קובץ מצורף אוטומטית).
                    </p>
                    <textarea
                      ref={shareTextRef}
                      className="mt-3 h-40 w-full rounded-2xl border border-[var(--border-cherry-soft)] bg-white p-3 text-xs text-[var(--stem)]"
                      value={text}
                      readOnly
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-xl bg-[var(--stem)] px-4 py-3 text-xs font-extrabold text-white"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(text);
                            window.alert("הועתק.");
                          } catch {
                            shareTextRef.current?.select();
                            document.execCommand("copy");
                            window.alert("הועתק.");
                          }
                        }}
                      >
                        העתקה
                      </button>
                      <a
                        className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-center text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                        href={`mailto:?subject=${encodeURIComponent(`מתכון: ${r.title}`)}&body=${encoded}`}
                      >
                        מייל
                      </a>
                      <a
                        className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-center text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                        href={`https://wa.me/?text=${encoded}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ווטסאפ
                      </a>
                      <button
                        type="button"
                        className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-xs font-extrabold text-[var(--cherry)] hover:bg-[var(--cherry-muted)]"
                        onClick={() => window.print()}
                      >
                        הדפסה / PDF
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

