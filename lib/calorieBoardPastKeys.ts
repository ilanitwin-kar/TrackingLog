import { getTodayKey } from "./dateKey";
import {
  loadDayJournalClosedMap,
  loadDayLogs,
  loadStoryRevealUnlock,
} from "./storage";

/**
 * תאריכי עבר (< היום) שלא נכללים בחלון המסלול (היום → קדימה),
 * אבל רלוונטיים למשבצות: רישום אכילה, סגירת יומן, או קובייה בזהב.
 * ממוין עולה — מוצג לפני רצף הימים מהיום.
 */
export function getCalorieBoardPastDateKeysBeforeForwardWindow(
  forwardDateKeys: readonly string[]
): string[] {
  const today = getTodayKey();
  const forwardSet = new Set(forwardDateKeys);
  const dayLogs = loadDayLogs();
  const unlockedMap = loadStoryRevealUnlock();
  const closedMap = loadDayJournalClosedMap();

  const extraBeforeSet = new Set<string>();

  for (const d of Object.keys(dayLogs)) {
    if (
      d < today &&
      (dayLogs[d]?.length ?? 0) > 0 &&
      !forwardSet.has(d)
    ) {
      extraBeforeSet.add(d);
    }
  }
  for (const d of Object.keys(unlockedMap)) {
    if (d < today && unlockedMap[d] && !forwardSet.has(d)) {
      extraBeforeSet.add(d);
    }
  }
  for (const d of Object.keys(closedMap)) {
    if (d < today && !forwardSet.has(d)) {
      extraBeforeSet.add(d);
    }
  }

  return [...extraBeforeSet].sort();
}
