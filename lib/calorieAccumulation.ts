import { getCalorieBoardPastDateKeysBeforeForwardWindow } from "@/lib/calorieBoardPastKeys";
import { getCalorieBoardDateSequence } from "@/lib/dateKey";
import { getCalorieBoardTotalDays } from "@/lib/goalMetrics";
import {
  ensureStoryRevealDateMigration,
  loadDayJournalClosedMap,
  loadProfile,
  loadStoryRevealUnlock,
} from "@/lib/storage";
import { tdee } from "@/lib/tdee";

const FAT_KCAL_PER_G = 7.7;

export type CalorieAccumulationRow = {
  dateKey: string;
  plannedDailyBankKcal: number;
  /** פער מסגירת יומן (צריכה − TDEE); null אם עדיין לא נסגר */
  dailyBalanceKcal: number | null;
  /** תורם לסכום כשהקובייה נפתחה: רק אם היום נסגר — הערך gapKcal */
  contributionKcal: number;
  accumulatedKcal: number;
  fatEquivalentG: number;
};

export type CalorieAccumulationResult = {
  tdeeKcal: number;
  dailyTargetKcal: number;
  rows: CalorieAccumulationRow[];
  /** סכום פערים (חתומים) מימים סגורים שהקובייה שלהם נפתחה — מעדכן את חוב השריפה */
  totalAccumulatedKcal: number;
};

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

  const plannedDailyBankKcal = Math.max(0, Math.round(profile.deficit || 0));
  const dailyTargetKcal = Math.max(0, tdeeKcal - plannedDailyBankKcal);

  const totalDays = getCalorieBoardTotalDays() ?? 0;
  const dateKeys =
    totalDays > 0 ? getCalorieBoardDateSequence(totalDays) : [];
  const extraBeforeSorted =
    getCalorieBoardPastDateKeysBeforeForwardWindow(dateKeys);
  const displayDateKeys = [...extraBeforeSorted, ...dateKeys];
  if (displayDateKeys.length > 0) {
    ensureStoryRevealDateMigration(displayDateKeys);
  }
  const unlockedMap = loadStoryRevealUnlock();
  const closedMap = loadDayJournalClosedMap();

  let accumulated = 0;
  const rows: CalorieAccumulationRow[] = [];

  for (const dateKey of displayDateKeys) {
    const closed = closedMap[dateKey];
    const dailyBalanceKcal =
      closed != null ? closed.gapKcal : null;

    const contributionFromDay =
      closed && unlockedMap[dateKey] === true ? closed.gapKcal : 0;
    accumulated += contributionFromDay;
    rows.push({
      dateKey,
      plannedDailyBankKcal,
      dailyBalanceKcal,
      contributionKcal: contributionFromDay,
      accumulatedKcal: accumulated,
      fatEquivalentG: accumulated / FAT_KCAL_PER_G,
    });
  }

  return {
    tdeeKcal,
    dailyTargetKcal,
    rows,
    totalAccumulatedKcal: accumulated,
  };
}

export { FAT_KCAL_PER_G };
