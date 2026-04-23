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

export type NutritionGoal = "weight_loss" | "maintenance" | "muscle_gain";

const SAFE_MIN_KCAL: Record<Gender, number> = {
  female: 1200,
  male: 1500,
};

export const CALORIE_FLOOR_MESSAGE_HE =
  "כדי לשמור על בריאות וחילוף חומרים תקין, קבענו לך את המינימום המומלץ. כדי להגביר את הקצב, מומלץ להוסיף פעילות גופנית";

/** קלט פרופיל לחישוב יעד קלוריות (ללא ייבוא מ־storage כדי למנוע תלות מעגלית). */
export type CaloriePlanInput = {
  gender: Gender;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  nutritionGoal?: NutritionGoal;
  customDeficitEnabled?: boolean;
  deficit: number;
};

export type NutritionPlan = {
  tdee: number;
  baseTargetKcal: number;
  finalTargetKcal: number;
  calorieFloorApplied: boolean;
  macroGrams: { proteinG: number; carbsG: number; fatG: number };
};

function goalMultiplier(goal: NutritionGoal): number {
  if (goal === "weight_loss") return 0.8;
  if (goal === "maintenance") return 1;
  return 1.1;
}

/**
 * מאקרו יומי בגרמים לפי מסלול:
 * נשים: חלבון 1.8 ג׳/ק״ג, שומן 30% מהיעד, פחמימות — השארית.
 * גברים: חלבון 2.2 ג׳/ק״ג, שומן 25% מהיעד, פחמימות — השארית.
 */
export function dailyMacroTargetsGramsForWeight(
  targetKcal: number,
  weightKg: number,
  gender: Gender
): { proteinG: number; carbsG: number; fatG: number } {
  if (!Number.isFinite(targetKcal) || targetKcal <= 0 || weightKg <= 0) {
    return { proteinG: 0, carbsG: 0, fatG: 0 };
  }
  const proteinG =
    gender === "male"
      ? Math.round(weightKg * 2.2 * 10) / 10
      : Math.round(weightKg * 1.8 * 10) / 10;
  const fatPct = gender === "male" ? 0.25 : 0.3;
  const fatG = Math.max(
    0,
    Math.round(((targetKcal * fatPct) / 9) * 10) / 10
  );
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  let carbKcal = targetKcal - proteinKcal - fatKcal;
  if (!Number.isFinite(carbKcal) || carbKcal < 0) carbKcal = 0;
  const carbsG = Math.max(0, Math.round((carbKcal / 4) * 10) / 10);
  return { proteinG, carbsG, fatG };
}

export function computeNutritionPlan(profile: CaloriePlanInput): NutritionPlan {
  const { gender, weightKg, heightCm, age, activity } = profile;
  const tdeeVal = tdee(gender, weightKg, heightCm, age, activity);
  const goal: NutritionGoal = profile.nutritionGoal ?? "weight_loss";

  let base = tdeeVal * goalMultiplier(goal);
  let floorApplied = false;
  if (goal === "weight_loss") {
    const minK = SAFE_MIN_KCAL[gender];
    if (base < minK) {
      base = minK;
      floorApplied = true;
    }
  }
  base = Math.max(1, Math.round(base));

  let final = base;
  if (profile.customDeficitEnabled === true && profile.deficit > 0) {
    final = Math.round(base - profile.deficit);
    if (goal === "weight_loss") {
      const minK = SAFE_MIN_KCAL[gender];
      if (final < minK) {
        final = minK;
        floorApplied = true;
      }
    }
    final = Math.max(1, final);
  }

  const macroGrams = dailyMacroTargetsGramsForWeight(final, weightKg, gender);

  return {
    tdee: Math.round(tdeeVal),
    baseTargetKcal: base,
    finalTargetKcal: final,
    calorieFloorApplied: floorApplied,
    macroGrams,
  };
}

export function dailyCalorieTarget(profile: CaloriePlanInput): number {
  return computeNutritionPlan(profile).finalTargetKcal;
}
