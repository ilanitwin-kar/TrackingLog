import {
  loadBoardExtraTailDays,
  loadDayLogs,
  loadProfile,
  loadWeights,
} from "@/lib/storage";
import type { UserProfile } from "@/lib/storage";
import { tdee } from "@/lib/tdee";

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

function countLoggedDaysWithFood(): number {
  const logs = loadDayLogs();
  return Object.keys(logs).filter(
    (k) => Array.isArray(logs[k]) && logs[k]!.length > 0
  ).length;
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
  const planned = Math.max(0, profile.deficit);
  const avgIntake = getAverageDailyIntakeKcal();
  if (avgIntake != null) {
    const implied = tdeeKcal - avgIntake;
    const loggedDays = countLoggedDaysWithFood();

    // Avoid unrealistic countdowns when the logged-day average implies a much larger deficit
    // than the user's planned target, or when there isn't enough data yet.
    if (planned > 0) {
      if (loggedDays < 7) return planned;
      if (implied > planned + 250) return planned;
    }

    return implied > 0 ? implied : null;
  }
  return planned > 0 ? planned : null;
}

/**
 * ימים משוערים עד יעד: (חוב קלורי ליעד) / (גירעון יומי).
 * חוב קלורי = ק״ג נותר × 7700. גירעון יומי = TDEE − צריכה (ראו למעלה).
 * מקור יחיד לדוח האסטרטגי, לוח המפה, וכל מסך אחר.
 */
export function getDaysRemainingToGoal(): number | null {
  const profile = loadProfile();
  const weights = loadWeights();
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const current =
    sorted.length > 0 ? sorted[sorted.length - 1].kg : profile.weightKg;
  const remaining = Math.max(0, current - profile.goalWeightKg);
  const kcalToBurn = remaining * KCAL_PER_KG;
  const dailyDeficit = getDailyCaloricDeficitKcal();
  if (dailyDeficit != null && dailyDeficit > 0 && kcalToBurn > 0) {
    return Math.max(1, Math.ceil(kcalToBurn / dailyDeficit));
  }
  return null;
}

/** ימי לוח צבירה = ימים עד יעד + ימי זנב מחריגות (קלוריות) */
export function getCalorieBoardTotalDays(): number | null {
  const base = getDaysRemainingToGoal();
  if (base == null || base < 1) return null;
  return base + loadBoardExtraTailDays();
}
