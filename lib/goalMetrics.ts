import { loadDayLogs, loadProfile, loadWeights } from "@/lib/storage";
import type { UserProfile } from "@/lib/storage";
import { computeNutritionPlan, tdee } from "@/lib/tdee";

const KCAL_PER_KG = 7700;

export function getTdeeKcalRoundedFromProfile(profile: UserProfile): number {
  return Math.round(
    tdee(
      profile.gender,
      profile.weightKg,
      profile.heightCm,
      profile.age,
      profile.activity
    )
  );
}

/**
 * ממוצע צריכה קלורית יומית — רק על ימים שיש בהם רישום באכילה.
 */
export function getAverageDailyIntakeKcal(): number | null {
  const logs = loadDayLogs();
  const keys = Object.keys(logs).filter(
    (k) => Array.isArray(logs[k]) && logs[k]!.length > 0
  );
  if (keys.length === 0) return null;
  let sum = 0;
  for (const k of keys) {
    sum += logs[k]!.reduce((s, e) => s + e.calories, 0);
  }
  return sum / keys.length;
}

/**
 * גירעון יומי למסלול היעד = TDEE − צריכה יומית.
 * - עם יומן: ממוצע צריכה על כל הימים הרשומים (כמו מגמת ההתנהגות).
 * - בלי יומן: גירעון מתוכנן מהפרופיל (מתאים ל־TDEE − יעד אכילה).
 * אם TDEE − צריכה ≤ 0 — אין גירעון אפשרי לחישוב ימים.
 */
export function getDailyCaloricDeficitKcal(): number | null {
  const profile = loadProfile();
  const tdeeKcal = getTdeeKcalRoundedFromProfile(profile);
  const avgIntake = getAverageDailyIntakeKcal();
  if (avgIntake != null) {
    const deficit = tdeeKcal - avgIntake;
    return deficit > 0 ? deficit : null;
  }
  const plan = computeNutritionPlan(profile);
  const planned = plan.tdee - plan.finalTargetKcal;
  return planned > 0 ? planned : null;
}

/**
 * ימים משוערים עד יעד: (סך קלוריות לשריפה) / (גירעון יומי מהפרופיל).
 * סך קלוריות לשריפה = ק״ג נותר עד היעד × 7700.
 * הגירעון היומי הוא הערך שהמשתמשת בחרה בהזנת הפרטים (deficit), לא ממוצע מהיומן.
 */
export function getDaysRemainingToGoal(): number | null {
  const profile = loadProfile();
  const weights = loadWeights();
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const current =
    sorted.length > 0 ? sorted[sorted.length - 1].kg : profile.weightKg;
  const remaining = Math.max(0, current - profile.goalWeightKg);
  const kcalToBurn = remaining * KCAL_PER_KG;
  const plan = computeNutritionPlan(profile);
  const plannedDeficit = plan.tdee - plan.finalTargetKcal;
  if (
    plannedDeficit > 0 &&
    Number.isFinite(plannedDeficit) &&
    kcalToBurn > 0
  ) {
    return Math.max(1, Math.ceil(kcalToBurn / plannedDeficit));
  }
  return null;
}
