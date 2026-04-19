import { getAppVariant } from "@/lib/appVariant";

/**
 * הודעת ווטסאפ — ללא משקל נוכחי; הון קלורי + מספר ימים סגורים ביומן.
 */
export function buildStrategicReportShareWhatsAppText(
  totalAccumulatedKcal: number,
  closedDaysCount: number
): string {
  const k = Math.max(0, Math.round(totalAccumulatedKcal)).toLocaleString(
    "he-IL"
  );
  const variant = getAppVariant();
  const tail = variant === "blueberry" ? "🫐" : "🍒";
  return `צברתי כבר ${k} קלוריות ב'הון הקלורי' שלי ו־${closedDaysCount} ימים של סגירה ביומן! בדרך ליעד עם אינטליגנציה קלורית. ${tail}`;
}
