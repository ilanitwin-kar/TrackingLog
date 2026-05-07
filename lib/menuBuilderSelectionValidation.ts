import {
  dominantDictMacro,
} from "@/lib/dictionaryDominantMacro";
import type { DictionaryItem, MealPreset } from "@/lib/storage";

export type SelectionBlocker =
  | {
      type: "duplicate_hot_protein";
      first: DictionaryItem;
      second: DictionaryItem;
    }
  | {
      type: "duplicate_hot_carbs";
      first: DictionaryItem;
      second: DictionaryItem;
    }
  | { type: "missing_protein" }
  | { type: "coffee_slot"; coffeeItems: DictionaryItem[] };

function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

function presetOf(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): MealPreset | undefined {
  return d.mealPresetId ? presetMap.get(d.mealPresetId) : undefined;
}

/**
 * Deli_Cold_Protein: פסטרמה, סלמי, נקניק יבש, טונה משומרת/מקופסת וכו׳ —
 * לא מתנגש עם עוגן צהריים חם.
 */
export function isDeliColdProtein(d: DictionaryItem): boolean {
  const c = norm(d.foodCategory ?? "");
  const n = norm(d.food);

  if (c.includes("פסטרמה") || n.includes("פסטרמה")) return true;
  if (n.includes("סאלאמי") || n.includes("סלאמי")) return true;
  if (n.includes("נקניק") && !n.includes("צלי") && !n.includes("חם")) {
    if (c.includes("נקניק")) return true;
  }

  if (n.includes("טונה")) {
    if (n.includes("סטייק") || n.includes("נתח") || n.includes("טרי") || n.includes("נא"))
      return false;
    if (
      n.includes("משומר") ||
      n.includes("בשימורים") ||
      n.includes("קופס") ||
      n.includes("מועשר") ||
      c.includes("קופס")
    )
      return true;
    return true;
  }

  if (n.includes("משומר") && (n.includes("דג") || n.includes("טונה"))) return true;

  return false;
}

/**
 * Main_Hot_Protein: דג/עוף/בשר לבישול — נועד לעוגן צהריים; לא כולל דליקטס קר.
 */
export function isMainHotProtein(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  const preset = presetOf(d, presetMap);
  if (dominantDictMacro(d, preset) !== "protein") return false;
  if (isDeliColdProtein(d)) return false;

  const n = norm(d.food);
  if (n.includes("ביצ") || n.includes("קוטג") || n.includes("יוגורט")) return false;
  if (n.includes("גבינ") && !n.includes("מגורד")) return false;

  const c = norm(d.foodCategory ?? "");

  if (c.includes("דג") || c.includes("פירות ים")) return true;
  if (
    n.includes("סלמון") ||
    n.includes("דניס") ||
    n.includes("מושט") ||
    n.includes("בורי") ||
    n.includes("אינטיאס")
  )
    return true;
  if (n.includes("טונה") && (n.includes("סטייק") || n.includes("נתח"))) return true;

  if (c.includes("עוף") || c.includes("בשר") || c.includes("הודו")) return true;
  if (
    n.includes("עוף") ||
    n.includes("חזה") ||
    n.includes("שניצל") ||
    n.includes("בקר") ||
    n.includes("הודו") ||
    n.includes("כבש") ||
    n.includes("טחון")
  )
    return true;

  return false;
}

/** @deprecated השתמשו ב־isDeliColdProtein / isMainHotProtein */
export function isFishLikeSeafood(d: DictionaryItem): boolean {
  if (isDeliColdProtein(d)) return false;
  const c = norm(d.foodCategory ?? "");
  const n = norm(d.food);
  if (c.includes("דג") || c.includes("פירות ים")) return true;
  if (n.includes("סלמון") || n.includes("דניס") || n.includes("מושט")) return true;
  return false;
}

/** @deprecated השתמשו ב־isMainHotProtein */
export function isMeatOrPoultryLike(d: DictionaryItem): boolean {
  if (isDeliColdProtein(d)) return false;
  if (isFishLikeSeafood(d)) return false;
  const c = norm(d.foodCategory ?? "");
  const n = norm(d.food);
  if (c.includes("בשר") || c.includes("עוף") || c.includes("הודו")) return true;
  if (
    n.includes("עוף") ||
    n.includes("בקר") ||
    n.includes("הודו") ||
    n.includes("שניצל") ||
    n.includes("כבש")
  )
    return true;
  return false;
}

function isStarchyCarbSide(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  const preset = presetOf(d, presetMap);
  if (dominantDictMacro(d, preset) !== "carbs") return false;
  const c = norm(d.foodCategory ?? "");
  const n = norm(d.food);
  if (
    c.includes("אורז") ||
    c.includes("פסטה") ||
    c.includes("קוסקוס") ||
    c.includes("פתיתים") ||
    c.includes("נודל") ||
    n.includes("אורז") ||
    n.includes("פתיתים") ||
    n.includes("פסטה") ||
    n.includes("נודלס")
  )
    return true;
  return false;
}

export function hasCoffeeProduct(d: DictionaryItem): boolean {
  const n = norm(d.food);
  const c = norm(d.foodCategory ?? "");
  return n.includes("קפה") || c.includes("קפה");
}

function hasMeaningfulProtein(
  d: DictionaryItem,
  presetMap: Map<string, MealPreset>,
): boolean {
  const preset = presetOf(d, presetMap);
  const dom = dominantDictMacro(d, preset);
  const p100 = d.proteinPer100g ?? 0;
  if (dom === "protein" && p100 >= 5) return true;
  if (dom !== "neutral" && p100 >= 12) return true;
  return false;
}

export type SelectionResolution = {
  lunchAnchorFoodId?: string | null;
  starchAnchorFoodId?: string | null;
  coffeeMealSlotLabel?: string | null;
  lowProteinAcknowledged?: boolean;
};

export function computeSelectionBlockers(
  selected: DictionaryItem[],
  presetMap: Map<string, MealPreset>,
  resolved: SelectionResolution = {},
): SelectionBlocker[] {
  const out: SelectionBlocker[] = [];

  const mainHotProteins = selected.filter((d) =>
    isMainHotProtein(d, presetMap),
  );

  if (mainHotProteins.length >= 2 && !resolved.lunchAnchorFoodId) {
    out.push({
      type: "duplicate_hot_protein",
      first: mainHotProteins[0]!,
      second: mainHotProteins[1]!,
    });
  }

  const starches = selected.filter((d) => isStarchyCarbSide(d, presetMap));
  if (starches.length >= 2 && !resolved.starchAnchorFoodId) {
    out.push({
      type: "duplicate_hot_carbs",
      first: starches[0]!,
      second: starches[1]!,
    });
  }

  const anyProtein = selected.some((d) => hasMeaningfulProtein(d, presetMap));
  if (!anyProtein && !resolved.lowProteinAcknowledged) {
    out.push({ type: "missing_protein" });
  }

  const coffeeItems = selected.filter(hasCoffeeProduct);
  if (coffeeItems.length > 0 && !resolved.coffeeMealSlotLabel?.trim()) {
    out.push({ type: "coffee_slot", coffeeItems });
  }

  return out;
}
