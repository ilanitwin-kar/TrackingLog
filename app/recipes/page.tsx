"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadProfile } from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import {
  addRecipe,
  loadRecipes,
  removeRecipe,
  updateRecipe,
  type RecipeIngredient,
  type SavedRecipe,
  type SavedRecipePortion,
} from "@/lib/recipeStorage";
import { saveRecipeToCloud } from "@/lib/recipeCloud";
import { rankedFuzzySearchByText, type MatchRange } from "@/lib/rankedSearch";
import {
  clearRecipesWizardDraft,
  loadRecipesWizardDraft,
  saveRecipesWizardDraft,
  type RecipesWizardDraftV1,
  type WizardIngredientDraft,
} from "@/lib/recipesWizardDraft";
import { BarcodeScanModal } from "@/components/BarcodeScanModal";
import { IconPlusCircle, IconScanBarcode } from "@/components/Icons";
import { RecipeShelfNav } from "@/components/RecipeShelfNav";
import { formatRecipeMacroAbbrev } from "@/lib/recipeMacroFormat";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

type IngredientDraft = WizardIngredientDraft;

type SearchRow = {
  id: string;
  name: string;
  source: "dictionary" | "explorer" | "openFoodFacts" | "ai";
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
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

/** פוקוס בלי גלילת viewport — נוח לעין כשהשדה מעל/מתחת למסך */
function focusNoScroll(el: HTMLElement | null | undefined) {
  el?.focus({ preventScroll: true });
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

function renderHighlighted(text: string, ranges: MatchRange[]) {
  if (!ranges || ranges.length < 1) return text;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    const start = Math.max(0, Math.min(text.length, s));
    const end = Math.max(0, Math.min(text.length - 1, e));
    if (start > at) out.push(<span key={`t-${at}`}>{text.slice(at, start)}</span>);
    out.push(<strong key={`b-${start}`}>{text.slice(start, end + 1)}</strong>);
    at = end + 1;
  }
  if (at < text.length) out.push(<span key={`t-${at}-end`}>{text.slice(at)}</span>);
  return <>{out}</>;
}

function sourceIcon(src: SearchRow["source"]) {
  if (src === "dictionary") return "🍒";
  if (src === "explorer") return "🔎";
  if (src === "openFoodFacts") return "🌐";
  return "🧠";
}

/** קלוריות לשורת מרכיב (לפי גרם וקק״ל ל־100ג׳) — null אם אין נתון מספיק */
function ingredientLineKcal(row: IngredientDraft): number | null {
  const g = clamp(num(row.gramsText), 0, 50000);
  const kcal100 = clamp(num(row.caloriesPer100gText), 0, 2000);
  if (g <= 0 || !row.name.trim()) return null;
  return Math.round(kcal100 * (g / 100));
}

type RecipeWizardStep = 1 | 2 | 3;

function computeTotalsFromIngredientsList(ingredients: RecipeIngredient[]) {
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

function getSavedRecipeTotals(r: SavedRecipe) {
  return r.totals ?? computeTotalsFromIngredientsList(r.ingredients);
}

function getSavedRecipeFinalWeightG(r: SavedRecipe): number {
  const rawGrams = computeTotalsFromIngredientsList(r.ingredients).grams;
  const fw =
    typeof r.finalCookedWeightG === "number" && Number.isFinite(r.finalCookedWeightG) && r.finalCookedWeightG > 0
      ? r.finalCookedWeightG
      : rawGrams;
  return Math.max(1, Math.round(fw));
}

function getSavedRecipePer100(r: SavedRecipe) {
  const totals = getSavedRecipeTotals(r);
  const w = getSavedRecipeFinalWeightG(r);
  const mul = 100 / w;
  return {
    calories: Math.round(totals.calories * mul),
    protein: Math.round(totals.protein * mul * 10) / 10,
    carbs: Math.round(totals.carbs * mul * 10) / 10,
    fat: Math.round(totals.fat * mul * 10) / 10,
  };
}

function savedIngredientLineKcal(it: RecipeIngredient): number {
  return Math.round(clamp(it.caloriesPer100g, 0, 2000) * (clamp(it.grams, 0, 50000) / 100));
}

/** מרכיב נבחר מהחיפוש / ידני — נוסף לרשימה רק אחרי «הוסף» */
type IngredientStaging =
  | null
  | { mode: "fromSearch"; match: SearchRow; gramsText: string }
  | { mode: "manual"; draft: IngredientDraft };

export default function RecipesPage() {
  const gender = loadProfile().gender;
  const [title, setTitle] = useState("");
  const [servingsText, setServingsText] = useState("1");
  const [finalCookedWeightText, setFinalCookedWeightText] = useState("");
  const [nutritionOpen, setNutritionOpen] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<IngredientDraft[]>([]);
  const [step, setStep] = useState<RecipeWizardStep>(1);

  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [explorerRows, setExplorerRows] = useState<SearchRow[]>([]);
  const qRef = useRef<HTMLInputElement>(null);
  const gramsFocusRef = useRef<HTMLInputElement | null>(null);

  const [staging, setStaging] = useState<IngredientStaging>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);

  const [portionGramsText, setPortionGramsText] = useState("");
  const [recipesHelpOpen, setRecipesHelpOpen] = useState(false);
  const [wizardReady, setWizardReady] = useState(false);
  const [completedRecipeView, setCompletedRecipeView] = useState<SavedRecipe | null>(null);
  const [editingSavedRecipeId, setEditingSavedRecipeId] = useState<string | null>(null);

  useEffect(() => {
    const d = loadRecipesWizardDraft();
    if (d) {
      const ingOk = d.rows.some((r) => {
        const g = clamp(num(r.gramsText), 0, 50000);
        return Boolean(r.name.trim()) && g > 0;
      });
      let s = d.step;
      if (s === 3 && (!d.title.trim() || !ingOk)) s = d.title.trim() ? 2 : 1;
      if (s === 2 && !d.title.trim()) s = 1;
      setStep(s);
      setTitle(d.title);
      setServingsText(d.servingsText?.trim() ? d.servingsText : "1");
      setFinalCookedWeightText(d.finalCookedWeightText);
      setRows(d.rows);
      setNutritionOpen(d.nutritionOpen && typeof d.nutritionOpen === "object" ? { ...d.nutritionOpen } : {});
      setPortionGramsText(d.portionGramsText ?? "");
    }
    setWizardReady(true);
  }, []);

  useEffect(() => {
    if (!wizardReady) return;
    const payload: RecipesWizardDraftV1 = {
      v: 1,
      step,
      title,
      servingsText,
      finalCookedWeightText,
      rows,
      nutritionOpen,
      portionGramsText,
    };
    saveRecipesWizardDraft(payload);
  }, [
    wizardReady,
    step,
    title,
    servingsText,
    finalCookedWeightText,
    rows,
    nutritionOpen,
    portionGramsText,
  ]);

  useEffect(() => {
    if (!wizardReady) return;
    const payload: RecipesWizardDraftV1 = {
      v: 1,
      step,
      title,
      servingsText,
      finalCookedWeightText,
      rows,
      nutritionOpen,
      portionGramsText,
    };
    const t = window.setTimeout(() => saveRecipesWizardDraft(payload), 480);
    return () => window.clearTimeout(t);
  }, [wizardReady, step, title, servingsText, finalCookedWeightText, rows, nutritionOpen, portionGramsText]);

  useEffect(() => {
    const openHelp = () => setRecipesHelpOpen(true);
    window.addEventListener("cj-recipes-help", openHelp);
    return () => window.removeEventListener("cj-recipes-help", openHelp);
  }, []);

  useEffect(() => {
    if (!recipesHelpOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setRecipesHelpOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [recipesHelpOpen]);

  useEffect(() => {
    setSaved(loadRecipes());
    function onStorage(e: StorageEvent) {
      if (e.key === "cj_recipes_v1") setSaved(loadRecipes());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (step !== 2) {
      setStaging(null);
      setEditingRowId(null);
    }
  }, [step]);

  const stagingSearchFocusKey =
    staging?.mode === "fromSearch" ? staging.match.id : null;
  useEffect(() => {
    if (!stagingSearchFocusKey) return;
    const id = window.requestAnimationFrame(() => focusNoScroll(gramsFocusRef.current));
    return () => window.cancelAnimationFrame(id);
  }, [stagingSearchFocusKey]);

  const servings = clamp(Math.round(num(servingsText) || 1), 1, 60);
  const totals = useMemo(() => computeTotals(rows), [rows]);
  const finalWeightG = useMemo(() => {
    const w = clamp(num(finalCookedWeightText), 0, 200000);
    if (w > 0) return Math.round(w);
    return Math.round(totals.grams);
  }, [finalCookedWeightText, totals.grams]);
  const per100 = useMemo(() => {
    const w = finalWeightG;
    if (w <= 0) return null;
    const mul = 100 / w;
    return {
      calories: Math.round(totals.calories * mul),
      protein: Math.round(totals.protein * mul * 10) / 10,
      carbs: Math.round(totals.carbs * mul * 10) / 10,
      fat: Math.round(totals.fat * mul * 10) / 10,
    };
  }, [totals, finalWeightG]);
  const portion = useMemo(() => {
    const g = clamp(num(portionGramsText), 0, 200000);
    if (!per100 || g <= 0) return null;
    const mul = g / 100;
    return {
      grams: Math.round(g),
      calories: Math.round(per100.calories * mul),
      protein: Math.round(per100.protein * mul * 10) / 10,
      carbs: Math.round(per100.carbs * mul * 10) / 10,
      fat: Math.round(per100.fat * mul * 10) / 10,
    };
  }, [portionGramsText, per100]);

  const ingredientsReady = useMemo(
    () =>
      rows.some((r) => {
        const g = clamp(num(r.gramsText), 0, 50000);
        return Boolean(r.name.trim()) && g > 0;
      }),
    [rows]
  );

  const canGoStep2 = title.trim().length > 0;
  const canGoStep3 = canGoStep2 && ingredientsReady;

  const editingRow = useMemo(
    () => (editingRowId ? rows.find((r) => r.id === editingRowId) ?? null : null),
    [editingRowId, rows]
  );

  useEffect(() => {
    if (editingRowId && !rows.some((r) => r.id === editingRowId)) setEditingRowId(null);
  }, [editingRowId, rows]);

  function stepTabUnlocked(target: RecipeWizardStep): boolean {
    if (target === 1) return true;
    if (target === 2) return canGoStep2 || step === 2 || step === 3;
    return canGoStep3 || step === 3;
  }

  function goStep(target: RecipeWizardStep) {
    if (!stepTabUnlocked(target)) return;
    setStep(target);
  }

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setDebouncedQ("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedQ(t), 220);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (debouncedQ.length < 2) {
      setExplorerRows([]);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const exParams = new URLSearchParams({
          q: debouncedQ,
          sort: "caloriesAsc",
          category: "הכל",
          page: "1",
          pageSize: "36",
        });
        const exRes = await fetch(`/api/food-explorer?${exParams}`, { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (exRes.ok) {
          const ex = (await exRes.json()) as {
            items?: Array<{ id: string; name: string; calories: number; protein: number; carbs: number; fat: number }>;
          };
          const mapped = (ex.items ?? []).slice(0, 36).map((r) => ({
            id: `explorer:${r.id}`,
            name: r.name,
            source: "explorer" as const,
            caloriesPer100g: r.calories,
            proteinPer100g: r.protein,
            carbsPer100g: r.carbs,
            fatPer100g: r.fat,
          }));
          setExplorerRows(mapped);
        } else setExplorerRows([]);
      } catch {
        if (!ac.signal.aborted) setExplorerRows([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedQ]);

  const combinedRows = useMemo(() => {
    if (debouncedQ.trim().length < 2) return [];
    const dedup = new Map<string, SearchRow>();
    for (const r of explorerRows) {
      const key = r.name.toLowerCase();
      if (!dedup.has(key)) dedup.set(key, r);
    }
    return Array.from(dedup.values());
  }, [debouncedQ, explorerRows]);

  const combinedHits = useMemo(
    () =>
      rankedFuzzySearchByText(combinedRows, debouncedQ, {
        getText: (r) => r.name,
        getKey: (r) => r.id,
        limit: 14,
      }),
    [combinedRows, debouncedQ]
  );

  function selectSearchHit(match: SearchRow) {
    setEditingRowId(null);
    setStaging({ mode: "fromSearch", match, gramsText: "" });
    setQ("");
  }

  function cancelStaging() {
    setStaging(null);
  }

  function commitStaging() {
    if (!staging) return;
    if (staging.mode === "fromSearch") {
      const g = clamp(num(staging.gramsText), 0, 50000);
      if (g <= 0) return;
      const m = staging.match;
      const id = makeId();
      setRows((prev) => [
        ...prev,
        {
          id,
          name: m.name,
          gramsText: staging.gramsText.trim(),
          caloriesPer100gText: String(Math.round(m.caloriesPer100g)),
          proteinPer100gText: String(m.proteinPer100g),
          carbsPer100gText: String(m.carbsPer100g),
          fatPer100gText: String(m.fatPer100g),
        },
      ]);
      setNutritionOpen((open) => ({ ...open, [id]: false }));
      setStaging(null);
      setEditingRowId(null);
      window.requestAnimationFrame(() => focusNoScroll(qRef.current));
      return;
    }
    const d = staging.draft;
    const g = clamp(num(d.gramsText), 0, 50000);
    if (!d.name.trim() || g <= 0) return;
    setRows((prev) => [...prev, { ...d }]);
    setStaging(null);
    setEditingRowId(null);
    window.requestAnimationFrame(() => focusNoScroll(qRef.current));
  }

  function startManualStaging() {
    setEditingRowId(null);
    setStaging({
      mode: "manual",
      draft: {
        id: makeId(),
        name: "",
        gramsText: "",
        caloriesPer100gText: "",
        proteinPer100gText: "",
        carbsPer100gText: "",
        fatPer100gText: "",
      },
    });
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setNutritionOpen((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  function resetWizardFields() {
    setStep(1);
    setTitle("");
    setServingsText("1");
    setFinalCookedWeightText("");
    setRows([]);
    setNutritionOpen({});
    setPortionGramsText("");
    setQ("");
    setStaging(null);
    setEditingRowId(null);
  }

  function beginEditFromSummary(r: SavedRecipe) {
    setCompletedRecipeView(null);
    setEditingSavedRecipeId(r.id);
    setStep(1);
    setTitle(r.title);
    setServingsText(String(r.servings));
    setFinalCookedWeightText(
      typeof r.finalCookedWeightG === "number" && r.finalCookedWeightG > 0
        ? String(Math.round(r.finalCookedWeightG))
        : ""
    );
    setRows(
      r.ingredients.map((it) => ({
        id: it.id,
        name: it.name,
        gramsText: String(Math.round(it.grams)),
        caloriesPer100gText: String(Math.round(it.caloriesPer100g)),
        proteinPer100gText: String(it.proteinPer100g),
        carbsPer100gText: String(it.carbsPer100g),
        fatPer100gText: String(it.fatPer100g),
      }))
    );
    setNutritionOpen({});
    setPortionGramsText(r.portion?.grams ? String(r.portion.grams) : "");
    setStaging(null);
    setEditingRowId(null);
  }

  async function finishAndSaveRecipe() {
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

    const portionSnap: SavedRecipePortion | null =
      portion && clamp(num(portionGramsText), 0, 200000) > 0
        ? {
            grams: portion.grams,
            calories: portion.calories,
            protein: portion.protein,
            carbs: portion.carbs,
            fat: portion.fat,
          }
        : null;

    const payload = {
      title: t,
      servings,
      finalCookedWeightG: clamp(num(finalCookedWeightText), 0, 200000) > 0 ? finalWeightG : null,
      totals: {
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
      },
      ingredients: clean,
      portion: portionSnap,
    };

    const row = editingSavedRecipeId ? updateRecipe(editingSavedRecipeId, payload) : addRecipe(payload);
    if (!row) return;
    void saveRecipeToCloud(row);
    setSaved(loadRecipes());
    setEditingSavedRecipeId(null);
    clearRecipesWizardDraft();
    resetWizardFields();
    setCompletedRecipeView(row);
  }

  const rv = completedRecipeView;
  const perSaved = rv ? getSavedRecipePer100(rv) : null;
  const totalsSaved = rv ? getSavedRecipeTotals(rv) : null;
  const finalWSaved = rv ? getSavedRecipeFinalWeightG(rv) : 0;

  return (
    <div className={`mx-auto max-w-lg px-4 pt-2 pb-28 md:pt-3 md:pb-12 ${fontFood}`} dir="rtl">
      {rv ? (
        <div
          className={`fixed inset-0 z-[400] overflow-y-auto overscroll-contain bg-[color-mix(in_srgb,var(--cherry-muted)_92%,white)] ${fontFood}`}
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="mx-auto max-w-lg px-4 pb-32 pt-2">
            <p className="text-center text-xs font-extrabold uppercase tracking-wide text-[var(--cherry)]/70">
              {gf(gender, "המתכון נשמר", "המתכון נשמר")}
            </p>
            <h2 className="mt-2 break-words text-center text-2xl font-extrabold text-[var(--stem)]">{rv.title}</h2>
            <p className="mt-2 text-center text-sm font-semibold text-[var(--stem)]/75">
              מנות: {rv.servings} · משקל לחישוב ל־100ג׳: <span className="font-extrabold text-[var(--stem)]">{finalWSaved}</span> ג׳
            </p>

            <div className="mt-6 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-sm">
              <p className="text-sm font-extrabold text-[var(--stem)]">סיכום ערכים למתכון כולו</p>
              <p className="mt-2 text-base text-[var(--stem)]/90">
                סה״כ:{" "}
                {formatRecipeMacroAbbrev(
                  totalsSaved?.calories ?? 0,
                  totalsSaved?.protein ?? 0,
                  totalsSaved?.carbs ?? 0,
                  totalsSaved?.fat ?? 0
                )}
              </p>
              {perSaved ? (
                <p className="mt-3 text-sm font-semibold text-[var(--stem)]/85">
                  ל־100 ג׳ מן המנה החמה:{" "}
                  {formatRecipeMacroAbbrev(perSaved.calories, perSaved.protein, perSaved.carbs, perSaved.fat)}
                </p>
              ) : null}
            </div>

            {rv.portion ? (
              <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/45 p-4">
                <p className="text-sm font-extrabold text-[var(--stem)]">מנה שנבחרה</p>
                <p className="mt-2 text-sm font-normal text-black">
                  {rv.portion.grams} ג׳ למנה:{" "}
                  {formatRecipeMacroAbbrev(
                    rv.portion.calories,
                    rv.portion.protein,
                    rv.portion.carbs,
                    rv.portion.fat
                  )}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-center text-xs font-semibold text-[var(--stem)]/55">
                {gf(gender, "לא נשמרה מנה בודדת — אפשר לערוך ולהוסיף גרם למנה בשמירה הבאה.", "לא נשמרה מנה בודדת — אפשר לערוך ולהוסיף גרם למנה בשמירה הבאה.")}
              </p>
            )}

            <div className="mt-6 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-sm">
              <p className="text-sm font-extrabold text-[var(--stem)]">מרכיבים</p>
              <ul className="mt-3 divide-y divide-[var(--stem)]/10">
                {rv.ingredients.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm first:pt-0">
                    <span className="min-w-0 flex-1 font-semibold text-[var(--stem)]">{it.name}</span>
                    <span className="text-[var(--stem)]/80">{Math.round(it.grams)} ג׳</span>
                    <span className="font-extrabold text-[var(--cherry)]">{savedIngredientLineKcal(it)} קק״ל</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                className="btn-stem w-full rounded-2xl py-3.5 text-base font-extrabold"
                onClick={() => beginEditFromSummary(rv)}
              >
                עריכה
              </button>
              <button
                type="button"
                className="w-full rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                onClick={() => setCompletedRecipeView(null)}
              >
                סגירה
              </button>
              <Link
                href="/my-recipes"
                className="flex w-full items-center justify-center rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              >
                ל״המתכונים שלי״
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
      <AnimatePresence>
        {recipesHelpOpen && (
          <motion.div
            className="fixed inset-0 z-[600] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setRecipesHelpOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-2xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-extrabold tracking-tight text-[var(--cherry)]">מחשבון מתכונים</h2>
                <button
                  type="button"
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => setRecipesHelpOpen(false)}
                >
                  סגירה
                </button>
              </div>
              <p className="mt-2 text-base leading-relaxed text-[var(--stem)]/85">
                {gf(
                  gender,
                  "שלושה שלבים: פרטי מתכון → חיפוש במאגר והזנת מרכיבים (בשורת החיפוש: + להוספה מהירה או סריקת ברקוד) → חישוב ושמירה.",
                  "שלושה שלבים: פרטי מתכון → חיפוש במאגר והזנת מרכיבים (בשורת החיפוש: + להוספה מהירה או סריקת ברקוד) → חישוב ושמירה."
                )}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RecipeShelfNav active="calculator" />

      <motion.section
        className="glass-panel glass-panel--recipe-glow p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <nav
          className="mb-4 flex gap-1 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 p-1.5 shadow-sm"
          aria-label="שלבי בניית מתכון"
        >
          {(
            [
              { id: 1 as const, label: "פרטים" },
              { id: 2 as const, label: "מרכיבים" },
              { id: 3 as const, label: "תוצאות" },
            ] as const
          ).map((s) => {
            const unlocked = stepTabUnlocked(s.id);
            const active = step === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!unlocked}
                onClick={() => goStep(s.id)}
                className={`min-h-[52px] flex-1 rounded-xl px-2 py-2.5 text-sm font-extrabold leading-snug transition sm:min-h-[56px] sm:px-3 sm:text-base ${
                  active
                    ? "bg-[color-mix(in_srgb,var(--accent)_64%,white)] text-[var(--cherry)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-[color-mix(in_srgb,var(--cherry)_14%,transparent)]"
                    : unlocked
                      ? "bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--stem-deep)] hover:bg-[color-mix(in_srgb,var(--accent)_36%,white)]"
                      : "cursor-not-allowed text-[var(--stem)]/30"
                }`}
              >
                <span
                  className={`mb-0.5 block text-xs font-extrabold sm:text-sm ${
                    active ? "text-[var(--cherry)]/72" : unlocked ? "text-[var(--stem)]/80" : ""
                  }`}
                >
                  {s.id}
                </span>
                {s.label}
              </button>
            );
          })}
        </nav>
        <p className="mb-3 text-center text-[0.65rem] font-semibold text-[var(--stem)]/55">
          {gf(
            gender,
            "הטיוטה נשמרת במכשיר: במעבר בין שלבים ובעדכון השדות (עד שמירת מתכון סופית).",
            "הטיוטה נשמרת במכשיר: במעבר בין שלבים ובעדכון השדות (עד שמירת מתכון סופית)."
          )}
        </p>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm font-extrabold text-[var(--stem-deep)] sm:text-base">שלב 1 — פרטי המתכון</p>
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">שם מתכון</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-luxury-search w-full"
                  placeholder={gf(gender, "למשל: פסטה ברוטב עגבניות", "למשל: פסטה ברוטב עגבניות")}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">מספר מנות</span>
                <input
                  value={servingsText}
                  onChange={(e) => setServingsText(e.target.value)}
                  className="input-luxury-search w-full"
                  inputMode="numeric"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">משקל סופי לאחר בישול (גרם)</span>
                <input
                  value={finalCookedWeightText}
                  onChange={(e) => setFinalCookedWeightText(e.target.value)}
                  className="input-luxury-search w-full"
                  inputMode="numeric"
                  placeholder={gf(gender, "אם ריק – נסכם משקלי מרכיבים", "אם ריק – נסכם משקלי מרכיבים")}
                />
                <p className="mt-1 text-xs font-semibold text-[var(--stem)]/60">
                  משקל לחישוב ל־100ג׳:{" "}
                  <span className="font-extrabold">
                    {!finalCookedWeightText.trim() && totals.grams <= 0
                      ? gf(gender, "אחרי הוספת מרכיבים", "אחרי הוספת מרכיבים")
                      : `${finalWeightG} ג׳`}
                  </span>
                </p>
              </label>
            </div>
            <button
              type="button"
              className="btn-stem w-full rounded-xl py-3.5 text-sm font-extrabold disabled:opacity-45"
              disabled={!canGoStep2}
              onClick={() => goStep(2)}
            >
              אישור והמשך למרכיבים
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm font-extrabold text-[var(--stem-deep)] sm:text-base">שלב 2 — חיפוש והזנת משקלים</p>

            <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
              <p className="text-sm font-extrabold text-[var(--stem)]">חיפוש מרכיב במאגר אינטליגנציה קלורית</p>
              <div
                dir="rtl"
                className="mt-2 flex min-h-[3.25rem] items-center gap-1 rounded-[0.875rem] border-2 border-[var(--border-cherry-soft)] bg-white px-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-[color-mix(in_srgb,var(--stem)_35%,var(--accent-deep)_65%)] focus-within:shadow-[0_0_0_3px_var(--focus-ring-outer),0_0_0_1px_var(--focus-ring-inner)]"
              >
                <input
                  ref={qRef}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  placeholder={gf(gender, "הקלידי 2–3 אותיות…", "הקלד 2–3 אותיות…")}
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 text-base font-semibold leading-snug text-[var(--stem)] outline-none placeholder:text-[var(--stem)]/45"
                />
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]/45 active:scale-[0.99]"
                  aria-label={gf(gender, "הוספה מהירה — מרכיב ידני", "הוספה מהירה — מרכיב ידני")}
                  title={gf(gender, "הוספה מהירה (ידני)", "הוספה מהירה (ידני)")}
                  onClick={() => {
                    qRef.current?.blur();
                    startManualStaging();
                  }}
                >
                  <IconPlusCircle className="h-7 w-7 shrink-0" />
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]/45 active:scale-[0.99]"
                  aria-label="סריקת ברקוד — הוספה מהירה לחיפוש"
                  title="סריקת ברקוד"
                  onClick={() => {
                    qRef.current?.blur();
                    setScanModalOpen(true);
                  }}
                >
                  <IconScanBarcode className="h-6 w-6 shrink-0" />
                </button>
              </div>
              {loading && debouncedQ.length >= 2 && (
                <p className="mt-2 text-xs font-semibold text-[var(--stem)]/60">מחפשת…</p>
              )}
              {combinedHits.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {combinedHits.map((h) => (
                    <li key={h.item.id}>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-start text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                        onClick={() => selectSearchHit(h.item)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs" aria-hidden>
                            {sourceIcon(h.item.source)}
                          </span>
                          <span className="min-w-0 break-words">{renderHighlighted(h.item.name, h.ranges)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {staging ? (
                <div className="mt-4 rounded-xl border-2 border-[color-mix(in_srgb,var(--cherry)_40%,transparent)] bg-[var(--cherry-muted)]/45 p-3">
                  <p className="text-xs font-extrabold text-[var(--stem-deep)]">
                    {staging.mode === "fromSearch" ? "נבחר מהמאגר — הזיני משקל והוסיפי" : "מרכיב ידני"}
                  </p>
                  {staging.mode === "fromSearch" ? (
                    <>
                      <p className="mt-1 break-words text-base font-bold text-[var(--stem)]">{staging.match.name}</p>
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">משקל (גרם)</span>
                        <input
                          ref={(el) => {
                            gramsFocusRef.current = el;
                          }}
                          value={staging.gramsText}
                          onChange={(e) =>
                            setStaging((s) => (s?.mode === "fromSearch" ? { ...s, gramsText: e.target.value } : s))
                          }
                          className="input-luxury-search w-full"
                          inputMode="numeric"
                          placeholder={gf(gender, "למשל: 120", "למשל: 120")}
                        />
                      </label>
                    </>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">שם מרכיב</span>
                        <input
                          value={staging.draft.name}
                          onChange={(e) =>
                            setStaging((s) =>
                              s?.mode === "manual" ? { ...s, draft: { ...s.draft, name: e.target.value } } : s
                            )
                          }
                          className="input-luxury-search w-full text-sm"
                          placeholder={gf(gender, "שם", "שם")}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">גרם</span>
                        <input
                          value={staging.draft.gramsText}
                          onChange={(e) =>
                            setStaging((s) =>
                              s?.mode === "manual" ? { ...s, draft: { ...s.draft, gramsText: e.target.value } } : s
                            )
                          }
                          className="input-luxury-search w-full text-sm"
                          inputMode="numeric"
                          placeholder="0"
                        />
                      </label>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-[var(--border-cherry-soft)] bg-white py-2 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                        onClick={() =>
                          setNutritionOpen((m) => ({
                            ...m,
                            [staging.draft.id]: !(m[staging.draft.id] ?? false),
                          }))
                        }
                      >
                        {nutritionOpen[staging.draft.id] ? "הסתר ערכים ל־100ג׳" : "עריכת ערכים ל־100ג׳"}
                      </button>
                      {nutritionOpen[staging.draft.id] ? (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">קק״ל ל־100ג׳</span>
                            <input
                              value={staging.draft.caloriesPer100gText}
                              onChange={(e) =>
                                setStaging((s) =>
                                  s?.mode === "manual"
                                    ? { ...s, draft: { ...s.draft, caloriesPer100gText: e.target.value } }
                                    : s
                                )
                              }
                              className="input-luxury-search w-full text-sm"
                              inputMode="numeric"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">חלבון</span>
                            <input
                              value={staging.draft.proteinPer100gText}
                              onChange={(e) =>
                                setStaging((s) =>
                                  s?.mode === "manual"
                                    ? { ...s, draft: { ...s.draft, proteinPer100gText: e.target.value } }
                                    : s
                                )
                              }
                              className="input-luxury-search w-full text-sm"
                              inputMode="numeric"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">פחמ׳</span>
                            <input
                              value={staging.draft.carbsPer100gText}
                              onChange={(e) =>
                                setStaging((s) =>
                                  s?.mode === "manual"
                                    ? { ...s, draft: { ...s.draft, carbsPer100gText: e.target.value } }
                                    : s
                                )
                              }
                              className="input-luxury-search w-full text-sm"
                              inputMode="numeric"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">שומן</span>
                            <input
                              value={staging.draft.fatPer100gText}
                              onChange={(e) =>
                                setStaging((s) =>
                                  s?.mode === "manual" ? { ...s, draft: { ...s.draft, fatPer100gText: e.target.value } } : s
                                )
                              }
                              className="input-luxury-search w-full text-sm"
                              inputMode="numeric"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="btn-stem flex-1 rounded-xl py-2.5 text-sm font-extrabold disabled:opacity-45"
                      disabled={
                        staging.mode === "fromSearch"
                          ? clamp(num(staging.gramsText), 0, 50000) <= 0
                          : !staging.draft.name.trim() || clamp(num(staging.draft.gramsText), 0, 50000) <= 0
                      }
                      onClick={commitStaging}
                    >
                      הוסף
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-2.5 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                      onClick={cancelStaging}
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/35 p-3">
              <p className="text-center text-base font-extrabold text-[var(--stem)]">{title.trim() || "—"}</p>
              {rows.length === 0 ? (
                <p className="mt-2 text-center text-sm font-semibold text-[var(--stem)]/65">
                  {gf(
                    gender,
                    "בחרי מהרשימה למעלה או לחצי + / סריקה בשורת החיפוש. אחרי בחירה — גרמים ו«הוסף». המרכיבים יופיעו כאן בשורות פשוטות.",
                    "בחר מהרשימה למעלה או לחץ + / סריקה בשורת החיפוש. אחרי בחירה — גרמים ו«הוסף». המרכיבים יופיעו כאן בשורות פשוטות."
                  )}
                </p>
              ) : (
                <ul className="mt-3">
                  {rows.map((r) => {
                    const k = ingredientLineKcal(r);
                    const gShow = clamp(num(r.gramsText), 0, 50000);
                    return (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--stem)]/10 py-2.5 text-sm last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 basis-[40%] font-semibold text-[var(--stem)]">{r.name}</span>
                        <span className="text-[var(--stem)]/80">{gShow > 0 ? `${Math.round(gShow)} ג׳` : "—"}</span>
                        <span className="font-extrabold text-[var(--cherry)]">{k != null ? k : "—"}</span>
                        <span className="text-xs text-[var(--stem)]/55">קק״ל</span>
                        <span className="ms-auto inline-flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--border-cherry-soft)] bg-white px-2 py-1 text-[0.65rem] font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                            onClick={() => setEditingRowId(r.id)}
                          >
                            עריכה
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border-2 border-red-300/70 bg-white px-2 py-1 text-[0.65rem] font-extrabold text-red-800 hover:bg-red-50"
                            onClick={() => removeRow(r.id)}
                            title="הסר מרכיב"
                          >
                            מחק
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {editingRow ? (
              <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-[var(--stem)]">עריכת מרכיב</p>
                  <button
                    type="button"
                    className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                    onClick={() => setEditingRowId(null)}
                  >
                    סיום
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">שם</span>
                    <input
                      value={editingRow.name}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) => (x.id === editingRow.id ? { ...x, name: e.target.value } : x))
                        )
                      }
                      className="input-luxury-search w-full text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-extrabold text-[var(--stem-deep)]">גרם</span>
                    <input
                      value={editingRow.gramsText}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) => (x.id === editingRow.id ? { ...x, gramsText: e.target.value } : x))
                        )
                      }
                      className="input-luxury-search w-full text-sm"
                      inputMode="numeric"
                    />
                  </label>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/50 py-2 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                    onClick={() =>
                      setNutritionOpen((m) => ({ ...m, [editingRow.id]: !(m[editingRow.id] ?? false) }))
                    }
                  >
                    {nutritionOpen[editingRow.id] ? "הסתר ערכים ל־100ג׳" : "עריכת ערכים ל־100ג׳"}
                  </button>
                  {nutritionOpen[editingRow.id] ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">קק״ל ל־100ג׳</span>
                        <input
                          value={editingRow.caloriesPer100gText}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === editingRow.id ? { ...x, caloriesPer100gText: e.target.value } : x
                              )
                            )
                          }
                          className="input-luxury-search w-full text-sm"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">חלבון</span>
                        <input
                          value={editingRow.proteinPer100gText}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === editingRow.id ? { ...x, proteinPer100gText: e.target.value } : x
                              )
                            )
                          }
                          className="input-luxury-search w-full text-sm"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">פחמ׳</span>
                        <input
                          value={editingRow.carbsPer100gText}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) => (x.id === editingRow.id ? { ...x, carbsPer100gText: e.target.value } : x))
                            )
                          }
                          className="input-luxury-search w-full text-sm"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[0.65rem] font-extrabold text-[var(--stem-deep)]">שומן</span>
                        <input
                          value={editingRow.fatPer100gText}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) => (x.id === editingRow.id ? { ...x, fatPer100gText: e.target.value } : x))
                            )
                          }
                          className="input-luxury-search w-full text-sm"
                          inputMode="numeric"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] sm:flex-1"
                onClick={() => goStep(1)}
              >
                חזרה לפרטים
              </button>
              <button
                type="button"
                className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] disabled:opacity-45 sm:flex-1"
                disabled={!canGoStep3}
                onClick={() => goStep(3)}
              >
                המשך לחישוב ותוצאות
              </button>
            </div>
            {!canGoStep3 && rows.length > 0 ? (
              <p className="text-center text-xs font-semibold text-[var(--stem)]/55">
                {gf(gender, "יש למלא שם מרכיב ומשקל בגרם (מעל 0) לפחות במרכיב אחד.", "יש למלא שם מרכיב ומשקל בגרם (מעל 0) לפחות במרכיב אחד.")}
              </p>
            ) : null}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm font-extrabold text-[var(--stem-deep)] sm:text-base">שלב 3 — חישוב ותוצאות</p>
            <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
              <p className="text-lg font-extrabold text-[var(--stem)]">{title.trim()}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--stem)]/60">
                מנות: {servings} · משקל לחישוב ל־100ג׳: <span className="font-extrabold text-[var(--stem)]">{finalWeightG}</span> ג׳
              </p>
              <p className="mt-3 text-sm text-[var(--stem)]/85">
                סה״כ במתכון:{" "}
                {formatRecipeMacroAbbrev(
                  Math.round(totals.calories),
                  totals.protein,
                  totals.carbs,
                  totals.fat
                )}
              </p>
              {per100 && (
                <p className="mt-2 text-sm font-semibold text-[var(--stem)]/85">
                  ל־100 ג׳ מן המנה החמה:{" "}
                  {formatRecipeMacroAbbrev(per100.calories, per100.protein, per100.carbs, per100.fat)}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/40 p-3">
              <p className="mb-2 border-b-2 border-black pb-1 text-base font-extrabold text-black sm:text-lg">
                מחשבון מנה
              </p>
              <label className="block">
                <input
                  value={portionGramsText}
                  onChange={(e) => setPortionGramsText(e.target.value)}
                  className="input-luxury-search w-full"
                  inputMode="numeric"
                  placeholder={gf(
                    gender,
                    "הזיני כמות בגרמים (למשל 180)",
                    "הזן כמות בגרמים (למשל 180)"
                  )}
                  aria-label={gf(gender, "הזנת כמות בגרמים למנה", "הזנת כמות בגרמים למנה")}
                />
              </label>
              {portion ? (
                <p className="mt-2 text-sm font-normal text-black">
                  מנה ({portion.grams} ג׳):{" "}
                  {formatRecipeMacroAbbrev(portion.calories, portion.protein, portion.carbs, portion.fat)}
                </p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-[var(--stem)]/55">
                  {gf(gender, "אחרי הזנת גרם למנה יוצגו כאן הקלוריות והמאקרו — ויישמרו עם המתכון.", "אחרי הזנת גרם למנה יוצגו כאן הקלוריות והמאקרו — ויישמרו עם המתכון.")}
                </p>
              )}
            </div>

            <p className="text-center text-xs font-semibold text-[var(--stem)]/60">
              {gf(
                gender,
                "לחצי «שמירה וסיום» — יוצג סיכום מלא על המסך. משם אפשר לערוך הכל או לסגור.",
                "לחץ «שמירה וסיום» — יוצג סיכום מלא על המסך. משם אפשר לערוך הכל או לסגור."
              )}
            </p>
            <button
              type="button"
              className="btn-stem w-full rounded-2xl py-3.5 text-base font-extrabold disabled:opacity-45"
              disabled={!title.trim() || totals.grams <= 0}
              onClick={() => void finishAndSaveRecipe()}
            >
              שמירה וסיום
            </button>
          </div>
        )}
      </motion.section>

      <motion.section
        className="glass-panel glass-panel--recipe-glow mt-4 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <h2 className="panel-title-cherry mb-3 text-lg">המתכונים שלי</h2>
        {saved.length === 0 ? (
          <p className="text-sm text-[var(--stem)]/75">
            {gf(gender, "עדיין אין מתכונים שמורים.", "עדיין אין מתכונים שמורים.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {saved.map((r) => {
              const sumT = getSavedRecipeTotals(r);
              const sumW = getSavedRecipeFinalWeightG(r);
              const sumP100 = getSavedRecipePer100(r);
              return (
                <li key={r.id} className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
                  <button type="button" className="w-full text-start" onClick={() => setOpenId((x) => (x === r.id ? null : r.id))}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-base font-extrabold text-[var(--stem)]">{r.title}</p>
                        <p className="mt-1 text-xs text-[var(--stem)]/65">
                          מנות: {r.servings} · סה״כ {formatRecipeMacroAbbrev(sumT.calories, sumT.protein, sumT.carbs, sumT.fat)} ·
                          מרכיבים: {r.ingredients.length}
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
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        className="mt-3 space-y-3 border-t border-[var(--border-cherry-soft)]/60 pt-3 text-sm text-[var(--stem)]/90"
                      >
                        <p className="text-xs font-semibold text-[var(--stem)]/70">
                          משקל לחישוב ל־100ג׳: <span className="font-extrabold text-[var(--stem)]">{sumW}</span> ג׳
                        </p>
                        <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/35 p-3">
                          <p className="text-xs font-extrabold text-[var(--cherry)]">סיכום למתכון כולו</p>
                          <p className="mt-1 font-semibold text-[var(--stem)]">
                            {formatRecipeMacroAbbrev(sumT.calories, sumT.protein, sumT.carbs, sumT.fat)}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-[var(--stem)]/80">
                            ל־100 ג׳ מהמנה החמה:{" "}
                            {formatRecipeMacroAbbrev(sumP100.calories, sumP100.protein, sumP100.carbs, sumP100.fat)}
                          </p>
                        </div>
                        {r.portion ? (
                          <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white p-3">
                            <p className="text-xs font-extrabold text-[var(--cherry)]">מנה שנשמרה</p>
                            <p className="mt-1 text-xs font-normal text-black">
                              {r.portion.grams} ג׳:{" "}
                              {formatRecipeMacroAbbrev(
                                r.portion.calories,
                                r.portion.protein,
                                r.portion.carbs,
                                r.portion.fat
                              )}
                            </p>
                          </div>
                        ) : null}
                        <div>
                          <p className="mb-2 text-xs font-extrabold text-[var(--stem)]">מרכיבים</p>
                          <ul className="space-y-2">
                            {r.ingredients.map((it) => (
                              <li key={it.id} className="rounded-lg border border-[var(--border-cherry-soft)]/60 bg-white/80 px-2 py-2">
                                <p className="font-semibold text-[var(--stem)]">{it.name}</p>
                                <p className="mt-0.5 text-xs text-[var(--stem)]/75">
                                  {Math.round(it.grams)} ג׳ במתכון ·{" "}
                                  <span className="font-extrabold text-[var(--cherry)]">{savedIngredientLineKcal(it)} קק״ל</span>
                                  {" במתכון · "}
                                  {Math.round(it.caloriesPer100g)} קק״ל ל־100 ג׳
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          type="button"
                          className="w-full rounded-xl border-2 border-red-300/70 bg-white px-3 py-2.5 text-sm font-extrabold text-red-800 shadow-sm transition hover:bg-red-50"
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
              );
            })}
          </ul>
        )}
      </motion.section>
        </>
      )}

      <BarcodeScanModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onApplyToHome={(name, note) => {
          void note;
          setQ(name);
          setScanModalOpen(false);
          window.requestAnimationFrame(() => focusNoScroll(qRef.current));
        }}
      />
    </div>
  );
}

