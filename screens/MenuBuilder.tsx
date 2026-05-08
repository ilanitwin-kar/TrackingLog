"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { DictDominantMacroGlyph } from "@/components/DictDominantMacroGlyph";
import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { colors } from "@/lib/colors";
import {
  dominantDictMacro,
  type DictDominantMacro,
} from "@/lib/dictionaryDominantMacro";
import { gf } from "@/lib/hebrewGenderUi";
import { dailyMacroTargetsGramsForProfile } from "@/lib/macroTargets";
import { dailyCalorieTarget, type CaloriePlanInput } from "@/lib/tdee";
import {
  addExplorerFoodToDictionaryIfAbsent,
  loadDictionary,
  loadMealPresets,
  loadProfile,
  type DictionaryItem,
  type MealPreset,
} from "@/lib/storage";
import {
  allPantryDictionaryIds,
  assignTreatMealSlotsForDictionary,
  buildPantryTreatLocksForMenu,
  loadMenuBuilderPantryState,
  needsTreatMealAssignmentForDictionary,
  resolvePantryAtomicStepForFoodRow,
  saveMenuBuilderPantryState,
  type PantryTreatLockInput,
  validatePantryState,
} from "@/lib/menuBuilderPantry";
import {
  computeSelectionBlockers,
  type SelectionBlocker,
  type SelectionResolution,
} from "@/lib/menuBuilderSelectionValidation";
import { mealSlotCalorieFractions } from "@/lib/menuMealSlotWeights";
import {
  filterPoolBySlotTheme,
  isFruitCategory,
  isVegetableCategory,
  vegetableCandidates,
} from "@/lib/menuSlotPool";
import {
  mealWizardLabels,
  readStoredMenuMealCount,
  slotKindFromTitle,
  writeStoredMenuMealCount,
  type MealSlotKind,
} from "@/lib/menuWizardLabels";
import { menuBuilderTimeHintSummary } from "@/lib/menu-builder";
import { rankDictionaryByQuery } from "@/lib/dictionarySearch";
import {
  applyDictionarySwapInMeal,
  appendCalorieGapLineToDraft,
  pickPantryFillCandidate,
  recalcAiDraftTotals,
  redistributeMealCalorieDeficit,
} from "@/lib/menuSwapQuantities";
import { typography } from "@/lib/typography";

type CelebrationMode = "home" | "family" | "restaurant_out" | "delivery";

const TRAINING_TYPE_OPTIONS = [
  { kcal: 250, emoji: "💪", label: "כוח / משקולות" },
  { kcal: 200, emoji: "🏃‍♀️", label: "אירובי / ריצה" },
  { kcal: 100, emoji: "🧘‍♀️", label: "יוגה / פילאטיס" },
] as const;

type MenuLine = {
  id: string;
  food: DictionaryItem;
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type MealPlan = { title: string; lines: MenuLine[] };

type AllocateMealsResult = { meals: MealPlan[]; warnings: string[] };

type AiMenuDraft = {
  title: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  meals: Array<{
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    items: Array<{
      name: string;
      portionLabel: string;
      estimatedGrams?: number | null;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      isSuggested?: boolean;
      description?: string;
    }>;
  }>;
} | null;

const PANTRY_GROUP_ORDER: DictDominantMacro[] = [
  "protein",
  "carbs",
  "fat",
  "neutral",
];

const PANTRY_GROUP_META: Record<DictDominantMacro, { label: string }> = {
  protein: { label: "חלבון" },
  carbs: { label: "פחמימה" },
  fat: { label: "שומן" },
  neutral: { label: "נייטרלי" },
};

function presetForDictionaryItem(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): MealPreset | undefined {
  return d.mealPresetId ? presetMap.get(d.mealPresetId) : undefined;
}

function macroKcal100(d: DictionaryItem): number {
  const p = d.proteinPer100g ?? 0;
  const c = d.carbsPer100g ?? 0;
  const f = d.fatPer100g ?? 0;
  const fromMacro = p * 4 + c * 4 + f * 9;
  if (typeof d.caloriesPer100g === "number" && d.caloriesPer100g > 0) {
    return d.caloriesPer100g;
  }
  return Math.max(1, Math.round(fromMacro));
}

function lineFromItem(food: DictionaryItem, grams: number): MenuLine {
  const g = Math.max(1, Math.round(grams));
  const mul = g / 100;
  const k100 = macroKcal100(food);
  const p100 = food.proteinPer100g ?? 0;
  const c100 = food.carbsPer100g ?? 0;
  const f100 = food.fatPer100g ?? 0;
  return {
    id: `${food.id}-${g}-${Math.random().toString(36).slice(2, 7)}`,
    food,
    grams: g,
    calories: Math.round(k100 * mul),
    proteinG: Math.round(p100 * mul * 10) / 10,
    carbsG: Math.round(c100 * mul * 10) / 10,
    fatG: Math.round(f100 * mul * 10) / 10,
  };
}

function kcalPerGram(d: DictionaryItem): number {
  return macroKcal100(d) / 100;
}

const MAX_GRAM_PER_ITEM = 400;
const GRAM_ROUND = 5;
const MACRO_SOLVER_ITERS = 4500;
const MACRO_SOLVER_LAMBDA = 1e-5;

function macroPerGramTuple(d: DictionaryItem): [number, number, number] {
  const p = (d.proteinPer100g ?? 0) / 100;
  const c = (d.carbsPer100g ?? 0) / 100;
  const f = (d.fatPer100g ?? 0) / 100;
  return [p, c, f];
}

/**
 * פותר כמות גרמים לא-שלילית לכל פריט במאגר כדי לקרב את סכום החלבון/פחמימה/שומן ליעדים
 * (ריבועים מינימליים עם היטל L2 קטן — ירידה בגרדיאנט עם הטמעה לתחום).
 */
function solveGramsForMacroTargets(
  pool: DictionaryItem[],
  targetP: number,
  targetC: number,
  targetF: number,
): number[] {
  const n = pool.length;
  const cols = pool.map(macroPerGramTuple);
  const x = new Float64Array(n);
  const sumT = targetP + targetC + targetF;
  if (sumT < 1e-4) {
    return Array(n).fill(0);
  }

  let anyNonzero = false;
  for (const [p, c, f] of cols) {
    if (Math.abs(p) + Math.abs(c) + Math.abs(f) > 1e-9) {
      anyNonzero = true;
      break;
    }
  }
  if (!anyNonzero) {
    return Array(n).fill(0);
  }

  for (let i = 0; i < n; i++) {
    const [p, c, f] = cols[i]!;
    const dens = p + c + f + 1e-6;
    x[i] = Math.min(
      MAX_GRAM_PER_ITEM,
      Math.max(0, (sumT / n / dens) * 0.35),
    );
  }

  let lr = 0.11 / Math.sqrt(Math.max(1, n));
  for (let iter = 0; iter < MACRO_SOLVER_ITERS; iter++) {
    let rp = -targetP;
    let rc = -targetC;
    let rf = -targetF;
    for (let i = 0; i < n; i++) {
      const [p, c, f] = cols[i]!;
      rp += p * x[i];
      rc += c * x[i];
      rf += f * x[i];
    }
    for (let i = 0; i < n; i++) {
      const [p, c, f] = cols[i]!;
      const gi =
        2 * (p * rp + c * rc + f * rf) + 2 * MACRO_SOLVER_LAMBDA * x[i];
      const next = x[i] - lr * gi;
      x[i] = Math.max(0, Math.min(MAX_GRAM_PER_ITEM, next));
    }
    if (iter % 550 === 549) {
      lr *= 0.92;
    }
  }

  return Array.from(x);
}

function rawKcalWeightForTitle(title: string): number {
  const k = slotKindFromTitle(title);
  if (k === "breakfast") return 26;
  if (k === "snack") return 11;
  if (k === "lunch") return 33;
  if (k === "dinner") return 28;
  return 7;
}

function normalizeWeights(weights: number[]): number[] {
  const s = weights.reduce((a, b) => a + b, 0);
  if (s <= 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / s);
}

function roundGrams(g: number): number {
  return Math.max(GRAM_ROUND, Math.round(g / GRAM_ROUND) * GRAM_ROUND);
}

/** חלבון "כבד" / עיקרי — לא לביניים או כמות גדולה בבוקר */
function isHeavyMeatProtein(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  const dom = dominantDictMacro(
    d,
    presetForDictionaryItem(d, presetMap),
  );
  const p = d.proteinPer100g ?? 0;
  const f = d.fatPer100g ?? 0;
  const k100 = macroKcal100(d);
  const name = normalizeHebrew(d.food ?? "");
  const meatHint =
    /בקר|טחון|בשר|עוף|הודו|כבש|דג\b|סטייק|צלי|המבורג|שניצל|קבב|קציצות/.test(
      name,
    );
  if (dom !== "protein") return false;
  if (p >= 22 && (f >= 10 || k100 >= 195)) return true;
  if (meatHint && p >= 14) return true;
  return false;
}

function meaningfulCarbSource(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  const dom = dominantDictMacro(
    d,
    presetForDictionaryItem(d, presetMap),
  );
  const c = d.carbsPer100g ?? 0;
  return dom === "carbs" || c >= 16;
}

/** פחמימה «צד» — לא שניצל חלבון מדומה ולא בשר כמקור פחמימה; לא קפה/משקה כארוחה */
function isCoffeeLikeMealDrink(d: DictionaryItem): boolean {
  const raw = d.food ?? "";
  const n = normalizeHebrew(raw);
  const latin = raw.trim().toLowerCase();
  const cat = (d.foodCategory ?? "").trim().toLowerCase();
  if (
    /cappuccino|latte|espresso|macchiato|americano|frappuccino|\bmocha\b/.test(
      latin,
    )
  ) {
    return true;
  }
  if (n.includes("קפוצינו") || n.includes("ארומה אספרסו בר")) return true;
  if (
    n.includes("קפוצ") ||
    n.includes("קפה") ||
    n.includes("לאטה") ||
    n.includes("אספרסו") ||
    n.includes("מקיאטו") ||
    n.includes("אמריקנו") ||
    n.includes("פרפוצינו") ||
    n.includes("קפוקינו") ||
    n.includes("ניטרו") ||
    (n.includes("משקה") && (n.includes("חם") || n.includes("קר")))
  ) {
    return true;
  }
  if (cat.includes("אלכוהול")) return false;
  if (
    n.includes("ארומה") &&
    (n.includes("משקה") || n.includes("מנה") || /\d+\s*מ["׳']?ל/.test(n))
  ) {
    return true;
  }
  if (
    /\d+\s*מ["׳']?ל/.test(n) &&
    (n.includes("מקדונלדס") || (n.includes("משקה") && macroKcal100(d) < 120))
  ) {
    return macroKcal100(d) < 120;
  }
  return false;
}

function isStarchCarbSide(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  if (isFruitCategory(d.foodCategory)) return false;
  if (isCoffeeLikeMealDrink(d)) return false;
  if (!meaningfulCarbSource(d, presetMap)) return false;
  if (isHeavyMeatProtein(d, presetMap)) return false;
  const dom = dominantDictMacro(
    d,
    presetForDictionaryItem(d, presetMap),
  );
  const name = normalizeHebrew(d.food);
  if (/שניצל|נקניק|פסטרמה|קבב|קציצות|המבורג/.test(name)) return false;
  if (dom === "protein" && (d.proteinPer100g ?? 0) >= 16) return false;
  return true;
}

function proteinAnchorKind(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): "fish" | "meat" | null {
  const name = normalizeHebrew(d.food);
  if (
    /דג|סלמון|טונה|מושט|פילה|בקלה|קרפיון|סרדין|פירות ים|קלמרי|אנשובי|מושט/.test(
      name,
    )
  ) {
    return "fish";
  }
  if (isHeavyMeatProtein(d, presetMap) || proteinMainForMainMeal(d, presetMap)) {
    return "meat";
  }
  return null;
}

function trimSecondProteinAnchor(
  lines: MenuLine[],
  presetMap: Map<string, MealPreset>,
): MenuLine[] {
  const idxs: number[] = [];
  lines.forEach((l, i) => {
    if (proteinAnchorKind(l.food, presetMap)) idxs.push(i);
  });
  if (idxs.length <= 1) return lines;
  const dropAt = idxs[idxs.length - 1]!;
  return lines.filter((_, i) => i !== dropAt);
}

function proteinMainForMainMeal(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  if (isCoffeeLikeMealDrink(d)) return false;
  if (isHeavyMeatProtein(d, presetMap)) return true;
  const dom = dominantDictMacro(
    d,
    presetForDictionaryItem(d, presetMap),
  );
  const p = d.proteinPer100g ?? 0;
  return dom === "protein" && p >= 16;
}

function acceptableForSnackOrLate(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  if (isHeavyMeatProtein(d, presetMap)) return false;
  const dom = dominantDictMacro(
    d,
    presetForDictionaryItem(d, presetMap),
  );
  const k100 = macroKcal100(d);
  if (dom === "fat" && (d.fatPer100g ?? 0) > 55) return false;
  if (dom === "protein" && k100 > 140) return false;
  return true;
}

function filterPoolForSlotKind(
  kind: MealSlotKind,
  pool: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
): DictionaryItem[] {
  if (kind === "snack" || kind === "late") {
    return pool.filter((d) => acceptableForSnackOrLate(d, presetMap));
  }
  if (kind === "breakfast") {
    const noHeavy = pool.filter((d) => !isHeavyMeatProtein(d, presetMap));
    return noHeavy.length > 0 ? noHeavy : pool;
  }
  return pool;
}

function maxGramForSlotKind(kind: MealSlotKind, role: "protein" | "carb" | "other"): number {
  if (kind === "snack" || kind === "late") {
    return role === "other" ? 220 : 200;
  }
  if (kind === "breakfast") {
    return role === "protein" ? 120 : 200;
  }
  if (role === "protein") return 200;
  if (role === "carb") return 260;
  return MAX_GRAM_PER_ITEM;
}

function clampSolverGrams(
  raw: number[],
  foods: DictionaryItem[],
  caps: number[],
  minGramPerPortion?: number,
): MenuLine[] {
  const floor = Math.max(GRAM_ROUND, minGramPerPortion ?? GRAM_ROUND);
  const lines: MenuLine[] = [];
  for (let i = 0; i < foods.length; i++) {
    const g = roundGrams(
      Math.min(caps[i] ?? MAX_GRAM_PER_ITEM, Math.max(floor, raw[i] ?? 0)),
    );
    if (g >= GRAM_ROUND) {
      lines.push(lineFromItem(foods[i]!, g));
    }
  }
  return lines;
}

function solveMealTwoFoods(
  a: DictionaryItem,
  b: DictionaryItem,
  pT: number,
  cT: number,
  fT: number,
  capA: number,
  capB: number,
  minGramPerPortion?: number,
): MenuLine[] {
  const g = solveGramsForMacroTargets([a, b], pT, cT, fT);
  return clampSolverGrams(g, [a, b], [capA, capB], minGramPerPortion);
}

function solveMealThreeFoods(
  a: DictionaryItem,
  b: DictionaryItem,
  c: DictionaryItem,
  pT: number,
  cT: number,
  fT: number,
  capA: number,
  capB: number,
  capC: number,
  minGramPerPortion?: number,
): MenuLine[] {
  const g = solveGramsForMacroTargets([a, b, c], pT, cT, fT);
  return clampSolverGrams(g, [a, b, c], [capA, capB, capC], minGramPerPortion);
}

function solveMealOneFood(
  food: DictionaryItem,
  kcalTarget: number,
  capG: number,
): MenuLine | null {
  const kpg = kcalPerGram(food);
  if (kpg <= 0) return null;
  let grams = Math.round(kcalTarget / kpg);
  grams = roundGrams(Math.min(capG, Math.max(GRAM_ROUND, grams)));
  return lineFromItem(food, grams);
}

function solveMealOneFoodMinGrams(
  food: DictionaryItem,
  kcalTarget: number,
  capG: number,
  minGrams: number,
): MenuLine | null {
  const kpg = kcalPerGram(food);
  if (kpg <= 0) return null;
  let grams = Math.round(kcalTarget / kpg);
  grams = roundGrams(
    Math.min(capG, Math.max(minGrams, Math.max(GRAM_ROUND, grams))),
  );
  return lineFromItem(food, grams);
}

function breakfastProteinCandidate(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  if (isHeavyMeatProtein(d, presetMap)) return false;
  if (isCoffeeLikeMealDrink(d)) return false;
  if (isFruitCategory(d.foodCategory)) return false;
  if (isVegetableCategory(d.foodCategory ?? "")) return false;
  const cat = (d.foodCategory ?? "").toLowerCase();
  const n = normalizeHebrew(d.food ?? "");
  if (cat.includes("גבינות") || cat.includes("ביצים")) return true;
  if (
    n.includes("ביצה") ||
    n.includes("חביתה") ||
    n.includes("טונה") ||
    n.includes("סרדין")
  ) {
    return true;
  }
  if (n.includes("נקניק") || n.includes("פסטרמה") || n.includes("סלמי")) {
    return true;
  }
  if (n.includes("קוטג") || n.includes("לבנה")) return true;
  if (n.includes("יוגורט") && (d.proteinPer100g ?? 0) >= 3.5) return true;
  const dom = dominantDictMacro(d, presetForDictionaryItem(d, presetMap));
  return (
    dom === "protein" &&
    (d.proteinPer100g ?? 0) >= 13 &&
    macroKcal100(d) < 210
  );
}

/** ערב: להעדיף לחם/פריסה על פני אורז אם יש במאגר */
function prioritizeBreadLikeCarbs(items: DictionaryItem[]): DictionaryItem[] {
  const breadish = items.filter((d) => {
    const c = (d.foodCategory ?? "").toLowerCase();
    const n = normalizeHebrew(d.food ?? "");
    return (
      c.includes("לחם") ||
      n.includes("לחם") ||
      n.includes("פיתה") ||
      n.includes("פריסה") ||
      n.includes("חלה") ||
      n.includes("טורטיה") ||
      n.includes("כריך")
    );
  });
  const rest = items.filter((d) => !breadish.includes(d));
  return [...breadish, ...rest];
}

function isBreakfastBreadLike(d: DictionaryItem): boolean {
  const c = (d.foodCategory ?? "").toLowerCase();
  const n = normalizeHebrew(d.food ?? "");
  return (
    c.includes("לחם") ||
    n.includes("לחם") ||
    n.includes("פריסה") ||
    n.includes("פיתה") ||
    n.includes("חלה") ||
    n.includes("טורטיה") ||
    n.includes("כריך") ||
    n.includes("באגט") ||
    n.includes("טוסט")
  );
}

function isBreakfastSpreadCandidate(d: DictionaryItem): boolean {
  if (isCoffeeLikeMealDrink(d)) return false;
  const c = (d.foodCategory ?? "").toLowerCase();
  const n = normalizeHebrew(d.food ?? "");
  if (c.includes("ממרחים") || c.includes("ריבות")) return true;
  if (c.includes("סלטים") || c.includes("ממרח")) return true;
  if (
    n.includes("חומוס") ||
    n.includes("טחינה") ||
    n.includes("ממרח") ||
    n.includes("גבינה לבנה") ||
    n.includes("שפיץ") ||
    n.includes("קרם צ") ||
    n.includes("אבוקדו")
  ) {
    return true;
  }
  return false;
}

function tryAppendBreakfastSpread(
  lines: MenuLine[],
  poolFree: DictionaryItem[],
  kBudget: number,
  presetMap: Map<string, MealPreset>,
): MenuLine[] {
  const usedIds = new Set(lines.map((l) => l.food.id));
  const hasBread = lines.some((l) => isBreakfastBreadLike(l.food));
  const hasSavorySliceNeed = lines.some((l) => {
    const n = normalizeHebrew(l.food.food ?? "");
    return (
      breakfastProteinCandidate(l.food, presetMap) ||
      n.includes("נקניק") ||
      n.includes("פסטרמה") ||
      n.includes("סלמי")
    );
  });
  if (!hasBread || !hasSavorySliceNeed) return lines;
  if (lines.some((l) => isBreakfastSpreadCandidate(l.food))) return lines;
  const candidates = poolFree.filter(
    (d) => isBreakfastSpreadCandidate(d) && !usedIds.has(d.id),
  );
  if (candidates.length === 0) return lines;
  const spread = candidates[0]!;
  const remaining = kBudget - lines.reduce((s, l) => s + l.calories, 0);
  if (remaining < 38) return lines;
  const cap = Math.min(55, maxGramForSlotKind("breakfast", "other"));
  const ln = solveMealOneFoodMinGrams(
    spread,
    Math.min(remaining * 0.22, 72),
    cap,
    16,
  );
  if (!ln || ln.calories < 10) return lines;
  return [...lines, ln];
}

function mealHasVegetableLine(lines: MenuLine[]): boolean {
  return lines.some((l) => isVegetableCategory(l.food.foodCategory ?? ""));
}

/** כופה ירק בבוקר/צהריים/ערב אם יש במאגר — גם כש־tryAppend נכשל בגלל סף קלוריות */
function ensureMainMealHasVegetable(
  lines: MenuLine[],
  poolFree: DictionaryItem[],
  kBudget: number,
  kind: MealSlotKind,
): MenuLine[] {
  if (kind !== "lunch" && kind !== "dinner" && kind !== "breakfast") return lines;
  if (mealHasVegetableLine(lines)) return lines;
  const usedIds = new Set(lines.map((l) => l.food.id));
  const vegPool = vegetableCandidates(poolFree).filter((d) => !usedIds.has(d.id));
  if (vegPool.length === 0) return lines;
  const usedK = lines.reduce((s, l) => s + l.calories, 0);
  const remaining = kBudget - usedK;
  if (remaining < 24) return lines;
  const veg = vegPool[0]!;
  const cap = Math.min(200, maxGramForSlotKind(kind, "other"));
  const kTarget = Math.min(remaining * 0.38, 100);
  const ln = solveMealOneFoodMinGrams(veg, kTarget, cap, 72);
  if (!ln || ln.calories < 14) return lines;
  return [...lines, ln];
}

function mealKcalCap(kind: MealSlotKind, kcalAllocated: number): number {
  if (kind === "snack") return Math.min(kcalAllocated, 200);
  if (kind === "late") return Math.min(kcalAllocated, 180);
  if (kind === "breakfast") return Math.min(kcalAllocated, 520);
  return Math.min(kcalAllocated, 820);
}

/** מגביל ירקות דלות קלוריות כדי שלא יופיעו מאות גרם מוזרים */
function clampVegetablePortions(plans: MealPlan[]): void {
  const LOW_K100 = 38;
  for (const m of plans) {
    for (let i = 0; i < m.lines.length; i++) {
      const l = m.lines[i]!;
      if (!isVegetableCategory(l.food.foodCategory ?? "")) continue;
      const k100 = macroKcal100(l.food);
      const maxG = k100 < LOW_K100 ? 150 : 220;
      if (l.grams > maxG) {
        m.lines[i] = lineFromItem(l.food, maxG);
      }
    }
  }
}

function computeAllocationWarnings(
  plans: MealPlan[],
  menuKcal: number,
  profile: CaloriePlanInput,
  pool: DictionaryItem[],
): string[] {
  const out: string[] = [];
  let pSum = 0;
  let cSum = 0;
  for (const m of plans) {
    for (const l of m.lines) {
      pSum += l.proteinG;
      cSum += l.carbsG;
    }
  }

  const vegInPool = pool.some((d) =>
    isVegetableCategory(d.foodCategory ?? ""),
  );
  let mainMealMissingVeg = false;
  for (const m of plans) {
    const slotKind = slotKindFromTitle(m.title);
    if (
      slotKind !== "breakfast" &&
      slotKind !== "lunch" &&
      slotKind !== "dinner"
    ) {
      continue;
    }
    if (!mealHasVegetableLine(m.lines)) mainMealMissingVeg = true;
  }
  if (mainMealMissingVeg && !vegInPool) {
    out.push(
      "חסרים ירקות במאגר הנבחר — סמנו ירקות טריים/מבושלים בשלב הבחירה (ובמזווה) כדי שהבונה יוכל לשבץ צלחות מאוזנות.",
    );
  }
  const ref = dailyMacroTargetsGramsForProfile(
    Math.max(400, menuKcal),
    profile.weightKg,
    profile.gender,
  );
  if (ref.proteinG > 30 && pSum < ref.proteinG * 0.68) {
    out.push(
      "נראה שחסר חלבון יחסית ליעד היומי — כדאי להוסיף מזונות עשירי חלבון מהמילון האישי.",
    );
  }
  if (ref.carbsG > 45 && cSum < ref.carbsG * 0.62) {
    out.push(
      "נראה שחסרות פחמימות יחסית ליעד — אפשר להוסיף לחם, דגנים או קטניות מהמילון.",
    );
  }
  if (plans.some((m) => m.lines.length === 0)) {
    out.push(
      "חלק מהארוחות ריקות — הרחיבו את בחירת המזון בשלב 4 או במילוי המזווה.",
    );
  }
  const richProteinInPool = pool.some((d) => (d.proteinPer100g ?? 0) >= 14);
  if (!richProteinInPool) {
    out.push(
      "כמעט אין במאגר הנבחר מקורות חלבון חזקים — מומלץ להוסיף מהמילון לתפריט מאוזן.",
    );
  }
  return out;
}

/** ירק כתוספת לארוחות עיקריות — תקציב קטן וגרם מוגבל */
function tryAppendVegetableSide(
  lines: MenuLine[],
  poolFree: DictionaryItem[],
  remainingKcal: number,
  kind: MealSlotKind,
): MenuLine[] {
  if (remainingKcal < 26 || lines.length === 0) return lines;
  const usedIds = new Set(lines.map((l) => l.food.id));
  const vegPool = vegetableCandidates(poolFree).filter((d) => !usedIds.has(d.id));
  if (vegPool.length === 0) return lines;
  const veg = vegPool[0]!;
  const cap = Math.min(175, maxGramForSlotKind(kind, "other"));
  const ln = solveMealOneFoodMinGrams(
    veg,
    Math.min(remainingKcal * 0.28, 115),
    cap,
    kind === "breakfast" ? 58 : 65,
  );
  if (!ln || ln.calories < 14) return lines;
  return [...lines, ln];
}

function buildLinesForSlot(
  usedFoodIds: Set<string>,
  kind: MealSlotKind,
  kcalT: number,
  pT: number,
  cT: number,
  fT: number,
  pool: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
  mealIdx: number,
): MenuLine[] {
  const kBudget = mealKcalCap(kind, Math.max(90, kcalT));
  const poolFree = pool.filter((d) => !usedFoodIds.has(d.id));
  const themeRole: "primary" | "any" =
    kind === "snack" || kind === "late" ? "any" : "primary";
  const themed = filterPoolBySlotTheme(poolFree, kind, themeRole);
  const filtered = filterPoolForSlotKind(kind, themed, presetMap);
  let usable = filtered.length > 0 ? filtered : themed;
  if (
    (kind === "snack" || kind === "late") &&
    filtered.length === 0
  ) {
    const lightish = poolFree.filter((d) => !isHeavyMeatProtein(d, presetMap));
    usable = lightish.length > 0 ? lightish : poolFree;
  }

  if (kind === "snack" || kind === "late") {
    const sorted = [...usable].sort(
      (x, y) => macroKcal100(x) - macroKcal100(y),
    );
    if (sorted.length === 0) return [];
    const pick = sorted[mealIdx % sorted.length]!;
    const line = solveMealOneFood(pick, kBudget, maxGramForSlotKind(kind, "other"));
    return line ? [line] : [];
  }

  /** פירות רק בביניים — לא נכנסים לבוקר/צהריים/ערב */
  if (kind === "breakfast" || kind === "lunch" || kind === "dinner") {
    const noFruit = usable.filter((d) => !isFruitCategory(d.foodCategory));
    if (noFruit.length > 0) usable = noFruit;
  }

  /** לא ליפול חזרה לכל המאגר כשיש חלבונים/פחמימות — זה הכניס משקאות קפה כארוחה */
  let ua = usable.filter((d) => !isCoffeeLikeMealDrink(d));
  if (ua.length === 0) ua = usable;

  const finalizeMainMealLines = (lines: MenuLine[]): MenuLine[] =>
    ensureMainMealHasVegetable(lines, poolFree, kBudget, kind);

  const wrapWithVegSides = (lines: MenuLine[]): MenuLine[] => {
    const kUsed = lines.reduce((s, l) => s + l.calories, 0);
    const stepped = tryAppendVegetableSide(
      lines,
      poolFree,
      kBudget - kUsed,
      kind,
    );
    return finalizeMainMealLines(stepped);
  };

  if (kind === "breakfast") {
    const poolBf = ua;

    const carbBf = poolBf.filter(
      (d) =>
        !isFruitCategory(d.foodCategory) &&
        !isVegetableCategory(d.foodCategory ?? "") &&
        !isCoffeeLikeMealDrink(d) &&
        (isStarchCarbSide(d, presetMap) ||
          (d.foodCategory ?? "").includes("דגני") ||
          normalizeHebrew(d.food).includes("דגנ")),
    );

    const proteinBf = poolBf.filter((d) =>
      breakfastProteinCandidate(d, presetMap),
    );

    const carbPick =
      carbBf[mealIdx % Math.max(1, carbBf.length)] ??
      poolBf.find(
        (d) =>
          meaningfulCarbSource(d, presetMap) &&
          !isFruitCategory(d.foodCategory) &&
          !isVegetableCategory(d.foodCategory ?? "") &&
          !isCoffeeLikeMealDrink(d),
      );

    const protPick =
      proteinBf.find((d) => d.id !== carbPick?.id) ??
      proteinBf[mealIdx % Math.max(1, proteinBf.length)];

    if (carbPick && protPick && carbPick.id !== protPick.id) {
      const capP = maxGramForSlotKind(kind, "protein");
      const capC = maxGramForSlotKind(kind, "carb");
      const lines = solveMealTwoFoods(
        protPick,
        carbPick,
        Math.max(8, pT * 0.92),
        Math.max(12, cT * 0.92),
        Math.max(3, fT * 0.88),
        capP,
        capC,
        42,
      );
      if (lines.length > 0) {
        const kUsed = lines.reduce((s, l) => s + l.calories, 0);
        const withVeg = tryAppendVegetableSide(
          lines,
          poolFree,
          kBudget - kUsed,
          kind,
        );
        return finalizeMainMealLines(
          tryAppendBreakfastSpread(
            withVeg,
            poolFree,
            kBudget,
            presetMap,
          ),
        );
      }
    }

    const lights = poolBf.filter(
      (d) =>
        !isFruitCategory(d.foodCategory) &&
        !isVegetableCategory(d.foodCategory ?? "") &&
        !isCoffeeLikeMealDrink(d) &&
        (macroKcal100(d) <= 92 ||
          dominantDictMacro(d, presetForDictionaryItem(d, presetMap)) ===
            "neutral"),
    );
    const subs = poolBf.filter(
      (d) =>
        !isFruitCategory(d.foodCategory) &&
        ((d.foodCategory ?? "").includes("דגני") ||
          normalizeHebrew(d.food).includes("דגנ") ||
          normalizeHebrew(d.food).includes("יוגורט") ||
          meaningfulCarbSource(d, presetMap) ||
          (dominantDictMacro(d, presetForDictionaryItem(d, presetMap)) ===
            "protein" &&
            !isHeavyMeatProtein(d, presetMap) &&
            macroKcal100(d) < 190)),
    );
    const light = lights[mealIdx % Math.max(1, lights.length)] ?? poolBf[0];
    const sub =
      subs.find((d) => d.id !== light?.id) ??
      poolBf.find((d) => d.id !== light?.id) ??
      poolBf[1] ??
      poolBf[0];
    if (light && sub && light.id !== sub.id) {
      const capL = maxGramForSlotKind(kind, "other");
      const capS = maxGramForSlotKind(kind, "carb");
      const lines = solveMealTwoFoods(
        light,
        sub,
        Math.max(6, pT * 0.9),
        Math.max(8, cT * 0.95),
        Math.max(2, fT * 0.85),
        capL,
        capS,
        38,
      );
      if (lines.length > 0) {
        const kUsed = lines.reduce((s, l) => s + l.calories, 0);
        const withVeg = tryAppendVegetableSide(
          lines,
          poolFree,
          kBudget - kUsed,
          kind,
        );
        return finalizeMainMealLines(
          tryAppendBreakfastSpread(
            withVeg,
            poolFree,
            kBudget,
            presetMap,
          ),
        );
      }
    }
    const one = poolBf[mealIdx % poolBf.length]!;
    const ln = solveMealOneFood(one, kBudget, maxGramForSlotKind(kind, "carb"));
    if (!ln) return [];
    const oneVeg = tryAppendVegetableSide(
      [ln],
      poolFree,
      kBudget - ln.calories,
      kind,
    );
    return finalizeMainMealLines(
      tryAppendBreakfastSpread(oneVeg, poolFree, kBudget, presetMap),
    );
  }

  if (kind === "lunch" || kind === "dinner") {
    const vegCand = vegetableCandidates(poolFree);
    const proteins = ua.filter(
      (d) =>
        proteinMainForMainMeal(d, presetMap) ||
        isHeavyMeatProtein(d, presetMap) ||
        (proteinAnchorKind(d, presetMap) != null &&
          !isVegetableCategory(d.foodCategory ?? "")),
    );
    let carbSides = ua.filter(
      (d) =>
        isStarchCarbSide(d, presetMap) &&
        !isVegetableCategory(d.foodCategory ?? ""),
    );
    let carbsFallback = ua.filter(
      (d) =>
        !isCoffeeLikeMealDrink(d) &&
        !isFruitCategory(d.foodCategory) &&
        meaningfulCarbSource(d, presetMap) &&
        !isVegetableCategory(d.foodCategory ?? "") &&
        !isHeavyMeatProtein(d, presetMap),
    );
    if (kind === "dinner") {
      carbSides = prioritizeBreadLikeCarbs(carbSides);
      carbsFallback = prioritizeBreadLikeCarbs(carbsFallback);
    }
    const pFood =
      proteins[mealIdx % Math.max(1, proteins.length)] ??
      ua.sort((a, b) => (b.proteinPer100g ?? 0) - (a.proteinPer100g ?? 0))[0];
    const cFood =
      carbSides.find((d) => d.id !== pFood?.id) ??
      carbsFallback.find((d) => d.id !== pFood?.id);
    const vFood =
      vegCand.find((d) => d.id !== pFood?.id && d.id !== cFood?.id) ??
      vegCand.find((d) => d.id !== pFood?.id) ??
      vegCand[0];

    if (
      pFood &&
      cFood &&
      vFood &&
      pFood.id !== cFood.id &&
      new Set([pFood.id, cFood.id, vFood.id]).size === 3
    ) {
      let lines = solveMealThreeFoods(
        pFood,
        cFood,
        vFood,
        Math.max(10, pT * 0.88),
        Math.max(12, cT * 0.85),
        Math.max(4, fT * 0.85),
        maxGramForSlotKind(kind, "protein"),
        maxGramForSlotKind(kind, "carb"),
        Math.min(200, maxGramForSlotKind(kind, "other")),
        34,
      );
      lines = trimSecondProteinAnchor(lines, presetMap);
      const mealCarbs = lines.reduce((s, l) => s + l.carbsG, 0);
      const mealP = lines.reduce((s, l) => s + l.proteinG, 0);
      const hasVeg = lines.some((l) =>
        isVegetableCategory(l.food.foodCategory ?? ""),
      );
      if (lines.length >= 3 && hasVeg && mealCarbs >= 12 && mealP >= 8) {
        return finalizeMainMealLines(lines);
      }
      if (lines.length >= 2 && hasVeg && mealP >= 18 && mealCarbs >= 10) {
        return finalizeMainMealLines(lines);
      }
    }
  }

  const proteins = ua.filter((d) => proteinMainForMainMeal(d, presetMap));
  let carbSides = ua.filter(
    (d) =>
      isStarchCarbSide(d, presetMap) &&
      !isVegetableCategory(d.foodCategory ?? ""),
  );
  let carbsFallback = ua.filter(
    (d) =>
      !isCoffeeLikeMealDrink(d) &&
      !isFruitCategory(d.foodCategory) &&
      meaningfulCarbSource(d, presetMap) &&
      !isVegetableCategory(d.foodCategory ?? ""),
  );
  if (kind === "dinner") {
    carbSides = prioritizeBreadLikeCarbs(carbSides);
    carbsFallback = prioritizeBreadLikeCarbs(carbsFallback);
  }
  const pFood =
    proteins[mealIdx % Math.max(1, proteins.length)] ??
    ua.sort((a, b) => (b.proteinPer100g ?? 0) - (a.proteinPer100g ?? 0))[0];
  let cFood =
    carbSides[(mealIdx + 1) % Math.max(1, carbSides.length)] ??
    carbSides[0] ??
    carbsFallback[(mealIdx + 1) % Math.max(1, carbsFallback.length)] ??
    carbsFallback[0] ??
    ua.find((d) => d.id !== pFood?.id);
  if (
    cFood &&
    pFood &&
    proteinAnchorKind(cFood, presetMap) &&
    proteinAnchorKind(pFood, presetMap)
  ) {
    cFood =
      carbSides.find((d) => d.id !== pFood.id && !proteinAnchorKind(d, presetMap)) ??
      carbsFallback.find((d) => d.id !== pFood.id && !proteinAnchorKind(d, presetMap)) ??
      cFood;
  }
  if (pFood && cFood && pFood.id !== cFood.id) {
    let lines = solveMealTwoFoods(
      pFood,
      cFood,
      Math.max(8, pT * 0.92),
      Math.max(10, cT * 0.92),
      Math.max(4, fT * 0.88),
      maxGramForSlotKind(kind, "protein"),
      maxGramForSlotKind(kind, "carb"),
      36,
    );
    lines = trimSecondProteinAnchor(lines, presetMap);
    const mealCarbs = lines.reduce((s, l) => s + l.carbsG, 0);
    const mealP = lines.reduce((s, l) => s + l.proteinG, 0);
    if (lines.length > 0 && mealCarbs >= 12 && mealP >= 8) {
      return kind === "dinner" || kind === "lunch"
        ? wrapWithVegSides(lines)
        : lines;
    }
    if (lines.length > 0 && mealP >= 20 && mealCarbs >= 8) {
      return kind === "dinner" || kind === "lunch"
        ? wrapWithVegSides(lines)
        : lines;
    }
  }
  if (pFood) {
    const ln = solveMealOneFood(
      pFood,
      kBudget * 0.55,
      maxGramForSlotKind(kind, "protein"),
    );
    if (cFood && cFood.id !== pFood.id) {
      const ln2 = solveMealOneFood(
        cFood,
        kBudget * 0.45,
        maxGramForSlotKind(kind, "carb"),
      );
      const out: MenuLine[] = [];
      if (ln) out.push(ln);
      if (ln2) out.push(ln2);
      if (out.length > 0) {
        const trimmed = trimSecondProteinAnchor(out, presetMap);
        if (kind === "dinner" || kind === "lunch") {
          return wrapWithVegSides(trimmed);
        }
        return trimmed;
      }
    }
    if (ln && (kind === "dinner" || kind === "lunch")) {
      return wrapWithVegSides([ln]);
    }
    return ln ? [ln] : [];
  }
  const fallback = ua[mealIdx % ua.length]!;
  const ln = solveMealOneFood(fallback, kBudget, MAX_GRAM_PER_ITEM);
  if (!ln) return [];
  if (kind === "dinner" || kind === "lunch") {
    return wrapWithVegSides([ln]);
  }
  return [ln];
}

function protectedPantryIds(
  locks: PantryTreatLockInput[] | undefined,
): Set<string> | undefined {
  if (!locks?.length) return undefined;
  return new Set(locks.map((l) => `pantry-lock-${l.explorerId}`));
}

function enforceMenuTotalKcal(
  plans: MealPlan[],
  maxTotalKcal: number,
  hasTreatLineFirst: boolean,
  protectedIds?: Set<string>,
): void {
  let total = 0;
  for (const m of plans) {
    for (const l of m.lines) {
      total += l.calories;
    }
  }
  if (total <= maxTotalKcal + 6) return;
  let treatK = 0;
  if (hasTreatLineFirst && plans[0]?.lines[0]) {
    treatK = plans[0].lines[0].calories;
  }
  const rest = total - treatK;
  const allowedRest = Math.max(150, maxTotalKcal - treatK);
  if (rest <= 0 || allowedRest <= 0) return;
  const factor = allowedRest / rest;
  if (factor >= 0.999) return;
  for (let mi = 0; mi < plans.length; mi++) {
    const meal = plans[mi]!;
    for (let li = 0; li < meal.lines.length; li++) {
      if (hasTreatLineFirst && mi === 0 && li === 0) continue;
      const l = meal.lines[li]!;
      if (protectedIds?.has(l.id)) continue;
      const ng = roundGrams(Math.max(GRAM_ROUND, l.grams * factor));
      meal.lines[li] = lineFromItem(l.food, ng);
    }
  }
  total = 0;
  for (const m of plans) {
    for (const l of m.lines) {
      total += l.calories;
    }
  }
  let guard = 0;
  while (total > maxTotalKcal + 6 && guard < 80) {
    guard++;
    let bestMi = -1;
    let bestLi = -1;
    let bestK = -1;
    for (let mi = 0; mi < plans.length; mi++) {
      for (let li = 0; li < plans[mi]!.lines.length; li++) {
        if (hasTreatLineFirst && mi === 0 && li === 0) continue;
        const ln = plans[mi]!.lines[li]!;
        if (protectedIds?.has(ln.id)) continue;
        const k = ln.calories;
        if (k > bestK) {
          bestK = k;
          bestMi = mi;
          bestLi = li;
        }
      }
    }
    if (bestMi < 0 || bestK < 30) break;
    const l = plans[bestMi]!.lines[bestLi]!;
    const ng = Math.max(GRAM_ROUND, l.grams - GRAM_ROUND);
    plans[bestMi]!.lines[bestLi] = lineFromItem(l.food, ng);
    total = 0;
    for (const m of plans) {
      for (const x of m.lines) {
        total += x.calories;
      }
    }
  }
}

/** מילוי לפי קלוריות בלבד — גיבוי כשאין מספיק מאקרו במאגר או הפתרון כמעט ריק */
function legacyCalorieFillMeals(
  mealCount: number,
  remainingKcal: number,
  pool: DictionaryItem[],
  plans: MealPlan[],
): void {
  if (pool.length === 0 || remainingKcal <= 70) return;
  const poolNoCoffee = pool.filter((d) => !isCoffeeLikeMealDrink(d));
  const fillPool = poolNoCoffee.length > 0 ? poolNoCoffee : pool;
  const perSlotTarget = remainingKcal / mealCount;
  let poolIdx = 0;
  for (let m = 0; m < mealCount; m++) {
    const used = plans[m]!.lines.reduce((s, l) => s + l.calories, 0);
    let slotLeft = Math.max(0, perSlotTarget - used);
    let guard = 0;
    while (slotLeft > 70 && guard < 14) {
      guard++;
      const food = fillPool[poolIdx % fillPool.length]!;
      poolIdx++;
      const kpg = kcalPerGram(food);
      let grams = Math.round((slotLeft / kpg) * 0.5);
      grams = Math.min(280, Math.max(60, Math.round(grams / 5) * 5));
      const line = lineFromItem(food, grams);
      if (line.calories > slotLeft + 40) continue;
      plans[m]!.lines.push(line);
      slotLeft -= line.calories;
    }
  }
}

/** פירות ומשקאות קפה רק בביניים — מסיר מארוחות עיקריות אחרי האלוקציה */
function stripFruitAndCoffeeFromMainPlans(
  plans: MealPlan[],
  labels: string[],
  protect: Set<string> | undefined,
  hasTreatLineFirst: boolean,
): void {
  for (let mi = 0; mi < plans.length; mi++) {
    const m = plans[mi]!;
    const kind = slotKindFromTitle(labels[mi] ?? m.title);
    if (kind !== "breakfast" && kind !== "lunch" && kind !== "dinner") continue;
    const next: MenuLine[] = [];
    for (let li = 0; li < m.lines.length; li++) {
      const l = m.lines[li]!;
      if (hasTreatLineFirst && mi === 0 && li === 0) {
        next.push(l);
        continue;
      }
      if (protect?.has(l.id)) {
        next.push(l);
        continue;
      }
      if (
        isFruitCategory(l.food.foodCategory) ||
        isCoffeeLikeMealDrink(l.food)
      ) {
        continue;
      }
      next.push(l);
    }
    m.lines = next;
  }
}

function appendMissingVegetablesToMainPlans(
  plans: MealPlan[],
  labels: string[],
  pool: DictionaryItem[],
  menuKcal: number,
): void {
  const w = normalizeWeights(labels.map(rawKcalWeightForTitle));
  for (let mi = 0; mi < plans.length; mi++) {
    const m = plans[mi]!;
    const kind = slotKindFromTitle(labels[mi] ?? m.title);
    if (kind !== "breakfast" && kind !== "lunch" && kind !== "dinner") continue;
    if (mealHasVegetableLine(m.lines)) continue;
    const kBudget = mealKcalCap(
      kind,
      menuKcal * (w[mi] ?? 1 / Math.max(1, plans.length)),
    );
    m.lines = ensureMainMealHasVegetable(m.lines, pool, kBudget, kind);
  }
}

/** ערב: פחמימה ממשית (לחם וכו׳) — לא פרי ולא קפה כמילוי פחמימה */
function appendMissingStarchForDinner(
  plans: MealPlan[],
  labels: string[],
  pool: DictionaryItem[],
  menuKcal: number,
  presetMap: Map<string, MealPreset>,
): void {
  const w = normalizeWeights(labels.map(rawKcalWeightForTitle));
  for (let mi = 0; mi < plans.length; mi++) {
    const m = plans[mi]!;
    if (slotKindFromTitle(labels[mi] ?? m.title) !== "dinner") continue;
    const hasStarch = m.lines.some((l) =>
      isStarchCarbSide(l.food, presetMap),
    );
    if (hasStarch) continue;
    const usedIds = new Set(m.lines.map((l) => l.food.id));
    let candidates = pool.filter(
      (d) =>
        isStarchCarbSide(d, presetMap) &&
        !usedIds.has(d.id) &&
        !isFruitCategory(d.foodCategory) &&
        !isCoffeeLikeMealDrink(d),
    );
    candidates = prioritizeBreadLikeCarbs(candidates);
    if (candidates.length === 0) continue;
    const kind: MealSlotKind = "dinner";
    const kBudget = mealKcalCap(
      kind,
      menuKcal * (w[mi] ?? 1 / Math.max(1, plans.length)),
    );
    const usedK = m.lines.reduce((s, l) => s + l.calories, 0);
    const remaining = kBudget - usedK;
    if (remaining < 35) continue;
    const starch = candidates[0]!;
    const cap = maxGramForSlotKind(kind, "carb");
    const ln = solveMealOneFoodMinGrams(
      starch,
      Math.min(remaining * 0.42, 160),
      cap,
      45,
    );
    if (ln && ln.calories >= 18) m.lines.push(ln);
  }
}

function allocateMeals(
  mealCount: number,
  menuKcalBudget: number,
  profile: CaloriePlanInput,
  trainingExtraKcal: number,
  treat: { food: DictionaryItem; grams: number } | null,
  pool: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
  pantryTreatLocks?: PantryTreatLockInput[],
  outsideHomeMealReserved?: boolean,
): AllocateMealsResult {
  const labels = mealWizardLabels(mealCount);
  const plans: MealPlan[] = labels.map((title) => ({ title, lines: [] }));
  const menuKcal = Math.max(800, Math.round(menuKcalBudget));
  const protect = protectedPantryIds(pantryTreatLocks);

  const kcalRef = Math.max(
    1,
    dailyCalorieTarget(profile) + Math.max(0, trainingExtraKcal),
  );
  const scale = menuKcal / kcalRef;

  const macroRef = dailyMacroTargetsGramsForProfile(
    kcalRef,
    profile.weightKg,
    profile.gender,
  );
  let targetP = macroRef.proteinG * scale;
  let targetC = macroRef.carbsG * scale;
  let targetF = macroRef.fatG * scale;
  if (outsideHomeMealReserved) {
    targetP *= 1.14;
    targetC *= 0.82;
    targetF *= 0.74;
  }

  const usedFoodIds = new Set<string>();
  let treatKcal = 0;
  if (treat) {
    const tl = lineFromItem(treat.food, treat.grams);
    treatKcal = tl.calories;
    plans[0]!.lines.push(tl);
    usedFoodIds.add(treat.food.id);
    targetP = Math.max(0, targetP - tl.proteinG);
    targetC = Math.max(0, targetC - tl.carbsG);
    targetF = Math.max(0, targetF - tl.fatG);
  }

  const lockedKcalBySlot = new Array(mealCount).fill(0);
  let pantryLocksKcal = 0;
  for (const lock of pantryTreatLocks ?? []) {
    if (lock.mealIndex < 0 || lock.mealIndex >= mealCount) continue;
    const tl = lineFromItem(lock.food, lock.grams);
    tl.id = `pantry-lock-${lock.explorerId}`;
    pantryLocksKcal += tl.calories;
    lockedKcalBySlot[lock.mealIndex] += tl.calories;
    plans[lock.mealIndex]!.lines.push(tl);
    usedFoodIds.add(lock.food.id);
    targetP = Math.max(0, targetP - tl.proteinG);
    targetC = Math.max(0, targetC - tl.carbsG);
    targetF = Math.max(0, targetF - tl.fatG);
  }

  if (pool.length === 0) {
    enforceMenuTotalKcal(plans, menuKcal, treat != null, protect);
    clampVegetablePortions(plans);
    return {
      meals: plans,
      warnings: computeAllocationWarnings(plans, menuKcal, profile, pool),
    };
  }

  const dayRemainKcal = Math.max(220, menuKcal - treatKcal - pantryLocksKcal);
  const w =
    mealSlotCalorieFractions(mealCount) ??
    normalizeWeights(labels.map(rawKcalWeightForTitle));
  const slotKcals = w.map((wi) => dayRemainKcal * wi);
  if (treat && (slotKcals[0] ?? 0) < 95) {
    const need = 95 - (slotKcals[0] ?? 0);
    slotKcals[0] = 95;
    let donor = 1;
    let maxV = -1;
    for (let i = 1; i < slotKcals.length; i++) {
      if ((slotKcals[i] ?? 0) > maxV) {
        maxV = slotKcals[i]!;
        donor = i;
      }
    }
    slotKcals[donor] = Math.max(70, (slotKcals[donor] ?? 0) - need);
  }

  for (let mi = 0; mi < labels.length; mi++) {
    const kind = slotKindFromTitle(labels[mi]!);
    const floor = kind === "snack" || kind === "late" ? 40 : 88;
    slotKcals[mi] = Math.max(
      floor,
      (slotKcals[mi] ?? 0) - (lockedKcalBySlot[mi] ?? 0),
    );
  }

  for (let mi = 0; mi < labels.length; mi++) {
    const kind = slotKindFromTitle(labels[mi]!);
    const kT = slotKcals[mi] ?? dayRemainKcal / labels.length;
    const pT = Math.max(2, targetP * (w[mi] ?? 0));
    const cT = Math.max(3, targetC * (w[mi] ?? 0));
    const fT = Math.max(1, targetF * (w[mi] ?? 0));
    const built = buildLinesForSlot(
      usedFoodIds,
      kind,
      kT,
      pT,
      cT,
      fT,
      pool,
      presetMap,
      mi,
    );
    for (const line of built) {
      usedFoodIds.add(line.food.id);
      plans[mi]!.lines.push(line);
    }
  }

  enforceMenuTotalKcal(plans, menuKcal, treat != null, protect);

  const mealMissingFood = plans.some((m, mi) => {
    if (treat && mi === 0 && m.lines.length >= 1) {
      return m.lines.length < 2;
    }
    return m.lines.length === 0;
  });

  if (mealMissingFood) {
    for (const pl of plans) {
      pl.lines = [];
    }
    if (treat) {
      plans[0]!.lines.push(lineFromItem(treat.food, treat.grams));
    }
    for (const lock of pantryTreatLocks ?? []) {
      if (lock.mealIndex < 0 || lock.mealIndex >= mealCount) continue;
      const tl = lineFromItem(lock.food, lock.grams);
      tl.id = `pantry-lock-${lock.explorerId}`;
      plans[lock.mealIndex]!.lines.push(tl);
    }
    const alreadyKcal = plans.reduce(
      (s, m) => s + m.lines.reduce((a, l) => a + l.calories, 0),
      0,
    );
    legacyCalorieFillMeals(
      mealCount,
      Math.max(0, menuKcal - alreadyKcal),
      pool,
      plans,
    );
    enforceMenuTotalKcal(plans, menuKcal, treat != null, protect);
  }

  stripFruitAndCoffeeFromMainPlans(
    plans,
    labels,
    protect,
    treat != null,
  );
  appendMissingVegetablesToMainPlans(plans, labels, pool, menuKcal);
  appendMissingStarchForDinner(plans, labels, pool, menuKcal, presetMap);
  enforceMenuTotalKcal(plans, menuKcal, treat != null, protect);

  clampVegetablePortions(plans);
  return {
    meals: plans,
    warnings: computeAllocationWarnings(plans, menuKcal, profile, pool),
  };
}

function findSubstitute(
  base: DictionaryItem,
  all: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
): DictionaryItem | null {
  const cat = dominantDictMacro(base, presetForDictionaryItem(base, presetMap));
  const k100b = macroKcal100(base);
  const lo = k100b * 0.9;
  const hi = k100b * 1.1;
  const candidates = all.filter((d) => {
    if (d.id === base.id) return false;
    if (
      dominantDictMacro(d, presetForDictionaryItem(d, presetMap)) !== cat
    ) {
      return false;
    }
    const k = macroKcal100(d);
    return k >= lo && k <= hi;
  });
  return candidates[0] ?? null;
}

function normalizeHebrew(s: string): string {
  return s.trim().toLowerCase();
}

function filterDict(items: DictionaryItem[], q: string): DictionaryItem[] {
  const t = normalizeHebrew(q);
  if (!t) return items;
  return items.filter((d) => normalizeHebrew(d.food).includes(t));
}

function recalcAiMenuDraft(draft: NonNullable<AiMenuDraft>): NonNullable<AiMenuDraft> {
  return recalcAiDraftTotals(draft);
}

const choiceBtnClass =
  "rounded-xl border-2 px-4 py-3 text-center transition active:scale-[0.99] disabled:opacity-40";

function choiceStyle(active: boolean): CSSProperties {
  if (active) {
    return {
      borderColor: colors.cherry,
      backgroundColor: `${colors.accent}88`,
      color: colors.cherry,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    };
  }
  return {
    borderColor: colors.borderCherrySoft,
    backgroundColor: colors.white,
    color: colors.stemDeep,
  };
}

function ProgressBar({ step }: { step: number }) {
  const pct = (step / 5) * 100;
  return (
    <div className="mb-4">
      <p
        className={`mb-2 text-center ${typography.body} font-semibold`}
        style={{ color: colors.stemDeep }}
      >
        שלב {step} מתוך 5
      </p>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: `${colors.accent}` }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.cherry }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className={`${typography.hint} mt-1`} style={{ color: colors.grayHint }}>
      {children}
    </p>
  );
}

function StyledCheckbox({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition"
      style={{
        borderColor: checked ? colors.stem : colors.borderCherrySoft,
        backgroundColor: checked ? `${colors.stem}22` : colors.white,
      }}
    >
      {checked ? (
        <span className="text-sm font-black" style={{ color: colors.stem }}>
          ✓
        </span>
      ) : null}
    </button>
  );
}

export default function MenuBuilder() {
  const [pantryRev, setPantryRev] = useState(0);
  useEffect(() => {
    const bump = () => setPantryRev((x) => x + 1);
    window.addEventListener("cj-menu-builder-pantry-updated", bump);
    window.addEventListener("focus", bump);
    return () => {
      window.removeEventListener("cj-menu-builder-pantry-updated", bump);
      window.removeEventListener("focus", bump);
    };
  }, []);

  const fullDictionary = useMemo(() => {
    void pantryRev;
    return loadDictionary();
  }, 
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pantryRev מסנכרן אחרי עדכון מזווה
    [pantryRev],
  );

  const dictionary = useMemo(() => {
    void pantryRev;
    const all = loadDictionary();
    const ids = allPantryDictionaryIds(loadMenuBuilderPantryState());
    if (ids.length === 0) return all;
    const s = new Set(ids);
    return all.filter((d) => s.has(d.id));
  }, 
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pantryRev מסנכרן אחרי עדכון מזווה
    [pantryRev],
  );

  const pantryGate = useMemo(
    () => validatePantryState(loadMenuBuilderPantryState()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pantryRev מסנכרן אחרי עדכון מזווה
    [pantryRev],
  );

  const mealPresets = useMemo(() => loadMealPresets(), []);
  const presetMap = useMemo(
    () => new Map<string, MealPreset>(mealPresets.map((p) => [p.id, p])),
    [mealPresets],
  );
  const magicTimeoutRef = useRef<number | null>(null);

  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<"wizard" | "generating" | "result">("wizard");

  const [mealCount, setMealCount] = useState<number | null>(null);
  const gender = loadProfile().gender;
  const defaultCelebrationReserve = gender === "male" ? 1000 : 700;
  const [celebrationMode, setCelebrationMode] =
    useState<CelebrationMode>("home");
  const [reservedCelebrationKcal, setReservedCelebrationKcal] = useState(
    defaultCelebrationReserve,
  );
  const celebrationModeRef = useRef<CelebrationMode>("home");
  const [treatWanted, setTreatWanted] = useState<boolean | null>(null);
  const [treatSearch, setTreatSearch] = useState("");
  const [treatFood, setTreatFood] = useState<DictionaryItem | null>(null);
  const [treatGrams] = useState(100);

  const [pantrySearch, setPantrySearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** לפני בחירה ידנית — נתיב הפתעה או ידני */
  const [step4Phase, setStep4Phase] = useState<"route" | "pick">("route");
  /** קסם מהמזווה המלא (לא רק מה שנסמן להיום) */
  const [magicPoolFull, setMagicPoolFull] = useState(false);
  const [selectionResolved, setSelectionResolved] = useState<SelectionResolution>(
    {},
  );
  const [activeSelectionBlocker, setActiveSelectionBlocker] =
    useState<SelectionBlocker | null>(null);
  const [treatMealDialogFood, setTreatMealDialogFood] =
    useState<DictionaryItem | null>(null);
  const [treatMealSlotPick, setTreatMealSlotPick] = useState(0);
  const [coffeePickIdx, setCoffeePickIdx] = useState(0);

  const [trainingExtraKcal, setTrainingExtraKcal] = useState<number | null>(
    null,
  );
  const [trainingPickingType, setTrainingPickingType] = useState(false);

  const [meals, setMeals] = useState<MealPlan[] | null>(null);
  const [aiMenuDraft, setAiMenuDraft] = useState<AiMenuDraft>(null);
  const [calorieGapDismissed, setCalorieGapDismissed] = useState(false);
  const [calorieGapPickerOpen, setCalorieGapPickerOpen] = useState(false);
  const [calorieGapSearch, setCalorieGapSearch] = useState("");
  const [allocationWarnings, setAllocationWarnings] = useState<string[]>([]);
  const [aiSwapTarget, setAiSwapTarget] = useState<{ mealIndex: number; itemIndex: number } | null>(null);
  const [aiSwapSuggestion, setAiSwapSuggestion] = useState<NonNullable<NonNullable<AiMenuDraft>["meals"][number]["items"][number]> | null>(null);
  const [aiSwapSearch, setAiSwapSearch] = useState("");
  const [aiSwapLoading, setAiSwapLoading] = useState(false);

  const treatFiltered = useMemo(
    () => filterDict(dictionary, treatSearch).slice(0, 24),
    [dictionary, treatSearch],
  );

  const pantryDictionary = useMemo(() => {
    if (treatWanted === true && treatFood) {
      return dictionary.filter((d) => d.id !== treatFood.id);
    }
    return dictionary;
  }, [dictionary, treatWanted, treatFood]);

  const pantryFiltered = useMemo(
    () => filterDict(pantryDictionary, pantrySearch),
    [pantryDictionary, pantrySearch],
  );

  useEffect(() => {
    const prev = celebrationModeRef.current;
    if (celebrationMode !== "home" && prev === "home") {
      setReservedCelebrationKcal(defaultCelebrationReserve);
    }
    celebrationModeRef.current = celebrationMode;
  }, [celebrationMode, defaultCelebrationReserve]);

  useEffect(() => {
    if (treatWanted !== true || !treatFood) return;
    setSelectedIds((prev) => {
      if (!prev.has(treatFood.id)) return prev;
      const next = new Set(prev);
      next.delete(treatFood.id);
      return next;
    });
  }, [treatFood, treatWanted]);

  useEffect(() => {
    if (activeSelectionBlocker?.type === "coffee_slot") {
      setCoffeePickIdx(0);
    }
  }, [activeSelectionBlocker]);

  const groupedPantry = useMemo(() => {
    const map: Record<DictDominantMacro, DictionaryItem[]> = {
      protein: [],
      carbs: [],
      fat: [],
      neutral: [],
    };
    for (const d of pantryFiltered) {
      const dom = dominantDictMacro(
        d,
        presetForDictionaryItem(d, presetMap),
      );
      map[dom].push(d);
    }
    return map;
  }, [pantryFiltered, presetMap]);

  const calorieFloorProfile = gender === "male" ? 1500 : 1200;

  const dailyBudgetForCalorieGap = useMemo(() => {
    if (mealCount == null || trainingExtraKcal == null) return 0;
    const profile = loadProfile();
    let b = dailyCalorieTarget(profile) + trainingExtraKcal;
    if (celebrationMode !== "home") {
      b = Math.max(400, Math.round(b - reservedCelebrationKcal));
    }
    return b;
  }, [
    mealCount,
    trainingExtraKcal,
    celebrationMode,
    reservedCelebrationKcal,
  ]);

  const calorieGapDeficitFloor = useMemo(() => {
    if (phase !== "result" || !aiMenuDraft) return 0;
    const total = Math.round(Number(aiMenuDraft.totalCalories) || 0);
    return calorieFloorProfile - total;
  }, [phase, aiMenuDraft, calorieFloorProfile]);

  const calorieGapSuggestedFood = useMemo(() => {
    if (
      phase !== "result" ||
      !aiMenuDraft ||
      calorieGapDismissed ||
      calorieGapDeficitFloor <= 25
    )
      return null;
    return pickPantryFillCandidate(
      dictionary,
      aiMenuDraft,
      presetMap,
      calorieGapDeficitFloor,
    );
  }, [
    phase,
    aiMenuDraft,
    calorieGapDismissed,
    calorieGapDeficitFloor,
    dictionary,
    presetMap,
  ]);

  const showCalorieGapBanner =
    phase === "result" &&
    aiMenuDraft &&
    calorieGapDeficitFloor > 25 &&
    !calorieGapDismissed;

  const treatMealDialogLabels = useMemo(
    () => mealWizardLabels(mealCount ?? readStoredMenuMealCount() ?? 5),
    [mealCount],
  );

  const missingDominantMacroForWarn = useMemo(() => {
    const flags = { protein: false, carbs: false, fat: false };
    for (const d of fullDictionary) {
      const dom = dominantDictMacro(
        d,
        presetForDictionaryItem(d, presetMap),
      );
      if (dom === "protein" || dom === "carbs" || dom === "fat") {
        flags[dom] = true;
      }
    }
    const order: ("protein" | "carbs" | "fat")[] = [
      "protein",
      "carbs",
      "fat",
    ];
    return order.filter((m) => !flags[m]);
  }, [fullDictionary, presetMap]);

  const confirmTreatMealDialog = useCallback(() => {
    if (!treatMealDialogFood) return;
    const pantry = loadMenuBuilderPantryState();
    const next = assignTreatMealSlotsForDictionary(
      pantry,
      treatMealDialogFood.id,
      treatMealSlotPick,
      treatMealDialogFood,
    );
    saveMenuBuilderPantryState(next);
    setSelectedIds((prev) => new Set(prev).add(treatMealDialogFood.id));
    setTreatMealDialogFood(null);
    try {
      window.dispatchEvent(new Event("cj-menu-builder-pantry-updated"));
    } catch {
      /* ignore */
    }
  }, [treatMealDialogFood, treatMealSlotPick]);

  const cancelTreatMealDialog = useCallback(() => {
    setTreatMealDialogFood(null);
  }, []);

  const toggleId = useCallback(
    (id: string, on: boolean) => {
      if (!on) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return;
      }
      const pantry = loadMenuBuilderPantryState();
      const row = dictionary.find((d) => d.id === id);
      if (
        row &&
        needsTreatMealAssignmentForDictionary(pantry, id, row)
      ) {
        setTreatMealDialogFood(row);
        setTreatMealSlotPick(0);
        return;
      }
      setSelectedIds((prev) => new Set(prev).add(id));
    },
    [dictionary],
  );

  const selectAllVisible = useCallback(() => {
    const pantry = loadMenuBuilderPantryState();
    const allIds = pantryFiltered.map((d) => d.id);
    const allOn =
      allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOn) {
        for (const id of allIds) next.delete(id);
      } else {
        for (const d of pantryFiltered) {
          if (needsTreatMealAssignmentForDictionary(pantry, d.id, d)) continue;
          next.add(d.id);
        }
      }
      return next;
    });
  }, [pantryFiltered, selectedIds]);

  const canAdvanceFrom3 =
    treatWanted === false || (treatWanted === true && treatFood != null);
  const canAdvanceFrom4 =
    step4Phase === "route"
      ? false
      : step4Phase === "pick"
        ? selectedIds.size >= 1
        : false;

  const tryContinueStep4 = useCallback(() => {
    const sel = pantryDictionary.filter((d) => selectedIds.has(d.id));
    const remaining = computeSelectionBlockers(sel, presetMap, selectionResolved);
    if (remaining.length === 0) {
      setActiveSelectionBlocker(null);
      setStep(5);
      return;
    }
    setActiveSelectionBlocker(remaining[0]!);
  }, [pantryDictionary, selectedIds, presetMap, selectionResolved]);

  const applySelectionResolution = useCallback(
    (patch: Partial<SelectionResolution>) => {
      const next = { ...selectionResolved, ...patch };
      setSelectionResolved(next);
      const sel = pantryDictionary.filter((d) => selectedIds.has(d.id));
      const remaining = computeSelectionBlockers(sel, presetMap, next);
      if (remaining.length === 0) {
        setActiveSelectionBlocker(null);
        setStep(5);
      } else {
        setActiveSelectionBlocker(remaining[0]!);
      }
    },
    [selectionResolved, pantryDictionary, selectedIds, presetMap],
  );

  const handleWizardContinue = useCallback(() => {
    if (step === 1 && mealCount == null) return;
    if (step === 3 && celebrationMode === "home" && !canAdvanceFrom3) return;
    if (step === 4 && step4Phase === "route") return;

    if (step === 4 && step4Phase === "pick") {
      tryContinueStep4();
      return;
    }

    if (step === 3) {
      setSelectionResolved({});
      setActiveSelectionBlocker(null);
      setStep4Phase("route");
      setMagicPoolFull(false);
      setStep(4);
      return;
    }

    setStep((s) =>
      s === 2 && celebrationMode !== "home" ? 4 : Math.min(5, s + 1),
    );
  }, [
    step,
    mealCount,
    celebrationMode,
    canAdvanceFrom3,
    step4Phase,
    tryContinueStep4,
  ]);

  const [addingPantryKey, setAddingPantryKey] = useState<string | null>(null);

  const addAiSuggestedToPantry = useCallback(
    async (
      item: NonNullable<AiMenuDraft>["meals"][number]["items"][number],
      mealIdx: number,
      itemIdx: number,
    ) => {
      if (!item.isSuggested) return;
      const key = `${mealIdx}-${itemIdx}`;
      setAddingPantryKey(key);
      try {
        const params = new URLSearchParams({
          q: item.name.slice(0, 48),
          sort: "caloriesAsc",
          page: "1",
          pageSize: "30",
          pantry: "1",
        });
        const res = await fetch(`/api/food-explorer?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: Array<{
            id: string;
            name: string;
            calories: number;
            protein: number;
            fat: number;
            carbs: number;
            category: string;
          }>;
        };
        const rows = data.items ?? [];
        const row =
          rows.find((r) => r.name.trim() === item.name.trim()) ?? rows[0];
        if (!row) return;
        const dictItem = addExplorerFoodToDictionaryIfAbsent(row);
        const stepId = resolvePantryAtomicStepForFoodRow({
          category: row.category,
          name: row.name,
        });
        if (!stepId) return;
        const pantry = loadMenuBuilderPantryState();
        const exId = row.id;
        const list = pantry.explorerIdsByStep[stepId] ?? [];
        if (list.includes(exId)) {
          setPantryRev((x) => x + 1);
          return;
        }
        saveMenuBuilderPantryState({
          ...pantry,
          explorerIdsByStep: {
            ...pantry.explorerIdsByStep,
            [stepId]: [...list, exId],
          },
          dictionaryIdByExplorerId: {
            ...pantry.dictionaryIdByExplorerId,
            [exId]: dictItem.id,
          },
        });
        try {
          window.dispatchEvent(new Event("cj-menu-builder-pantry-updated"));
        } catch {
          /* ignore */
        }
        setPantryRev((x) => x + 1);
      } finally {
        setAddingPantryKey(null);
      }
    },
    [],
  );

  const runMagic = useCallback(() => {
    if (mealCount == null || trainingExtraKcal == null) return;
    if (magicTimeoutRef.current != null) {
      window.clearTimeout(magicTimeoutRef.current);
      magicTimeoutRef.current = null;
    }
    setPhase("generating");
    setAiMenuDraft(null);
    magicTimeoutRef.current = window.setTimeout(() => {
      magicTimeoutRef.current = null;
      const profile = loadProfile();
      let budget = dailyCalorieTarget(profile);
      budget += trainingExtraKcal;
      if (celebrationMode !== "home") {
        budget = Math.max(
          400,
          Math.round(budget - reservedCelebrationKcal),
        );
      }

      const pool = magicPoolFull
        ? dictionary
        : dictionary.filter((d) => selectedIds.has(d.id));
      const treat =
        treatWanted && treatFood
          ? { food: treatFood, grams: treatGrams }
          : null;

      const dictMap = new Map(dictionary.map((d) => [d.id, d]));
      const pantryLocks = buildPantryTreatLocksForMenu({
        pantry: loadMenuBuilderPantryState(),
        dictionaryById: dictMap,
        mealCount,
        storedMealCount: readStoredMenuMealCount(),
        grams: 100,
      });

      (async () => {
        try {
          const snapshot = {
            profile,
            mealCount,
            mealSlotLabels: mealWizardLabels(mealCount),
            calorieFloor: profile.gender === "male" ? 1500 : 1200,
            trainingExtraKcal,
            celebrationMode,
            reservedCelebrationKcal,
            calorieTarget: budget,
            treat,
            pantryLocks,
            dictionary: pool,
            dictionaryTimeHints: menuBuilderTimeHintSummary(pool),
            fullPantryMagic: magicPoolFull,
            selectionHints: {
              lunchAnchorFoodId: selectionResolved.lunchAnchorFoodId ?? undefined,
              starchAnchorFoodId: selectionResolved.starchAnchorFoodId ?? undefined,
              coffeeMealSlotLabel: selectionResolved.coffeeMealSlotLabel ?? undefined,
              lowProteinAcknowledged: selectionResolved.lowProteinAcknowledged ?? false,
            },
          };
          const lunchAnchorName = selectionResolved.lunchAnchorFoodId
            ? dictMap.get(selectionResolved.lunchAnchorFoodId)?.food ??
              selectionResolved.lunchAnchorFoodId
            : "";
          const starchAnchorName = selectionResolved.starchAnchorFoodId
            ? dictMap.get(selectionResolved.starchAnchorFoodId)?.food ??
              selectionResolved.starchAnchorFoodId
            : "";
          const message =
            (magicPoolFull
              ? `תחוללי לי תפריט יומי מושלם ל-${mealCount} ארוחות מהמזווה המלא — תפריט זהב (חלבון עוגן, פחמימה, ירקות, שומן בריא). יעד קלורי יומי: בערך ${Math.round(budget)} קל׳ לפי הפרופיל וההגדרות (snapshot.calorieTarget) — לא פחות מהמינימום לפי מין. אין חובה להשתמש בכל פריט ב-dictionary: בחרי בחירה מושכלת — מה שמתחבר קולינרית, משביע ונכנס במסגרת הקלוריות; מה שלא נכנס פשוט לא יופיע בתפריט ונשאר במזווה.`
              : `תחוללי לי תפריט יומי ל-${mealCount} ארוחות. ב-dictionary יש רק מה שהמשתמש סימן זמין להיום — זו בריכת מותר, לא רשימת חובה: בחרי תת־קבוצה טעימה ומאוזנת; אין צורך לכלול כל סימון. יעד קלורי יומי: בערך ${Math.round(budget)} קל׳ (snapshot.calorieTarget), לא פחות מהמינימום לפי מין בפרופיל.`) +
            (selectionResolved.lunchAnchorFoodId
              ? ` העדפת המשתמש לעוגן חלבון צהריים: «${lunchAnchorName}».`
              : "") +
            (selectionResolved.starchAnchorFoodId
              ? ` פחמימה עיקרית לצהריים: «${starchAnchorName}».`
              : "") +
            (selectionResolved.coffeeMealSlotLabel
              ? ` קפה לשלב בארוחה: «${selectionResolved.coffeeMealSlotLabel}».`
              : "");
          const res = await fetch("/api/ai-assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              history: [],
              snapshot,
              memory: {},
            }),
          });
          if (res.ok) {
            const json = (await res.json()) as {
              result?: { menuDraft?: AiMenuDraft };
              error?: string;
            };
            const md = json?.result?.menuDraft ?? null;
            if (md && typeof md.title === "string" && Array.isArray(md.meals) && md.meals.length > 0) {
              setAiMenuDraft(md);
              setCalorieGapDismissed(false);
              setMeals(null);
              setAllocationWarnings([]);
              setPhase("result");
              return;
            }
          }
        } catch {
          // fall through to local allocator
        }

        const { meals: plan, warnings } = allocateMeals(
          mealCount,
          budget,
          profile,
          trainingExtraKcal,
          treat,
          pool,
          presetMap,
          pantryLocks,
          celebrationMode !== "home",
        );
        setMeals(plan);
        setAllocationWarnings(warnings);
        setPhase("result");
      })();
    }, 1000);
  }, [
    mealCount,
    trainingExtraKcal,
    celebrationMode,
    reservedCelebrationKcal,
    dictionary,
    selectedIds,
    treatWanted,
    treatFood,
    treatGrams,
    presetMap,
    magicPoolFull,
    selectionResolved,
  ]);

  const swapLine = useCallback(
    (mealIndex: number, lineId: string) => {
      setMeals((prev) => {
        if (!prev) return prev;
        const next = prev.map((m) => ({
          ...m,
          lines: m.lines.map((l) => ({ ...l })),
        }));
        const line = next[mealIndex]?.lines.find((l) => l.id === lineId);
        if (!line) return prev;
        const sub = findSubstitute(line.food, dictionary, presetMap);
        if (!sub) return prev;
        const replacement = lineFromItem(sub, line.grams);
        replacement.id = `${sub.id}-${line.grams}-${Math.random().toString(36).slice(2, 7)}`;
        next[mealIndex].lines = next[mealIndex].lines.map((l) =>
          l.id === lineId ? replacement : l,
        );
        return next;
      });
    },
    [dictionary, presetMap],
  );

  useEffect(() => {
    if (step === 3 && celebrationMode !== "home") {
      setStep(4);
    }
  }, [step, celebrationMode]);

  useEffect(() => {
    if (celebrationMode !== "home") {
      setTreatWanted(null);
      setTreatFood(null);
      setTreatSearch("");
    }
  }, [celebrationMode]);

  useEffect(() => {
    const onHeaderBack = (e: Event) => {
      if (phase === "generating") {
        e.preventDefault();
        if (magicTimeoutRef.current != null) {
          window.clearTimeout(magicTimeoutRef.current);
          magicTimeoutRef.current = null;
        }
        setPhase("wizard");
        setStep(5);
        return;
      }
      if (phase === "result") {
        e.preventDefault();
        setPhase("wizard");
        setStep(5);
        setMeals(null);
        return;
      }
      if (step > 1) {
        e.preventDefault();
        if (step === 5) {
          setMagicPoolFull(false);
          setStep4Phase("route");
          setSelectionResolved({});
          setActiveSelectionBlocker(null);
        }
        if (step === 4 && step4Phase === "pick") {
          setStep4Phase("route");
          return;
        }
        setStep((s) =>
          s === 4 && celebrationMode !== "home" ? 2 : Math.max(1, s - 1),
        );
      }
    };
    window.addEventListener("cj-menu-builder-back", onHeaderBack);
    return () =>
      window.removeEventListener("cj-menu-builder-back", onHeaderBack);
  }, [phase, step, celebrationMode, step4Phase]);

  const rootFont = typography.familyFood;

  if (!pantryGate.ok) {
    return (
      <div
        className={`mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 pb-28 pt-10 ${rootFont}`}
        dir="rtl"
      >
        <p
          className="text-center text-lg font-extrabold leading-snug"
          style={{ color: colors.stemDeep }}
        >
          {pantryGate.message ??
            gf(
              gender,
              "כדי לבנות תפריט מאוזן יש למלא את המזווה לפי הקטגוריות",
              "כדי לבנות תפריט מאוזן יש למלא את המזווה לפי הקטגוריות",
            )}
        </p>
        <Link
          href="/menu-builder/pantry"
          className="btn-stem mt-8 w-full max-w-sm rounded-2xl py-4 text-center text-base font-extrabold text-white shadow-md transition hover:brightness-105 active:scale-[0.99]"
        >
          למזווה לבניית תפריט
        </Link>
      </div>
    );
  }

  if (dictionary.length < 12) {
    return (
      <div
        className={`mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 pb-28 pt-10 ${rootFont}`}
        dir="rtl"
      >
        <p
          className="text-center text-lg font-extrabold leading-snug"
          style={{ color: colors.stemDeep }}
        >
          {gf(
            gender,
            "אין מספיק מוצרים מהמזווה — חזרי למלא או בחרי עוד פריטים",
            "אין מספיק מוצרים מהמזווה — חזרה למלא או בחר עוד פריטים",
          )}
        </p>
        <Link
          href="/menu-builder/pantry"
          className="btn-stem mt-8 w-full max-w-sm rounded-2xl py-4 text-center text-base font-extrabold text-white shadow-md transition hover:brightness-105 active:scale-[0.99]"
        >
          למזווה
        </Link>
      </div>
    );
  }

  if (phase === "generating") {
    return (
      <div
        className={`mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 ${rootFont}`}
        dir="rtl"
      >
        <motion.div
          className="h-14 w-14 rounded-full border-4 border-t-transparent"
          style={{ borderColor: colors.cherry }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
        />
        <p className="mt-4 text-base font-semibold" style={{ color: colors.stemDeep }}>
          מחוללים קסם קלורי…
        </p>
      </div>
    );
  }

  if (phase === "result" && aiMenuDraft) {
    const menuTotalKcal = Math.round(Number(aiMenuDraft.totalCalories) || 0);
    return (
      <>
      <div className={`mx-auto max-w-lg px-4 pb-28 pt-4 ${rootFont}`} dir="rtl">
        <div
          className={`mb-4 flex flex-row items-center justify-between gap-2 ${typography.stepTitle}`}
          style={{ color: colors.cherry }}
        >
          <h2 className="m-0 text-end font-extrabold leading-tight sm:text-xl">
            {aiMenuDraft.title || "התפריט שלך להיום"}
          </h2>
          <span className="shrink-0 tabular-nums font-extrabold" dir="ltr">
            {menuTotalKcal} קל׳
          </span>
        </div>
        {showCalorieGapBanner ? (
          <div
            className="mb-4 rounded-2xl border-2 p-4 shadow-sm"
            style={{
              borderColor: colors.cherry,
              backgroundColor: `${colors.cherry}14`,
            }}
          >
            <p className="m-0 font-extrabold text-[var(--stem-deep)]">
              התפריט מתחת למינימום המומלץ ({calorieFloorProfile} קל׳ לפי מין)
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-800">
              נוכחי: {menuTotalKcal} קל׳ · חסר בערך{" "}
              {Math.max(0, Math.round(calorieGapDeficitFloor))} קל׳ כדי להגיע
              למינימום.
            </p>
            {calorieGapSuggestedFood ? (
              <p className="mt-2 text-sm text-gray-700">
                הצעה מהמזווה:{" "}
                <span className="font-bold">{calorieGapSuggestedFood.food}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-700">
                לא נמצאה הצעה אוטומטית — אפשר לבחור מוצר מהמזווה מהרשימה.
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              {calorieGapSuggestedFood && mealCount != null && dailyBudgetForCalorieGap > 0 ? (
                <button
                  type="button"
                  className="rounded-xl py-3 font-extrabold text-white"
                  style={{ backgroundColor: colors.stem }}
                  onClick={() => {
                    setAiMenuDraft((prev) => {
                      if (
                        !prev ||
                        mealCount == null ||
                        dailyBudgetForCalorieGap < 1 ||
                        !calorieGapSuggestedFood
                      )
                        return prev;
                      return recalcAiMenuDraft(
                        appendCalorieGapLineToDraft(prev, calorieGapSuggestedFood, {
                          deficitKcal: Math.max(
                            80,
                            Math.round(calorieGapDeficitFloor),
                          ),
                          mealCount,
                          dailyBudgetKcal: dailyBudgetForCalorieGap,
                          presetMap,
                        }),
                      );
                    });
                  }}
                >
                  הוסף את ההצעה לתפריט
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border-2 py-3 font-extrabold"
                style={{
                  borderColor: colors.stemDeep,
                  color: colors.stemDeep,
                }}
                onClick={() => {
                  setCalorieGapSearch("");
                  setCalorieGapPickerOpen(true);
                }}
              >
                בחר מוצר אחר מהמזווה
              </button>
              <button
                type="button"
                className="rounded-xl border-2 py-2.5 text-sm font-bold text-gray-700"
                style={{ borderColor: colors.borderCherrySoft }}
                onClick={() => setCalorieGapDismissed(true)}
              >
                לא עכשיו
              </button>
            </div>
          </div>
        ) : null}
        <div className="space-y-4">
          {aiMenuDraft.meals.map((meal, mi) => (
            <div
              key={`${meal.name}-${mi}`}
              className="rounded-2xl border-2 p-3 shadow-sm"
              style={{
                borderColor: colors.borderCherrySoft,
                backgroundColor: colors.white,
              }}
            >
              <div className="mb-2 flex flex-row items-center justify-between gap-2 border-b pb-2 text-base font-extrabold text-[var(--stem-deep)]">
                <span>{meal.name}</span>
                <span className="tabular-nums" dir="ltr">
                  {Math.round(Number(meal.calories) || 0)} קל׳
                </span>
              </div>
              <ul className="space-y-3">
                {meal.items.map((it, ii) => (
                  <li
                    key={`${it.name}-${ii}`}
                    className="flex flex-wrap items-start justify-between gap-2 border-b border-dashed pb-2 last:border-b-0"
                    style={{ borderColor: colors.borderCherrySoft }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[var(--text,#333)]">
                        {it.isSuggested ? `✨ ${it.name}` : it.name}
                      </p>
                      {it.description ? (
                        <p className="mt-0.5 text-xs text-gray-600">{it.description}</p>
                      ) : null}
                      <p className="text-sm text-gray-600">
                        {it.estimatedGrams != null && it.estimatedGrams > 0
                          ? `${Math.round(it.estimatedGrams)} ג׳ · ${it.portionLabel}`
                          : it.portionLabel}
                      </p>
                      <p className="mt-1 text-xs font-semibold">
                        <span style={{ color: colors.macroProtein }}>
                          ח׳ {Math.round(Number(it.protein) || 0)}
                        </span>
                        {" · "}
                        <span style={{ color: colors.macroFat }}>
                          ש׳ {Math.round(Number(it.fat) || 0)}
                        </span>
                        {" · "}
                        <span style={{ color: colors.macroCarbs }}>
                          פ׳ {Math.round(Number(it.carbs) || 0)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-sm font-extrabold tabular-nums" dir="ltr">
                        {Math.round(Number(it.calories) || 0)} קל׳
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {it.isSuggested ? (
                          <button
                            type="button"
                            className="rounded-xl border-2 px-3 py-1.5 text-xs font-extrabold transition hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50"
                            style={{
                              borderColor: colors.stem,
                              color: colors.stemDeep,
                            }}
                            disabled={addingPantryKey === `${mi}-${ii}`}
                            onClick={() => void addAiSuggestedToPantry(it, mi, ii)}
                          >
                            {addingPantryKey === `${mi}-${ii}`
                              ? "מוסיף…"
                              : "הוסף למזווה"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-xl border-2 bg-white p-2 transition hover:bg-gray-50 active:scale-95"
                          style={{
                            borderColor: colors.borderCherrySoft,
                            color: colors.stem,
                          }}
                          aria-label="החלפה חכמה"
                          onClick={() => {
                            setAiSwapTarget({ mealIndex: mi, itemIndex: ii });
                            setAiSwapSuggestion(null);
                            setAiSwapSearch("");
                          }}
                        >
                          <RefreshCw className="h-5 w-5" strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {calorieGapPickerOpen && aiMenuDraft ? (
        <div
          className="fixed inset-0 z-[7080] flex items-center justify-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <p className="font-extrabold text-[var(--stem-deep)]">
              בחר מוצר מהמזווה להשלמת קלוריות
            </p>
            <p className="mt-1 text-xs text-gray-600">
              יתווסף לארוחה עם הכי הרבה מקום יחסי ליעד המשבצת.
            </p>
            <input
              type="search"
              value={calorieGapSearch}
              onChange={(e) => setCalorieGapSearch(e.target.value)}
              placeholder="חיפוש…"
              className="mt-3 w-full rounded-xl border-2 px-3 py-2 text-sm"
              style={{ borderColor: colors.borderCherrySoft }}
            />
            <ul
              className="mt-2 max-h-64 overflow-auto rounded-lg border text-start"
              style={{ borderColor: colors.borderCherrySoft }}
            >
              {rankDictionaryByQuery(
                dictionary.filter((d) => {
                  const used = new Set(
                    aiMenuDraft.meals.flatMap((m) =>
                      m.items.map((it) => normalizeHebrew(it.name)),
                    ),
                  );
                  return !used.has(normalizeHebrew(d.food));
                }),
                calorieGapSearch,
              )
                .slice(0, 120)
                .map((d) => (
                  <li key={`gap-pick-${d.id}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => {
                        setAiMenuDraft((prev) => {
                          if (
                            !prev ||
                            mealCount == null ||
                            dailyBudgetForCalorieGap < 1
                          )
                            return prev;
                          const deficit = Math.max(
                            80,
                            calorieFloorProfile -
                              Math.round(Number(prev.totalCalories) || 0),
                          );
                          return recalcAiMenuDraft(
                            appendCalorieGapLineToDraft(prev, d, {
                              deficitKcal: deficit,
                              mealCount,
                              dailyBudgetKcal: dailyBudgetForCalorieGap,
                              presetMap,
                            }),
                          );
                        });
                        setCalorieGapPickerOpen(false);
                        setCalorieGapSearch("");
                      }}
                    >
                      <span className="font-semibold">{d.food}</span>
                      <span className="text-xs text-gray-600">
                        {macroKcal100(d)} קל׳ ל־100ג׳
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border-2 py-2 font-bold"
              style={{ borderColor: colors.borderCherrySoft }}
              onClick={() => {
                setCalorieGapPickerOpen(false);
                setCalorieGapSearch("");
              }}
            >
              סגור
            </button>
          </div>
        </div>
      ) : null}

      {aiSwapTarget ? (
        <div
          className="fixed inset-0 z-[7100] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <p className="font-extrabold text-[var(--stem-deep)]">החלפה חכמה</p>
            <p className="mt-1 text-sm text-gray-600">
              פריט: «{aiMenuDraft.meals[aiSwapTarget.mealIndex]?.items[aiSwapTarget.itemIndex]?.name ?? ""}»
            </p>

            <div className="mt-3 space-y-2">
              <button
                type="button"
                className="w-full rounded-xl py-2 font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: colors.cherry }}
                disabled={aiSwapLoading}
                onClick={async () => {
                  try {
                    setAiSwapLoading(true);
                    setAiSwapSuggestion(null);
                    const m = aiMenuDraft.meals[aiSwapTarget.mealIndex];
                    const it = m?.items[aiSwapTarget.itemIndex];
                    if (!m || !it) return;
                    const poolAll = dictionary;
                    const res = await fetch("/api/ai-menu-swap", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        current: it,
                        mealName: m.name,
                        pool: poolAll.map((d) => d.food),
                      }),
                    });
                    const json = (await res.json()) as { item?: typeof it | null };
                    if (json?.item && typeof json.item.name === "string") {
                      setAiSwapSuggestion(json.item);
                    }
                  } finally {
                    setAiSwapLoading(false);
                  }
                }}
              >
                הצעת החלפה של ה‑AI
              </button>

              {aiSwapSuggestion ? (
                <div
                  className="rounded-xl border-2 p-3 text-sm"
                  style={{ borderColor: colors.borderCherrySoft, backgroundColor: colors.white }}
                >
                  <p className="font-extrabold" style={{ color: colors.stemDeep }}>
                    הצעה: {aiSwapSuggestion.name}
                  </p>
                  <p className="text-gray-600">
                    {aiSwapSuggestion.estimatedGrams != null && aiSwapSuggestion.estimatedGrams > 0
                      ? `${Math.round(aiSwapSuggestion.estimatedGrams)} ג׳ · ${aiSwapSuggestion.portionLabel}`
                      : aiSwapSuggestion.portionLabel}
                  </p>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-xl py-2 font-bold text-white"
                    style={{ backgroundColor: colors.stem }}
                    onClick={() => {
                      setAiMenuDraft((prev) => {
                        if (!prev) return prev;
                        const mi = aiSwapTarget.mealIndex;
                        const ii = aiSwapTarget.itemIndex;
                        const meal = prev.meals[mi];
                        const oldIt = meal?.items[ii];
                        if (!meal || !oldIt || !aiSwapSuggestion) return prev;
                        const oldCal = Number(oldIt.calories) || 0;
                        const cleaned = {
                          ...aiSwapSuggestion,
                          description: undefined,
                        };
                        const newCal = Number(cleaned.calories) || 0;
                        const deficit = oldCal - newCal;
                        let items = meal.items.map((x, j) =>
                          j === ii ? cleaned : { ...x },
                        );
                        if (deficit > 5) {
                          items = redistributeMealCalorieDeficit(
                            items,
                            ii,
                            deficit,
                            dictionary,
                            presetMap,
                          );
                        }
                        const next = {
                          ...prev,
                          meals: prev.meals.map((mm, idx) =>
                            idx !== mi ? mm : { ...mm, items },
                          ),
                        };
                        return recalcAiMenuDraft(next);
                      });
                      setAiSwapTarget(null);
                      setAiSwapSuggestion(null);
                      setAiSwapSearch("");
                    }}
                  >
                    החליפי לזה
                  </button>
                </div>
              ) : null}

              <div
                className="rounded-xl border-2 p-3"
                style={{ borderColor: colors.borderCherrySoft }}
              >
                <p className="text-sm font-extrabold" style={{ color: colors.stemDeep }}>
                  או לבחור מהמילון
                </p>
                <input
                  type="search"
                  value={aiSwapSearch}
                  onChange={(e) => setAiSwapSearch(e.target.value)}
                  placeholder="חיפוש במילון…"
                  className="mt-2 w-full rounded-xl border-2 px-3 py-2 text-sm"
                  style={{ borderColor: colors.borderCherrySoft }}
                />
                <ul
                  className="mt-2 max-h-56 overflow-auto rounded-lg border"
                  style={{ borderColor: colors.borderCherrySoft }}
                >
                  {rankDictionaryByQuery(dictionary, aiSwapSearch)
                    .slice(0, 150)
                    .map((d) => (
                      <li key={`swap-pick-${d.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-gray-50"
                          onClick={() => {
                            setAiMenuDraft((prev) => {
                              if (!prev) return prev;
                              const mi = aiSwapTarget.mealIndex;
                              const ii = aiSwapTarget.itemIndex;
                              const m = prev.meals[mi];
                              if (!m) return prev;
                              const newItems = applyDictionarySwapInMeal({
                                mealItems: m.items,
                                itemIndex: ii,
                                food: d,
                                dictionary,
                                presetMap,
                              });
                              const next = {
                                ...prev,
                                meals: prev.meals.map((mm, idx) =>
                                  idx !== mi ? mm : { ...mm, items: newItems },
                                ),
                              };
                              return recalcAiMenuDraft(next);
                            });
                            setAiSwapTarget(null);
                            setAiSwapSuggestion(null);
                            setAiSwapSearch("");
                          }}
                        >
                          <span className="font-semibold">{d.food}</span>
                          <span className="text-xs text-gray-600">{macroKcal100(d)} קל׳ ל־100ג׳</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border-2 py-2 font-bold"
                style={{ borderColor: colors.borderCherrySoft }}
                onClick={() => {
                  setAiSwapTarget(null);
                  setAiSwapSuggestion(null);
                  setAiSwapSearch("");
                }}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
    );
  }

  if (phase === "result" && meals) {
    const menuTotalKcal = meals.reduce(
      (t, m) => t + m.lines.reduce((s, l) => s + l.calories, 0),
      0,
    );
    return (
      <div className={`mx-auto max-w-lg px-4 pb-28 pt-4 ${rootFont}`} dir="rtl">
        <div
          className={`mb-4 flex flex-row items-center justify-between gap-2 ${typography.stepTitle}`}
          style={{ color: colors.cherry }}
        >
          <h2 className="m-0 text-end font-extrabold leading-tight sm:text-xl">
            התפריט שלך להיום
          </h2>
          <span className="shrink-0 tabular-nums font-extrabold" dir="ltr">
            {menuTotalKcal} קל׳
          </span>
        </div>
        {allocationWarnings.length > 0 ? (
          <div
            className="mb-4 rounded-2xl border-2 px-3 py-3 text-sm font-semibold leading-snug"
            style={{
              borderColor: colors.borderCherrySoft,
              backgroundColor: colors.white,
              color: colors.stemDeep,
            }}
          >
            <p className="m-0 mb-2 font-extrabold">הערות לתפריט</p>
            <ul className="m-0 list-disc space-y-1 ps-5">
              {allocationWarnings.map((w, i) => (
                <li key={`allocation-warn-${i}`}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="space-y-4">
          {meals.map((meal, mi) => {
            const mealTotalKcal = meal.lines.reduce((s, l) => s + l.calories, 0);
            const mealHeaderClass =
              "text-base font-extrabold text-[var(--stem-deep)]";
            return (
            <div
              key={meal.title}
              className="rounded-2xl border-2 p-3 shadow-sm"
              style={{
                borderColor: colors.borderCherrySoft,
                backgroundColor: colors.white,
              }}
            >
              <div
                className={`mb-2 flex flex-row items-center justify-between gap-2 border-b pb-2 ${mealHeaderClass}`}
              >
                <span>{meal.title}</span>
                <span className="tabular-nums" dir="ltr">
                  {mealTotalKcal} קל׳
                </span>
              </div>
              <ul className="space-y-3">
                {meal.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-start justify-between gap-2 border-b border-dashed pb-2 last:border-b-0"
                    style={{ borderColor: colors.borderCherrySoft }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[var(--text,#333)]">{line.food.food}</p>
                      <p className="text-sm text-gray-600">
                        {line.grams} ג׳ · {line.calories} קל׳
                      </p>
                      <p className="mt-1 text-xs font-semibold">
                        <span style={{ color: colors.macroProtein }}>ח׳ {line.proteinG}ג׳</span>
                        {" · "}
                        <span style={{ color: colors.macroFat }}>ש׳ {line.fatG}ג׳</span>
                        {" · "}
                        <span style={{ color: colors.macroCarbs }}>פ׳ {line.carbsG}ג׳</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border-2 bg-white p-2 transition hover:bg-gray-50 active:scale-95"
                      style={{ borderColor: colors.borderCherrySoft, color: colors.stem }}
                      aria-label="החלפה חכמה"
                      onClick={() => swapLine(mi, line.id)}
                    >
                      <RefreshCw className="h-5 w-5" strokeWidth={2.2} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            );
          })}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border-2 py-3 ${typography.buttonLabel}`}
            style={{ borderColor: colors.stem, color: colors.stemDeep, backgroundColor: colors.white }}
            onClick={() => window.alert("שמירת תפריט — יחובר בהמשך")}
          >
            שמור תפריט
          </button>
          <button
            type="button"
            className={`rounded-xl border-2 py-3 ${typography.buttonLabel} text-white`}
            style={{ borderColor: colors.stemDeep, backgroundColor: colors.stem }}
            onClick={() => window.alert("העברה ליומן — יחובר בהמשך")}
          >
            העבר ליומן
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-lg px-4 pb-28 pt-4 ${rootFont}`} dir="rtl">
      {phase === "wizard" && missingDominantMacroForWarn.length > 0 ? (
        <div
          className="mb-4 space-y-2 rounded-xl border-2 bg-white/95 p-3"
          style={{
            borderColor: "color-mix(in srgb, var(--cherry) 40%, var(--border-cherry-soft))",
            color: "var(--cherry)",
          }}
        >
          {missingDominantMacroForWarn.map((m) => (
            <p key={m} className="text-sm font-bold leading-snug">
              {m === "protein"
                ? gf(
                    gender,
                    "שימי לב – אין מוצרי חלבון במילון שלך! התפריט עלול להיות לא מאוזן 💪",
                    "שים לב – אין מוצרי חלבון במילון שלך! התפריט עלול להיות לא מאוזן 💪",
                  )
                : m === "carbs"
                  ? gf(
                      gender,
                      "שימי לב – אין מוצרי פחמימה במילון שלך! התפריט עלול להיות לא מאוזן ⚡",
                      "שים לב – אין מוצרי פחמימה במילון שלך! התפריט עלול להיות לא מאוזן ⚡",
                    )
                  : gf(
                      gender,
                      "שימי לב – אין מוצרי שומן במילון שלך! התפריט עלול להיות לא מאוזן 🫒",
                      "שים לב – אין מוצרי שומן במילון שלך! התפריט עלול להיות לא מאוזן 🫒",
                    )}
            </p>
          ))}
        </div>
      ) : null}

      {step >= 1 && step <= 5 ? <ProgressBar step={step} /> : null}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.15 }}
        >
          {step === 1 ? (
            <section>
              <h2 className={typography.stepTitle}>כמה ארוחות את מתכננת לאכול היום?</h2>
              <Hint>אפשר לשנות בהמשך</Hint>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${choiceBtnClass} hover:opacity-95`}
                    style={choiceStyle(mealCount === n)}
                    onClick={() => {
                      setMealCount(n);
                      writeStoredMenuMealCount(n);
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h2 className={typography.stepTitle}>
                {gf(
                  gender,
                  "מתכננת חגיגה היום? 🎉",
                  "מתכנן חגיגה היום? 🎉",
                )}
              </h2>
              <Hint>
                {gf(
                  gender,
                  "סמני אם מתוכננת ארוחה בחוץ, ואנחנו נדאג לאזן את שאר היום בשבילך",
                  "סמן אם מתוכנן לך ארוחה בחוץ, ואנחנו נדאג לאזן את שאר היום בשבילך",
                )}
              </Hint>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: "home" as const,
                      emoji: "🏠",
                      label: gf(
                        gender,
                        "היום אוכלת רק בבית",
                        "היום אוכל רק בבית",
                      ),
                    },
                    {
                      id: "family" as const,
                      emoji: "🎂",
                      label: "אירוע משפחתי / יום הולדת",
                    },
                    {
                      id: "restaurant_out" as const,
                      emoji: "🍽️",
                      label: "מסעדה / יציאה בערב",
                    },
                    {
                      id: "delivery" as const,
                      emoji: "🛵",
                      label: "משלוח / Takeaway",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${choiceBtnClass} flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 px-2 py-3 hover:opacity-95`}
                    style={choiceStyle(celebrationMode === opt.id)}
                    onClick={() => setCelebrationMode(opt.id)}
                  >
                    <span className="text-2xl leading-none" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="text-xs font-extrabold leading-snug sm:text-sm">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
              {celebrationMode !== "home" ? (
                <div className="mt-4 space-y-3 rounded-xl border-2 p-3" style={{ borderColor: colors.borderCherrySoft }}>
                  <p className={`${typography.hint} font-semibold text-[var(--text,#333)]`}>
                    {gf(
                      gender,
                      "מעריכה שהארוחה תעלה יותר או פחות? שנו את הכמות כאן:",
                      "מעריך שהארוחה תעלה יותר או פחות? שנה את הכמות כאן:",
                    )}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="range"
                      min={300}
                      max={2500}
                      step={25}
                      value={Math.min(2500, Math.max(300, reservedCelebrationKcal))}
                      onChange={(e) =>
                        setReservedCelebrationKcal(Number(e.target.value) || 0)
                      }
                      className="min-h-[44px] w-full flex-1 accent-[var(--cherry)]"
                      aria-label={gf(
                        gender,
                        "הערכת קלוריות לארוחת החוץ",
                        "הערכת קלוריות לארוחת החוץ",
                      )}
                    />
                    <label className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--stem-deep)]">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={200}
                        max={4000}
                        value={reservedCelebrationKcal}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isFinite(n)) return;
                          setReservedCelebrationKcal(
                            Math.min(4000, Math.max(200, n)),
                          );
                        }}
                        className="w-24 rounded-lg border-2 px-2 py-2 text-center tabular-nums"
                        style={{ borderColor: colors.borderCherrySoft }}
                      />
                      <span className="whitespace-nowrap">קל׳</span>
                    </label>
                  </div>
                  <p
                    className="text-sm font-bold leading-snug"
                    style={{ color: "var(--cherry)" }}
                  >
                    {gf(
                      gender,
                      `תהני! שמרנו לך ${reservedCelebrationKcal} קלוריות לארוחה – שאר הארוחות היום יהיו קלילות יותר כדי שתישארי ביעד 💪`,
                      `תהנה! שמרנו לך ${reservedCelebrationKcal} קלוריות לארוחה – שאר הארוחות היום יהיו קלילות יותר כדי שתישאר ביעד 💪`,
                    )}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 3 && celebrationMode === "home" ? (
            <section>
              <h2 className={typography.stepTitle}>יש משהו שאת חייבת לאכול היום? 😋</h2>
              <Hint>פינוק, מנה אהובה, או משהו שכבר מתוכנן</Hint>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className={`${choiceBtnClass} flex-1 hover:opacity-95`}
                  style={choiceStyle(treatWanted === false)}
                  onClick={() => {
                    setTreatWanted(false);
                    setTreatFood(null);
                  }}
                >
                  לא
                </button>
                <button
                  type="button"
                  className={`${choiceBtnClass} flex-1 hover:opacity-95`}
                  style={choiceStyle(treatWanted === true)}
                  onClick={() => setTreatWanted(true)}
                >
                  כן
                </button>
              </div>
              {treatWanted === true ? (
                <div className="mt-4 rounded-xl border-2 p-3" style={{ borderColor: colors.borderCherrySoft }}>
                  <p className="mb-2 text-sm font-bold" style={{ color: colors.stemDeep }}>
                    חיפוש במילון האישי — הקלוריות של הפינוק ננעלות לפי הבחירה
                  </p>
                  <input
                    type="search"
                    value={treatSearch}
                    onChange={(e) => setTreatSearch(e.target.value)}
                    placeholder="חפשי מזון…"
                    className="mb-2 w-full rounded-xl border-2 px-3 py-2 text-sm"
                    style={{ borderColor: colors.borderCherrySoft }}
                  />
                  <ul className="max-h-48 overflow-auto rounded-lg border" style={{ borderColor: colors.borderCherrySoft }}>
                    {treatFiltered.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-gray-50"
                          onClick={() => setTreatFood(d)}
                        >
                          <span className="font-semibold">{d.food}</span>
                          <span className="text-xs text-gray-600">{macroKcal100(d)} קל׳ ל־100ג׳</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {treatFood ? (
                    <p className="mt-2 text-sm font-bold" style={{ color: colors.cherry }}>
                      נבחר: {treatFood.food} · {treatGrams}ג׳ ·{" "}
                      {lineFromItem(treatFood, treatGrams).calories} קל׳ נעולות לפינוק
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 4 && step4Phase === "route" ? (
            <section className="space-y-4">
              <h2 className={typography.stepTitle}>איך נבנה את התפריט להיום?</h2>
              <p className={`${typography.body} font-semibold text-[var(--stem-deep)]`}>
                {gf(
                  gender,
                  "בחרי אם להפתיע אותך מתפריט מושלם מהמזווה, או לסמן בעצמך מה זמין לך היום.",
                  "בחר אם להפתיע אותך מתפריט מושלם מהמזווה, או לסמן בעצמך מה זמין לך היום.",
                )}
              </p>
              <button
                type="button"
                className={`w-full rounded-2xl border-2 px-4 py-5 text-center shadow-sm transition active:scale-[0.99] ${typography.buttonLabel}`}
                style={{
                  borderColor: colors.cherry,
                  backgroundColor: `${colors.cherry}18`,
                  color: colors.stemDeep,
                }}
                onClick={() => {
                  setMagicPoolFull(true);
                  setSelectionResolved({});
                  setActiveSelectionBlocker(null);
                  setStep(5);
                }}
              >
                {gf(
                  gender,
                  "✨ הפתיעי אותי (בני לי תפריט מושלם מהמזווה)",
                  "✨ הפתיעי אותי (בנה לי תפריט מושלם מהמזווה)",
                )}
              </button>
              <button
                type="button"
                className={`w-full rounded-2xl border-2 px-4 py-5 text-center shadow-sm transition active:scale-[0.99] ${typography.buttonLabel}`}
                style={{
                  borderColor: colors.stem,
                  backgroundColor: colors.white,
                  color: colors.stemDeep,
                }}
                onClick={() => {
                  setMagicPoolFull(false);
                  setSelectionResolved({});
                  setActiveSelectionBlocker(null);
                  setStep4Phase("pick");
                }}
              >
                🔍 אני אבחר את המזונות להיום
              </button>
            </section>
          ) : null}

          {step === 4 && step4Phase === "pick" ? (
            <section>
              <h2 className={typography.stepTitle}>מה זמין לך היום ובא לך לאכול?</h2>
              <Hint>סמני את מה שיש לך במקרר או שבא לך עליו</Hint>
              <Hint>
                {gf(
                  gender,
                  "כל מה שנשמר במזווה מופיע כאן — סמני מה רלוונטי להיום. לחטיפים, גלידות, מאפים, אלכוהול ולכל מוצר מקטגוריית «לפי מנה» במאגר: כשתסמני פריט יופיע שאילת באיזו ארוחה לשבץ את המנה (רק בשלב הזה).",
                  "כל מה שנשמר במזווה מופיע כאן — סמן מה רלוונטי להיום. לחטיפים, גלידות, מאפים, אלכוהול ולכל מוצר מקטגוריית «לפי מנה» במאגר: כשתסמן פריט יופיע שאילת באיזו ארוחה לשבץ את המנה (רק בשלב הזה).",
                )}
              </Hint>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={pantrySearch}
                  onChange={(e) => setPantrySearch(e.target.value)}
                  placeholder="חיפוש…"
                  className="min-w-0 flex-1 rounded-xl border-2 px-3 py-2 text-sm"
                  style={{ borderColor: colors.borderCherrySoft }}
                />
                <button
                  type="button"
                  className={`rounded-xl border-2 px-3 py-2 ${typography.buttonLabel}`}
                  style={{ borderColor: colors.stem, color: colors.stemDeep }}
                  onClick={selectAllVisible}
                >
                  בחר הכל
                </button>
              </div>
              <div className="mt-4 space-y-4">
                {PANTRY_GROUP_ORDER.map((g) => {
                  const items = groupedPantry[g];
                  if (items.length === 0) return null;
                  const meta = PANTRY_GROUP_META[g];
                  return (
                    <div
                      key={g}
                      className="rounded-xl border-2 p-2"
                      style={{ borderColor: colors.borderCherrySoft, backgroundColor: `${colors.accent}22` }}
                    >
                      <p
                        className="mb-2 flex items-center gap-2 font-extrabold"
                        style={{ color: colors.stemDeep }}
                      >
                        <DictDominantMacroGlyph kind={g} />
                        {meta.label}
                      </p>
                      <ul className="space-y-2">
                        {items.map((d) => {
                          const on = selectedIds.has(d.id);
                          return (
                            <li key={d.id} className="flex items-center gap-2 rounded-lg bg-white/90 px-2 py-1.5">
                              <StyledCheckbox
                                id={`pantry-${d.id}`}
                                checked={on}
                                onChange={(v) => toggleId(d.id, v)}
                              />
                              <label htmlFor={`pantry-${d.id}`} className="min-w-0 flex-1 cursor-pointer text-sm font-semibold">
                                {d.food}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 5 ? (
            <section>
              <h2 className={typography.stepTitle}>
                מתוכנן אימון היום? 💪
              </h2>
              {!trainingPickingType ? (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className={`${choiceBtnClass} flex-1 hover:opacity-95`}
                    style={choiceStyle(
                      trainingExtraKcal !== null && trainingExtraKcal === 0,
                    )}
                    onClick={() => {
                      setTrainingExtraKcal(0);
                      setTrainingPickingType(false);
                    }}
                  >
                    לא
                  </button>
                  <button
                    type="button"
                    className={`${choiceBtnClass} flex-1 hover:opacity-95`}
                    style={choiceStyle(
                      trainingExtraKcal !== null && trainingExtraKcal > 0,
                    )}
                    onClick={() => {
                      setTrainingPickingType(true);
                      setTrainingExtraKcal(null);
                    }}
                  >
                    כן
                  </button>
                </div>
              ) : null}
              {trainingPickingType ||
              (!trainingPickingType &&
                trainingExtraKcal !== null &&
                trainingExtraKcal > 0) ? (
                <div className="mt-4 space-y-3">
                  {trainingPickingType ? (
                    <button
                      type="button"
                      className="text-sm font-bold underline-offset-2 hover:underline"
                      style={{ color: colors.stemDeep }}
                      onClick={() => setTrainingPickingType(false)}
                    >
                      חזרה
                    </button>
                  ) : null}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {TRAINING_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.kcal}
                        type="button"
                        className={`${choiceBtnClass} flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 px-2 py-3 hover:opacity-95`}
                        style={choiceStyle(trainingExtraKcal === opt.kcal)}
                        onClick={() => {
                          setTrainingExtraKcal(opt.kcal);
                          setTrainingPickingType(false);
                        }}
                      >
                        <span className="text-2xl leading-none" aria-hidden>
                          {opt.emoji}
                        </span>
                        <span className="text-center text-xs font-extrabold leading-snug sm:text-sm">
                          {opt.label}
                        </span>
                        <span
                          className="text-[11px] font-bold tabular-nums opacity-90"
                          style={{ color: colors.cherry }}
                        >
                          +{opt.kcal} קל׳
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                disabled={trainingExtraKcal === null}
                className={`mt-8 w-full rounded-2xl py-4 ${typography.buttonLabel} text-white shadow-md transition active:scale-[0.99] disabled:opacity-45`}
                style={{ backgroundColor: colors.cherry }}
                onClick={runMagic}
              >
                תחוללי לי קסם קלורי! ✨
              </button>
            </section>
          ) : null}
        </motion.div>
      </AnimatePresence>

      {step >= 1 && step <= 4 ? (
        <div className="mt-8 flex justify-between gap-2">
          <button
            type="button"
            className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
            style={{ borderColor: colors.borderCherrySoft, color: colors.stemDeep }}
            onClick={() => {
              if (step === 4 && step4Phase === "pick") {
                setStep4Phase("route");
                return;
              }
              setStep((s) =>
                s === 4 && celebrationMode !== "home"
                  ? 2
                  : Math.max(1, s - 1),
              );
            }}
            disabled={step <= 1}
          >
            חזרה
          </button>
          <button
            type="button"
            className="rounded-xl border-2 px-4 py-3 text-sm font-bold text-white disabled:opacity-45"
            style={{
              borderColor: colors.stemDeep,
              backgroundColor: colors.stem,
            }}
            disabled={
              (step === 1 && mealCount == null) ||
              (step === 3 && celebrationMode === "home" && !canAdvanceFrom3) ||
              (step === 4 && !canAdvanceFrom4)
            }
            onClick={handleWizardContinue}
          >
            המשך
          </button>
        </div>
      ) : null}

      {activeSelectionBlocker ? (
        <div
          className="fixed inset-0 z-[7200] flex items-center justify-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            {activeSelectionBlocker.type === "duplicate_hot_protein" ? (
              <>
                <p className="font-extrabold text-[var(--stem-deep)]">
                  יש כאן שני חלבונים חמים לאותה משבצת צהריים (בשר/עוף/דג לבישול).
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  באיזה מהם לבסס את ארוחת הצהריים היום? (חלבון קר כמו פסטרמה או טונה
                  מהקופסה לא דורש בחירה כזו — ישובץ בארוחה אחרת.)
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    className="rounded-xl py-3 font-bold text-white"
                    style={{ backgroundColor: colors.stem }}
                    onClick={() =>
                      applySelectionResolution({
                        lunchAnchorFoodId: activeSelectionBlocker.first.id,
                      })
                    }
                  >
                    {activeSelectionBlocker.first.food}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl py-3 font-bold text-white"
                    style={{ backgroundColor: colors.cherry }}
                    onClick={() =>
                      applySelectionResolution({
                        lunchAnchorFoodId: activeSelectionBlocker.second.id,
                      })
                    }
                  >
                    {activeSelectionBlocker.second.food}
                  </button>
                </div>
              </>
            ) : null}
            {activeSelectionBlocker.type === "duplicate_hot_carbs" ? (
              <>
                <p className="font-extrabold text-[var(--stem-deep)]">
                  נראה שבחרת שתי פחמימות עיקריות חמות (למשל דגנים/אורז).
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  באיזו מהן להעדיף לצהריים היום?
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    className="rounded-xl py-3 font-bold text-white"
                    style={{ backgroundColor: colors.stem }}
                    onClick={() =>
                      applySelectionResolution({
                        starchAnchorFoodId: activeSelectionBlocker.first.id,
                      })
                    }
                  >
                    {activeSelectionBlocker.first.food}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl py-3 font-bold text-white"
                    style={{ backgroundColor: colors.cherry }}
                    onClick={() =>
                      applySelectionResolution({
                        starchAnchorFoodId: activeSelectionBlocker.second.id,
                      })
                    }
                  >
                    {activeSelectionBlocker.second.food}
                  </button>
                </div>
              </>
            ) : null}
            {activeSelectionBlocker.type === "missing_protein" ? (
              <>
                <p className="font-extrabold text-[var(--stem-deep)]">
                  חסרה מנת חלבון משמעותית כדי שהתפריט יהיה מאוזן.
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  אולי כדאי להוסיף ביצים, טונה או חזה עוף מהמזווה?
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Link
                    href="/menu-builder/pantry"
                    className="rounded-xl py-3 text-center font-extrabold text-white"
                    style={{ backgroundColor: colors.stem }}
                  >
                    פתיחת המזווה
                  </Link>
                  <button
                    type="button"
                    className="rounded-xl border-2 py-2.5 font-bold"
                    style={{ borderColor: colors.borderCherrySoft }}
                    onClick={() =>
                      applySelectionResolution({ lowProteinAcknowledged: true })
                    }
                  >
                    אמשיך בכל זאת
                  </button>
                </div>
              </>
            ) : null}
            {activeSelectionBlocker.type === "coffee_slot" ? (
              <>
                <p className="font-extrabold text-[var(--stem-deep)]">
                  מתי הכי מתאים לך לשלב את הקפה היום?
                </p>
                <select
                  className="mt-3 w-full rounded-lg border-2 px-2 py-2 text-sm font-bold"
                  style={{ borderColor: colors.borderCherrySoft }}
                  value={coffeePickIdx}
                  onChange={(e) => setCoffeePickIdx(Number(e.target.value))}
                >
                  {mealWizardLabels(mealCount ?? readStoredMenuMealCount() ?? 5).map(
                    (lab, idx) => (
                      <option key={lab} value={idx}>
                        {lab}
                      </option>
                    ),
                  )}
                </select>
                <button
                  type="button"
                  className="btn-stem mt-4 w-full rounded-xl py-3 font-extrabold text-white"
                  onClick={() =>
                    applySelectionResolution({
                      coffeeMealSlotLabel:
                        mealWizardLabels(mealCount ?? readStoredMenuMealCount() ?? 5)[
                          coffeePickIdx
                        ] ?? "",
                    })
                  }
                >
                  אישור
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {treatMealDialogFood ? (
        <div
          className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <p className="font-extrabold text-[var(--stem-deep)]">
              {gf(
                gender,
                "באיזו ארוחה תרצי לשבץ את המנה היום?",
                "באיזו ארוחה תרצה לשבץ את המנה היום?",
              )}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              «{treatMealDialogFood.food}»
            </p>
            <select
              className="mt-3 w-full rounded-lg border-2 px-2 py-2 text-sm font-bold"
              style={{ borderColor: colors.borderCherrySoft }}
              value={treatMealSlotPick}
              onChange={(e) => setTreatMealSlotPick(Number(e.target.value))}
            >
              {treatMealDialogLabels.map((slotLabel, idx) => (
                <option key={idx} value={idx}>
                  {slotLabel}
                </option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border-2 py-2 font-bold"
                style={{ borderColor: colors.borderCherrySoft }}
                onClick={cancelTreatMealDialog}
              >
                ביטול
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl py-2 font-bold text-white"
                style={{ backgroundColor: colors.stem }}
                onClick={confirmTreatMealDialog}
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
