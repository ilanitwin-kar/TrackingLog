import type { Gender } from "./tdee";
import { dailyMacroTargetsGramsForWeight } from "./tdee";

/** יעדי מאקרו (גרם) לפי יעד קלוריות, משקל גוף ומסלול מגדר — כמו בחישוב התוצאות. */
export function dailyMacroTargetsGramsForProfile(
  targetKcal: number,
  weightKg: number,
  gender: Gender
): {
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  return dailyMacroTargetsGramsForWeight(targetKcal, weightKg, gender);
}
