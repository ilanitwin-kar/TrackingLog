import { loadDayLogs, loadProfile } from "@/lib/storage";
import { tdee } from "@/lib/tdee";

const FAT_KCAL_PER_G = 7.7;

export type CalorieAccumulationRow = {
  dateKey: string;
  /** TDEE − צריכה (כמו במסך TDEE/פרופיל; חיובי = מתחת ל־TDEE) */
  dailyBalanceKcal: number;
  /** נספר בצבירה רק אם חיובי */
  contributionKcal: number;
  /** הון מצטבר בקק״ל */
  accumulatedKcal: number;
  /** שקול שומן לצבירה הנוכחית */
  fatEquivalentG: number;
};

export type CalorieAccumulationResult = {
  /** TDEE מעוגל — אותו חישוב כמו במסך הרשמה / עריכת פרטים */
  tdeeKcal: number;
  rows: CalorieAccumulationRow[];
  totalAccumulatedKcal: number;
};

/**
 * בונה שורות לפי ימים עם רישום ביומן, כרונולוגית.
 * גירעון יומי = TDEE − צריכה (לא יעד אחרי גירעון מתוכנן).
 * צבירה: סכום יומי של max(0, TDEE − צריכה).
 */
export function buildCalorieAccumulationTable(): CalorieAccumulationResult {
  const profile = loadProfile();
  const tdeeKcal = Math.round(
    tdee(
      profile.gender,
      profile.weightKg,
      profile.heightCm,
      profile.age,
      profile.activity
    )
  );

  const dayLogs = loadDayLogs();
  const dateKeys = Object.keys(dayLogs)
    .filter((k) => Array.isArray(dayLogs[k]) && dayLogs[k]!.length > 0)
    .sort();

  let accumulated = 0;
  const rows: CalorieAccumulationRow[] = [];

  for (const dateKey of dateKeys) {
    const entries = dayLogs[dateKey] ?? [];
    const consumed = entries.reduce((s, e) => s + e.calories, 0);
    const dailyBalanceKcal = tdeeKcal - consumed;
    const contributionKcal = Math.max(0, dailyBalanceKcal);
    accumulated += contributionKcal;
    rows.push({
      dateKey,
      dailyBalanceKcal,
      contributionKcal,
      accumulatedKcal: accumulated,
      fatEquivalentG: accumulated / FAT_KCAL_PER_G,
    });
  }

  return {
    tdeeKcal,
    rows,
    totalAccumulatedKcal: accumulated,
  };
}

export { FAT_KCAL_PER_G };
