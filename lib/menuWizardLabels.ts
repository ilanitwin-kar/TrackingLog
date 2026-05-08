/** תוויות ארוחות לפי מספר ארוחות (שלב 1 בבונה התפריט) — מקור אמת משותף */

export const MENU_BUILDER_MEAL_COUNT_KEY = "cj_menu_builder_meal_count";

export type MealSlotKind =
  | "breakfast"
  | "snack"
  | "lunch"
  | "dinner"
  | "late";

export function mealWizardLabels(n: number): string[] {
  const presets: Record<number, string[]> = {
    2: ["ארוחת בוקר", "ארוחת ערב"],
    3: ["ארוחת בוקר", "ארוחת צהריים", "ארוחת ערב"],
    4: ["ארוחת בוקר", "ביניים", "ארוחת צהריים", "ארוחת ערב"],
    5: ["ארוחת בוקר", "ביניים", "ארוחת צהריים", "ביניים", "ארוחת ערב"],
    6: [
      "ארוחת בוקר",
      "ביניים",
      "ארוחת צהריים",
      "ביניים",
      "ארוחת ערב",
      "לפני שינה",
    ],
  };
  return presets[n] ?? Array.from({ length: n }, (_, i) => `ארוחה ${i + 1}`);
}

export function slotKindFromTitle(title: string): MealSlotKind {
  if (title.includes("בוקר")) return "breakfast";
  if (title.includes("צהריים")) return "lunch";
  if (title.includes("ערב")) return "dinner";
  if (title.includes("לפני שינה")) return "late";
  return "snack";
}

export function readStoredMenuMealCount(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MENU_BUILDER_MEAL_COUNT_KEY);
    const n = parseInt(raw ?? "", 10);
    if (n >= 2 && n <= 6) return n;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredMenuMealCount(n: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MENU_BUILDER_MEAL_COUNT_KEY, String(n));
  } catch {
    /* ignore */
  }
}
