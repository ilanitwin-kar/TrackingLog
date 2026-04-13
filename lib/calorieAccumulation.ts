import { getCalorieBoardDateSequence, getTodayKey } from "@/lib/dateKey";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";
import { loadProfile, loadStoryRevealUnlock } from "@/lib/storage";
import { tdee } from "@/lib/tdee";

const FAT_KCAL_PER_G = 7.7;

export type CalorieAccumulationRow = {
  dateKey: string;
  /** ההון היומי לפי תוכנית: TDEE − יעד יומי (כלומר deficit בפרופיל) */
  plannedDailyBankKcal: number;
  /** נספר בצבירה רק לאחר שהיום הסתיים (אחרי חצות) ורק אם המשבצת נפתחה */
  contributionKcal: number;
  /** הון מצטבר בקק״ל */
  accumulatedKcal: number;
  /** שקול שומן לצבירה הנוכחית */
  fatEquivalentG: number;
};

export type CalorieAccumulationResult = {
  /** TDEE מעוגל — אותו חישוב כמו במסך הרשמה / עריכת פרטים */
  tdeeKcal: number;
  /** יעד יומי מעוגל: TDEE − deficit */
  dailyTargetKcal: number;
  rows: CalorieAccumulationRow[];
  totalAccumulatedKcal: number;
};

/**
 * צבירת הון קלורי:
 * - ההון היומי = (TDEE − יעד יומי) כלומר ה-deficit המתוכנן בפרופיל.
 * - נספר רק עבור ימים שהסתיימו (dateKey < today) ורק אם המשתמש/ת "פתחה"
 *   את המשבצת בלוח (בלחיצה).
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

  const plannedDailyBankKcal = Math.max(0, Math.round(profile.deficit || 0));
  const dailyTargetKcal = Math.max(0, tdeeKcal - plannedDailyBankKcal);

  const daysRemaining = getDaysRemainingToGoal() ?? 0;
  const dateKeys =
    daysRemaining > 0 ? getCalorieBoardDateSequence(daysRemaining) : [];
  const today = getTodayKey();
  const unlockedMap = loadStoryRevealUnlock();

  let accumulated = 0;
  const rows: CalorieAccumulationRow[] = [];

  for (let i = 0; i < dateKeys.length; i++) {
    const dateKey = dateKeys[i]!;
    const isPastCompleteDay = dateKey < today;
    const isUnlocked = unlockedMap[String(i)] === true;
    const contributionKcal =
      isPastCompleteDay && isUnlocked ? plannedDailyBankKcal : 0;

    accumulated += contributionKcal;
    rows.push({
      dateKey,
      plannedDailyBankKcal,
      contributionKcal,
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
