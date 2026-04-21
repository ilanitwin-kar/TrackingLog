import type { Gender } from "@/lib/tdee";
import { gf } from "@/lib/hebrewGenderUi";

/** זיהוי ברכות גנריות של העוזר (למניעת שמירת “רעש” בזיכרון מקומי אם יוחזר בעתיד) */
export function isGenericAssistantGreeting(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return true;
  return /מה בא לך\?|אהלן! אני כאן כדי לעזור|היי! אני כאן כדי לעזור/.test(t);
}

/** הודעת ניחומין כשחורגים מהיעד — מוצגת בבית רק ביום הנוכחי כשהמאזן אחרי הליכה עדיין מעל היעד */
export function overGoalInsightFallback(
  gender: Gender,
  overKcal: number
): string {
  const n = Math.max(0, Math.round(overKcal));
  return gf(
    gender,
    `ראיתי שחרגנו קצת מהיעד היום ב-${n} קלוריות, לא נורא! מחר יום חדש. אולי כדאי שנבחר ארוחת בוקר קלילה יותר מהמילון שלך?`,
    `ראיתי שחרגנו קצת מהיעד היום ב-${n} קלוריות, לא נורא! מחר יום חדש. אולי נבחר ארוחת בוקר קלילה יותר מהמילון שלך?`
  );
}

/**
 * טקסט לבועת התובנה בבית בלבד — ללא היסטוריית צ'אט מהעוזר.
 * רק חריגה מיעד (נטו, אחרי קיזוז צעדים) ביום הנוכחי.
 */
export function resolveHomeInsightBubbleText(
  gender: Gender,
  isViewingToday: boolean,
  netOverKcal: number
): string | null {
  if (!isViewingToday || netOverKcal <= 0) return null;
  return overGoalInsightFallback(gender, netOverKcal);
}
