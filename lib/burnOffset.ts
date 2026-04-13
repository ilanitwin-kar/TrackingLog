/** Rough kcal equivalents for offsetting over-limit intake */
const KCAL_PER_STEP = 0.045;
const KCAL_PER_MINUTE_WALK = 4.8;

export function stepsForKcal(kcal: number): number {
  return Math.ceil(kcal / KCAL_PER_STEP);
}

export function walkMinutesForKcal(kcal: number): number {
  return Math.ceil(kcal / KCAL_PER_MINUTE_WALK);
}
