import {
  loadDayJournalClosedMap,
  loadDayLogs,
  loadProfile,
} from "@/lib/storage";
import { tdee } from "@/lib/tdee";

const FAT_KCAL_PER_G = 7.7;

/** גירעון יומי בטוח לצבירה — מעל זה לא נספר (סיכון תזונתי) */
export const SAFE_DEFICIT_CAP_KCAL = 800;

export type CalorieAccumulationRow = {
  dateKey: string;
  /** TDEE − צריכה */
  dailyBalanceKcal: number;
  /** נספר בצבירה רק מימים סגורים, ובטווח בטיחות */
  contributionKcal: number;
  /** הון מצטבר בקק״ל */
  accumulatedKcal: number;
  /** שקול שומן לצבירה הנוכחית */
  fatEquivalentG: number;
  /** גירעון מעל תקרת בטיחות — לא נספר בצבירה */
  unsafeDeficit: boolean;
};

export type CalorieAccumulationResult = {
  tdeeKcal: number;
  rows: CalorieAccumulationRow[];
  totalAccumulatedKcal: number;
  /** האם נסגר לפחות יום אחד ביומן (אי פעם) */
  hasAnyClosedDay: boolean;
};

/**
 * צבירה רק מימים שסומנו כסגורים ביומן.
 * תרומה יומית: רק אם 0 < גירעון ≤ 800; מעל 800 — לא נספר (unsafe).
 */
export function buildCalorieAccumulationTable(): CalorieAccumulationResult {
  const profile = loadProfile();
  const tdeeKcal = Math.round(
    tdee(
      profile.gender,
      profile.weightKg,
      profile.heightCm,
      profile.age,
      profile.activity,
    ),
  );

  const closedMap = loadDayJournalClosedMap();
  const hasAnyClosedDay = Object.values(closedMap).some((v) => v === true);

  const dayLogs = loadDayLogs();
  const dateKeys = Object.keys(closedMap)
    .filter((k) => closedMap[k] === true)
    .filter((k) => Array.isArray(dayLogs[k]))
    .sort();

  let accumulated = 0;
  const rows: CalorieAccumulationRow[] = [];

  for (const dateKey of dateKeys) {
    const entries = dayLogs[dateKey] ?? [];
    const consumed = entries.reduce((s, e) => s + e.calories, 0);
    const dailyBalanceKcal = tdeeKcal - consumed;

    let contributionKcal = 0;
    let unsafeDeficit = false;
    if (dailyBalanceKcal > 0) {
      if (dailyBalanceKcal <= SAFE_DEFICIT_CAP_KCAL) {
        contributionKcal = dailyBalanceKcal;
      } else {
        unsafeDeficit = true;
        contributionKcal = 0;
      }
    }

    accumulated += contributionKcal;
    rows.push({
      dateKey,
      dailyBalanceKcal,
      contributionKcal,
      accumulatedKcal: accumulated,
      fatEquivalentG: accumulated / FAT_KCAL_PER_G,
      unsafeDeficit,
    });
  }

  return {
    tdeeKcal,
    rows,
    totalAccumulatedKcal: accumulated,
    hasAnyClosedDay,
  };
}

export { FAT_KCAL_PER_G };
