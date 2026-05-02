/** תצוגה בלבד — השם המלא נשמר בנתונים ובעריכה */

export const DISPLAY_FOOD_MAX_WORDS = 5;

export function truncateDisplayFoodLabel(
  raw: string,
  maxWords = DISPLAY_FOOD_MAX_WORDS
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return trimmed;
  return `${parts.slice(0, maxWords).join(" ")}…`;
}

/** שם קיים ביומן — alias */
export const truncateJournalFoodDisplayLabel = truncateDisplayFoodLabel;
