export type Gender = "female" | "male";

/** Mifflin–St Jeor BMR */
export function bmr(
  gender: Gender,
  weightKg: number,
  heightCm: number,
  age: number
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === "male" ? base + 5 : base - 161;
}

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export function tdee(
  gender: Gender,
  weightKg: number,
  heightCm: number,
  age: number,
  activity: ActivityLevel = "light"
): number {
  return bmr(gender, weightKg, heightCm, age) * ACTIVITY_MULTIPLIERS[activity];
}

export function dailyCalorieTarget(
  gender: Gender,
  weightKg: number,
  heightCm: number,
  age: number,
  deficit: number,
  activity: ActivityLevel = "light"
): number {
  const t = tdee(gender, weightKg, heightCm, age, activity);
  return Math.max(800, Math.round(t - deficit));
}
