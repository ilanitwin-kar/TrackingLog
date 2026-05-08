import { dominantDictMacro } from "@/lib/dictionaryDominantMacro";
import { mealSlotCalorieFractions } from "@/lib/menuMealSlotWeights";
import type { DictionaryItem, MealPreset } from "@/lib/storage";

function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

export function macroKcal100(d: DictionaryItem): number {
  const p = d.proteinPer100g ?? 0;
  const c = d.carbsPer100g ?? 0;
  const f = d.fatPer100g ?? 0;
  const fromMacro = p * 4 + c * 4 + f * 9;
  if (typeof d.caloriesPer100g === "number" && d.caloriesPer100g > 0) {
    return d.caloriesPer100g;
  }
  return Math.max(1, Math.round(fromMacro));
}

function presetFor(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): MealPreset | undefined {
  return d.mealPresetId ? presetMap.get(d.mealPresetId) : undefined;
}

/**
 * תקרת גרמים סבירה למנה אחת — מונעת «400 גרם קטשופ» כדי לסגור קלוריות.
 */
export function reasonableMaxGramsForDictionaryItem(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): number {
  const dom = dominantDictMacro(d, presetFor(d, presetMap));
  const k100 = macroKcal100(d);
  const food = norm(d.food);
  const cat = norm(d.foodCategory ?? "");

  if (food.includes("פריכ") || food.includes("קרקר") || food.includes("ביסקוויט")) {
    return 55;
  }
  if (
    k100 < 55 ||
    food.includes("קטשופ") ||
    food.includes("חרדל") ||
    cat.includes("רטב") ||
    cat.includes("תיבול")
  ) {
    return 45;
  }
  if (k100 < 85 && (cat.includes("חמוצים") || food.includes("חמוצים"))) {
    return 90;
  }
  if (dom === "fat") return 48;
  if (dom === "protein") {
    if (food.includes("טונה") || food.includes("סרדין")) return 140;
    return 230;
  }
  if (dom === "carbs") {
    if (food.includes("לחם") || food.includes("באגט") || food.includes("פיתה")) {
      return 115;
    }
    if (
      food.includes("אורז") ||
      food.includes("פסטה") ||
      food.includes("פתית") ||
      food.includes("נודל")
    ) {
      return 230;
    }
    return 185;
  }
  if (k100 < 70) return 380;
  return 300;
}

export type DraftMealItem = {
  name: string;
  portionLabel: string;
  estimatedGrams?: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  description?: string;
  isSuggested?: boolean;
};

export type DraftMealBlock = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  items: DraftMealItem[];
};

export type DraftMenuShape = {
  title: string;
  meals: DraftMealBlock[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

function roundGrams(g: number, step = 5): number {
  return Math.max(step, Math.round(g / step) * step);
}

export function draftLineFromFood(food: DictionaryItem, grams: number): DraftMealItem {
  const g = Math.max(5, Math.round(grams));
  const mul = g / 100;
  const k100 = macroKcal100(food);
  return {
    name: food.food,
    estimatedGrams: g,
    portionLabel: `${g} ג׳`,
    calories: Math.round(k100 * mul),
    protein: Math.round(((food.proteinPer100g ?? 0) * mul) * 10) / 10,
    carbs: Math.round(((food.carbsPer100g ?? 0) * mul) * 10) / 10,
    fat: Math.round(((food.fatPer100g ?? 0) * mul) * 10) / 10,
  };
}

/** פריט החלפה עם תקרת נפח; לא מגדילים מעבר לנורמה כדי לפצות על צפיפות קלורית נמוכה. */
export function buildSwapDraftItem(input: {
  food: DictionaryItem;
  targetCalories: number;
  presetMap: Map<string, MealPreset>;
}): DraftMealItem {
  const k100 = macroKcal100(input.food);
  const kpg = k100 / 100;
  const maxG = reasonableMaxGramsForDictionaryItem(input.food, input.presetMap);
  const naiveG = kpg > 0 ? input.targetCalories / kpg : 100;
  const g = Math.min(maxG, Math.max(10, roundGrams(naiveG, 5)));
  return draftLineFromFood(input.food, g);
}

function findDictionaryMatch(
  name: string,
  dictionary: DictionaryItem[],
): DictionaryItem | undefined {
  const n = norm(name);
  return dictionary.find((d) => norm(d.food) === n);
}

function lineHeadroomKcal(
  it: DraftMealItem,
  dictionary: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
): number {
  const dict = findDictionaryMatch(it.name, dictionary);
  const g0 =
    it.estimatedGrams != null && it.estimatedGrams > 0 ? it.estimatedGrams : 80;
  const kpg = dict
    ? macroKcal100(dict) / 100
    : (Number(it.calories) || 0) / Math.max(g0, 1);
  const maxG = dict
    ? reasonableMaxGramsForDictionaryItem(dict, presetMap)
    : Math.min(340, Math.round(g0 * 2.2));
  return Math.max(0, (maxG - g0) * kpg);
}

function applyKcalIncreaseToLine(
  it: DraftMealItem,
  addKcal: number,
  dictionary: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
): DraftMealItem {
  const dict = findDictionaryMatch(it.name, dictionary);
  const g0 =
    it.estimatedGrams != null && it.estimatedGrams > 0 ? it.estimatedGrams : 80;
  const kpg = dict
    ? macroKcal100(dict) / 100
    : (Number(it.calories) || 0) / Math.max(g0, 1);
  const maxG = dict
    ? reasonableMaxGramsForDictionaryItem(dict, presetMap)
    : Math.min(340, Math.round(g0 * 2.2));
  const maxAddKcal = Math.max(0, (maxG - g0) * kpg);
  const actualAdd = Math.min(Math.max(0, addKcal), maxAddKcal);
  const deltaG = kpg > 0 ? actualAdd / kpg : 0;
  let newG = roundGrams(g0 + deltaG, 5);
  newG = Math.min(maxG, Math.max(10, newG));

  if (dict) {
    const line = draftLineFromFood(dict, newG);
    return {
      ...line,
      description: it.description,
      isSuggested: it.isSuggested,
    };
  }
  const ratio = newG / g0;
  return {
    ...it,
    estimatedGrams: newG,
    portionLabel: `${newG} ג׳`,
    calories: Math.round((Number(it.calories) || 0) * ratio),
    protein: Math.round((Number(it.protein) || 0) * ratio * 10) / 10,
    carbs: Math.round((Number(it.carbs) || 0) * ratio * 10) / 10,
    fat: Math.round((Number(it.fat) || 0) * ratio * 10) / 10,
  };
}

/**
 * פיזור גירעון קלורי בארוחה — מספר סבבים לפי «חדר נשימה» שנותר בכל שורה.
 */
export function redistributeMealCalorieDeficit(
  items: DraftMealItem[],
  swappedLineIndex: number,
  deficitCalories: number,
  dictionary: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
): DraftMealItem[] {
  if (deficitCalories <= 5) return items.map((x) => ({ ...x }));
  const next = items.map((x) => ({ ...x }));
  let remaining = deficitCalories;

  for (let iter = 0; iter < 14 && remaining > 5; iter++) {
    const rooms = next
      .map((it, i) => ({
        i,
        room: i === swappedLineIndex ? 0 : lineHeadroomKcal(it, dictionary, presetMap),
      }))
      .filter((x) => x.room > 1);

    const totalRoom = rooms.reduce((s, x) => s + x.room, 0);
    if (totalRoom < 2) break;

    let absorbed = 0;
    for (const { i, room } of rooms) {
      const share = room / totalRoom;
      const targetAdd = remaining * share;
      const addKcal = Math.min(targetAdd, room);
      const oldCal = Number(next[i]!.calories) || 0;
      next[i] = applyKcalIncreaseToLine(next[i]!, addKcal, dictionary, presetMap);
      absorbed += (Number(next[i]!.calories) || 0) - oldCal;
    }
    if (absorbed < 2) break;
    remaining -= absorbed;
  }

  return next;
}

export function applyDictionarySwapInMeal(input: {
  mealItems: DraftMealItem[];
  itemIndex: number;
  food: DictionaryItem;
  dictionary: DictionaryItem[];
  presetMap: Map<string, MealPreset>;
}): DraftMealItem[] {
  const old = input.mealItems[input.itemIndex];
  if (!old) return input.mealItems.slice();
  const targetCal = Number(old.calories) || 0;
  const swapped = buildSwapDraftItem({
    food: input.food,
    targetCalories: targetCal,
    presetMap: input.presetMap,
  });
  const deficit = targetCal - (Number(swapped.calories) || 0);
  const row: DraftMealItem = {
    ...swapped,
    description: undefined,
    isSuggested: false,
  };
  let items = input.mealItems.map((x, i) => (i === input.itemIndex ? row : { ...x }));
  if (deficit > 5) {
    items = redistributeMealCalorieDeficit(
      items,
      input.itemIndex,
      deficit,
      input.dictionary,
      input.presetMap,
    );
  }
  return items;
}

export function recalcAiDraftTotals<T extends DraftMenuShape>(draft: T): T {
  const meals = draft.meals.map((m) => {
    const calories = m.items.reduce((s, it) => s + (Number(it.calories) || 0), 0);
    const protein = m.items.reduce((s, it) => s + (Number(it.protein) || 0), 0);
    const carbs = m.items.reduce((s, it) => s + (Number(it.carbs) || 0), 0);
    const fat = m.items.reduce((s, it) => s + (Number(it.fat) || 0), 0);
    return {
      ...m,
      calories: Math.round(calories),
      protein,
      carbs,
      fat,
    };
  });
  const totalCalories = meals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
  const totalProtein = meals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
  const totalCarbs = meals.reduce((s, m) => s + (Number(m.carbs) || 0), 0);
  const totalFat = meals.reduce((s, m) => s + (Number(m.fat) || 0), 0);
  return {
    ...draft,
    meals,
    totalCalories: Math.round(totalCalories),
    totalProtein,
    totalCarbs,
    totalFat,
  };
}

/** מוצר מהמזווה להשלמת קלוריות כשהתפריט מתחת למינימום */
export function pickPantryFillCandidate(
  dictionary: DictionaryItem[],
  draft: Pick<DraftMenuShape, "meals">,
  presetMap: Map<string, MealPreset>,
  deficitKcal: number,
): DictionaryItem | null {
  const used = new Set(
    draft.meals.flatMap((m) => m.items.map((i) => norm(i.name))),
  );
  let best: DictionaryItem | null = null;
  let bestScore = -Infinity;

  for (const d of dictionary) {
    if (used.has(norm(d.food))) continue;
    const preset = presetFor(d, presetMap);
    const dom = dominantDictMacro(d, preset);
    const k100 = macroKcal100(d);
    const maxG = reasonableMaxGramsForDictionaryItem(d, presetMap);
    const maxCal = (k100 / 100) * maxG;
    if (maxCal < 40) continue;

    const targetPortion = Math.min(deficitKcal, maxCal);
    const minReasonable = Math.min(70, maxCal * 0.12);
    if (targetPortion < minReasonable && deficitKcal > minReasonable + 30) continue;

    let bonus = 0;
    if (dom === "protein") bonus += 45;
    else if (dom === "carbs") bonus += 28;
    else if (dom === "fat") bonus += 12;
    if (k100 < 35) bonus -= 35;

    const score = bonus - Math.abs(deficitKcal - targetPortion) * 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** מוסיף שורת השלמה לארוחה עם הכי הרבה «מקום» יחסי ליעד המשבצת */
export function appendCalorieGapLineToDraft<T extends DraftMenuShape>(
  draft: T,
  food: DictionaryItem,
  params: {
    deficitKcal: number;
    mealCount: number;
    dailyBudgetKcal: number;
    presetMap: Map<string, MealPreset>;
  },
): T {
  const { deficitKcal, mealCount, dailyBudgetKcal, presetMap } = params;
  const fr = mealSlotCalorieFractions(mealCount);
  const meals = draft.meals.map((m) => ({
    ...m,
    items: m.items.map((it) => ({ ...it })),
  }));

  let bestMi = Math.min(meals.length - 1, Math.max(0, Math.floor(mealCount / 2)));
  let bestGap = -Infinity;

  if (fr && fr.length === meals.length) {
    for (let mi = 0; mi < meals.length; mi++) {
      const slotTarget = fr[mi]! * dailyBudgetKcal;
      const actual = Number(meals[mi]!.calories) || 0;
      const gap = slotTarget - actual;
      if (gap > bestGap) {
        bestGap = gap;
        bestMi = mi;
      }
    }
  }

  const k100 = macroKcal100(food);
  const kpg = k100 / 100;
  const maxG = reasonableMaxGramsForDictionaryItem(food, presetMap);
  const gIdeal = kpg > 0 ? deficitKcal / kpg : 80;
  const g = Math.min(maxG, Math.max(25, roundGrams(gIdeal, 5)));
  const base = draftLineFromFood(food, g);
  const line: DraftMealItem = {
    ...base,
    isSuggested: true,
    description: "הוצע להשלמת קלוריות יומיות (מתחת למינימום המומלץ)",
  };

  meals[bestMi]!.items = [...meals[bestMi]!.items, line];
  return recalcAiDraftTotals({ ...draft, meals });
}
