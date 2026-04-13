import { getDaysRemainingToGoal } from "./goalMetrics";
import type { UserProfile, WeightEntry } from "./storage";

export const KCAL_PER_KG_FAT = 7700;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sortWeights(weights: WeightEntry[]): WeightEntry[] {
  return [...weights].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}

export type ReportMode = "loss" | "gain" | "at_goal";

export type ReportMetrics = {
  mode: ReportMode;
  currentKg: number;
  startKg: number;
  goalKg: number;
  lostKg: number;
  /** ק״ג עד היעד — ירידה: כמה נשאר לרדת; עליה: כמה נשאר לעלות */
  kgToGoal: number;
  /** קק״ל לפי 7700 — רק במצב ירידה */
  kcalToBurn: number | null;
  daysToGoal: number | null;
  deficit: number;
  weightsLen: number;
  footnote: string | null;
};

/**
 * משקל נוכחי: השקילה האחרונה; אם אין — משקל מהפרופיל.
 * ק״ג נותר: מרחק מוחלט ליעד (ירידה או עליה).
 * קלוריות לשריפה: רק כשהיעד הוא ירידה במשקל (7700 לק״ג שומן).
 * ימים: אותו חישוב גלובלי כמו ב־goalMetrics (TDEE − צריכה / גירעון מתוכנן).
 */
export function computeReportMetrics(
  profile: UserProfile,
  weights: WeightEntry[]
): ReportMetrics {
  const sorted = sortWeights(weights);
  const currentKg =
    sorted.length > 0 ? sorted[sorted.length - 1].kg : profile.weightKg;
  const startKg =
    sorted.length > 0 ? sorted[0].kg : profile.weightKg;
  const goalKg = profile.goalWeightKg;
  const deficit = Math.max(0, profile.deficit);

  const lostKg = Math.max(0, round1(startKg - currentKg));

  const eps = 0.05;
  let mode: ReportMode;
  let kgToGoal: number;
  let kcalToBurn: number | null;
  let daysToGoal: number | null;
  let footnote: string | null = null;

  if (currentKg > goalKg + eps) {
    mode = "loss";
    kgToGoal = round1(currentKg - goalKg);
    kcalToBurn = Math.round(kgToGoal * KCAL_PER_KG_FAT);
    daysToGoal = getDaysRemainingToGoal();
    if (deficit <= 0 && kgToGoal > 0 && daysToGoal == null) {
      footnote =
        "הגדירי גירעון יומי חיובי או רשמו אכילה כדי לחשב גירעון (TDEE − צריכה).";
    }
  } else if (currentKg < goalKg - eps) {
    mode = "gain";
    kgToGoal = round1(goalKg - currentKg);
    kcalToBurn = null;
    daysToGoal = null;
    footnote =
      "יעד עליה במשקל — אין משמעות ל־7700 קק״ל לק״ג (נוסחה לשומן). התמקדי בעודף קלוריות מבוקר ואימונים.";
  } else {
    mode = "at_goal";
    kgToGoal = 0;
    kcalToBurn = 0;
    daysToGoal = 0;
    footnote = "נראה שהגעת לטווח יעד המשקל — כל הכבוד!";
  }

  return {
    mode,
    currentKg: round1(currentKg),
    startKg: round1(startKg),
    goalKg: round1(goalKg),
    lostKg,
    kgToGoal,
    kcalToBurn,
    daysToGoal,
    deficit,
    weightsLen: weights.length,
    footnote,
  };
}
