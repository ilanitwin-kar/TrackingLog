/** Rough kcal equivalents for offsetting over-limit intake */
const KCAL_PER_STEP = 0.045;
const KCAL_PER_MINUTE_WALK = 4.8;

/** הליכה בקצב בינוני — MET 3.5; קלוריות לדקה = MET × משקל(ק״ג) × 0.0175 */
const MET_WALK_MODERATE = 3.5;
const MET_TO_KCAL_PER_MIN = 0.0175;
const STEPS_PER_WALK_MINUTE = 100;

export function stepsForKcal(kcal: number): number {
  return Math.ceil(kcal / KCAL_PER_STEP);
}

export function walkMinutesForKcal(kcal: number): number {
  return Math.ceil(kcal / KCAL_PER_MINUTE_WALK);
}

/**
 * דקות הליכה (MET 3.5) לקיזוז חריגה קלורית.
 * נוסחה: קלוריות לחריגה ÷ (3.5 × משקל × 0.0175)
 */
export function walkMinutesToOffsetKcalMet35(
  kcal: number,
  weightKg: number
): number {
  if (!Number.isFinite(kcal) || kcal <= 0) return 0;
  if (!Number.isFinite(weightKg) || weightKg < 30) return 0;
  const kcalPerMin =
    MET_WALK_MODERATE * weightKg * MET_TO_KCAL_PER_MIN;
  if (kcalPerMin <= 0) return 0;
  return Math.ceil(kcal / kcalPerMin);
}

/** צעדים לפי דקות הליכה בקצב בינוני (~100 צעדים לדקה) */
export function stepsFromWalkMinutesModerate(minutes: number): number {
  const m = Math.max(0, minutes);
  return Math.round(m * STEPS_PER_WALK_MINUTE);
}

/** תוכנית צעדים לקיזוז חריגה (MET 3.5 + 100 צעדים/דקה) */
export function met35OffsetWalkPlan(
  kcal: number,
  weightKg: number
): { minutes: number; steps: number } | null {
  const minutes = walkMinutesToOffsetKcalMet35(kcal, weightKg);
  if (minutes <= 0) return null;
  const steps = stepsFromWalkMinutesModerate(minutes);
  if (steps <= 0) return null;
  return { minutes, steps };
}

/**
 * קלוריות שנשרפו מהליכה לפי דיווח צעדים (הפוך לתוכנית הקיזוז):
 * דקות = צעדים ÷ 100, קלוריות = דקות × (3.5 × משקל × 0.0175)
 */
export function kcalBurnedFromStepsMet35(
  steps: number,
  weightKg: number
): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  if (!Number.isFinite(weightKg) || weightKg < 30) return 0;
  const minutes = steps / STEPS_PER_WALK_MINUTE;
  const kcalPerMin =
    MET_WALK_MODERATE * weightKg * MET_TO_KCAL_PER_MIN;
  if (kcalPerMin <= 0) return 0;
  return Math.round(minutes * kcalPerMin);
}
