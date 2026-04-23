import { getCalendarWeekDateKeys, getTodayKey } from "@/lib/dateKey";
import { dailyCalorieTarget } from "@/lib/tdee";
import { getEntriesForDate, type UserProfile } from "@/lib/storage";

/**
 * סכום הקלוריות שנחסכו בימים סגורים השבוע (תקציב מינוס צריכה, רק כשצריכה מתחת ליעד).
 */
export function weeklyCalorieSavingsClosedDays(
  profile: UserProfile,
  closedMap: Record<string, boolean>
): number {
  const target = dailyCalorieTarget(profile);
  if (target <= 0) return 0;
  const keys = getCalendarWeekDateKeys(getTodayKey());
  let sum = 0;
  for (const k of keys) {
    if (closedMap[k] !== true) continue;
    const consumed = getEntriesForDate(k).reduce((s, e) => s + e.calories, 0);
    const saved = target - consumed;
    if (saved > 0) sum += saved;
  }
  return Math.round(sum);
}
