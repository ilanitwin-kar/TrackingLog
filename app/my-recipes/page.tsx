"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackSmartButton } from "@/components/BackSmartButton";
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
import { loadRecipes, removeRecipe, type RecipeIngredient, type SavedRecipe } from "@/lib/recipeStorage";
import { loadRecipesFromCloud } from "@/lib/recipeCloud";

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
  lines.push(`סה״כ: ${totals.calories} קק״ל | ח ${totals.protein} | פח ${totals.carbs} | ש ${totals.fat}`);
  lines.push(`ל־100ג׳: ${per100.calories} קק״ל | ח ${per100.protein} | פח ${per100.carbs} | ש ${per100.fat}`);
  if (portion) {
    lines.push(`מנה (${portion.grams}g): ${portion.calories} קק״ל | ח ${portion.protein} | פח ${portion.carbs} | ש ${portion.fat}`);
  }
  lines.push("");
  lines.push("מרכיבים:");
  for (const ing of recipe.ingredients) {
    lines.push(`- ${ing.name} — ${Math.round(ing.grams)}g`);
  }
  return lines.join("\n");
}

export default function MyRecipesPage() {
  const gender = loadProfile().gender;
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [portionById, setPortionById] = useState<Record<string, string>>({});
  const [shareId, setShareId] = useState<string | null>(null);
  const shareTextRef = useRef<HTMLTextAreaElement | null>(null);

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

  const backHref = (() => {
    const date = searchParams.get("date");
    const meal = searchParams.get("meal");
    const from = searchParams.get("from");
    if (from === "library") return "/library";
    if (date && meal && from) {
      return `/add-food?from=${encodeURIComponent(from)}&date=${encodeURIComponent(date)}&meal=${encodeURIComponent(meal)}`;
    }
    return "/";
  })();

  return (
    <div className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`} dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <BackSmartButton
          fallbackHref={backHref}
          className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
        >
          חזרה
        </BackSmartButton>
        <h1 className="panel-title-cherry text-lg">המתכונים שלי</h1>
        <Link
          href="/recipes"
          className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
        >
          מחשבון
        </Link>
      </div>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
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
                <li key={r.id} className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
                  <button type="button" className="w-full text-start" onClick={() => setOpenId((x) => (x === r.id ? null : r.id))}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-base font-extrabold text-[var(--stem)]">{r.title}</p>
                        <p className="mt-1 text-xs text-[var(--stem)]/65">
                          מרכיבים: {r.ingredients.length} · משקל סופי: {finalW}g · ל־100ג׳ {per100.calories} קק״ל
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-[var(--stem)]/55">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.15 }}
                        className="mt-3 border-t border-[var(--border-cherry-soft)]/60 pt-3"
                      >
                        <p className="text-sm font-semibold text-[var(--stem)]/85">
                          סה״כ: <span className="font-extrabold text-[var(--cherry)]">{totals.calories}</span> קק״ל · ח {totals.protein} · פח {totals.carbs} · ש {totals.fat}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[var(--stem)]/60">
                          ל־100ג׳: <span className="font-extrabold text-[var(--cherry)]">{per100.calories}</span> קק״ל · ח {per100.protein} · פח {per100.carbs} · ש {per100.fat}
                        </p>

                        <div className="mt-3 rounded-2xl border border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/40 p-3">
                          <p className="text-sm font-extrabold text-[var(--stem)]">מחשבון מנה</p>
                          <label className="mt-2 block">
                            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">גרם למנה</span>
                            <input
                              value={portionById[r.id] ?? ""}
                              onChange={(e) => setPortionById((p) => ({ ...p, [r.id]: e.target.value }))}
                              className="input-luxury-search w-full"
                              inputMode="numeric"
                              placeholder="למשל: 180"
                            />
                          </label>
                          {openId === r.id && openPortionG > 0 && (
                            <p className="mt-2 text-sm font-semibold text-[var(--stem)]/85">
                              מנה ({Math.round(openPortionG)}g):{" "}
                              <span className="font-extrabold text-[var(--cherry)]">{portionFromRecipe(r, openPortionG)?.calories ?? 0}</span> קק״ל
                              {" · "}ח {portionFromRecipe(r, openPortionG)?.protein ?? 0}
                              {" · "}פח {portionFromRecipe(r, openPortionG)?.carbs ?? 0}
                              {" · "}ש {portionFromRecipe(r, openPortionG)?.fat ?? 0}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="rounded-xl bg-[var(--stem)] px-4 py-3 text-xs font-extrabold text-white disabled:opacity-50"
                            disabled={!(portionById[r.id] && clamp(num(portionById[r.id] ?? ""), 0, 200000) > 0)}
                            onClick={() => {
                              const g = clamp(num(portionById[r.id] ?? ""), 0, 200000);
                              const ok = addRecipePortionToToday(r, g);
                              if (ok) window.alert(gf(gender, "נוסף ליומן היום.", "נוסף ליומן היום."));
                            }}
                          >
                            הוסף ליומן
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                            onClick={() => {
                              upsertRecipeToDictionary(r);
                              window.alert(gf(gender, "נשמר במילון האישי.", "נשמר במילון האישי."));
                            }}
                          >
                            שמור במילון
                          </button>
                          <button
                            type="button"
                            className="col-span-2 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-xs font-extrabold text-[var(--cherry)] hover:bg-[var(--cherry-muted)]"
                            onClick={() => setShareId(r.id)}
                          >
                            שתף מתכון (PDF/ווטסאפ/מייל)
                          </button>
                          <button
                            type="button"
                            className="col-span-2 rounded-xl border-2 border-red-300/70 bg-white px-4 py-3 text-xs font-extrabold text-red-800 hover:bg-red-50"
                            onClick={() => {
                              setRecipes((prev) => prev.filter((x) => x.id !== r.id));
                              if (openId === r.id) setOpenId(null);
                              removeRecipe(r.id);
                            }}
                          >
                            מחק מתכון
                          </button>
                        </div>

                        <details className="mt-3 rounded-2xl border border-[var(--border-cherry-soft)] bg-white px-3 py-2">
                          <summary className="cursor-pointer text-sm font-extrabold text-[var(--stem)]">
                            מרכיבים
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {r.ingredients.map((ing) => (
                              <li key={ing.id} className="text-sm text-[var(--stem)]/80">
                                <span className="font-semibold">{ing.name}</span> · {Math.round(ing.grams)}g
                              </li>
                            ))}
                          </ul>
                        </details>
                      </motion.div>
                    )}
                  </AnimatePresence>
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

