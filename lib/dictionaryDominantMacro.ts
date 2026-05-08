import type { DictionaryItem, MealPreset } from "@/lib/storage";

export type DictDominantMacro = "protein" | "carbs" | "fat" | "neutral";

export function dictMacroGramsForDominance(
  d: DictionaryItem,
  preset: MealPreset | undefined,
): { p: number; c: number; f: number } {
  if (preset?.components?.length) {
    let p = 0;
    let c = 0;
    let f = 0;
    for (const x of preset.components) {
      p += Number.isFinite(x.proteinG) ? Math.max(0, x.proteinG ?? 0) : 0;
      c += Number.isFinite(x.carbsG) ? Math.max(0, x.carbsG ?? 0) : 0;
      f += Number.isFinite(x.fatG) ? Math.max(0, x.fatG ?? 0) : 0;
    }
    return { p, c, f };
  }
  const lp =
    d.lastProteinG != null && Number.isFinite(d.lastProteinG)
      ? Math.max(0, d.lastProteinG)
      : 0;
  const lc =
    d.lastCarbsG != null && Number.isFinite(d.lastCarbsG)
      ? Math.max(0, d.lastCarbsG)
      : 0;
  const lf =
    d.lastFatG != null && Number.isFinite(d.lastFatG)
      ? Math.max(0, d.lastFatG)
      : 0;
  if (lp + lc + lf > 1e-6) {
    return { p: lp, c: lc, f: lf };
  }
  return {
    p:
      d.proteinPer100g != null && Number.isFinite(d.proteinPer100g)
        ? Math.max(0, d.proteinPer100g)
        : 0,
    c:
      d.carbsPer100g != null && Number.isFinite(d.carbsPer100g)
        ? Math.max(0, d.carbsPer100g)
        : 0,
    f:
      d.fatPer100g != null && Number.isFinite(d.fatPer100g)
        ? Math.max(0, d.fatPer100g)
        : 0,
  };
}

export function dominantDictMacro(
  d: DictionaryItem,
  preset: MealPreset | undefined,
): DictDominantMacro {
  const { p, c, f } = dictMacroGramsForDominance(d, preset);
  const t = p + c + f;
  if (t < 1e-6) return "neutral";
  const m = Math.max(p, c, f);
  const tol = 1e-6;
  const atMax = [p, c, f].filter((x) => Math.abs(x - m) <= tol).length;
  if (atMax !== 1) return "neutral";
  if (p === m) return "protein";
  if (c === m) return "carbs";
  return "fat";
}
