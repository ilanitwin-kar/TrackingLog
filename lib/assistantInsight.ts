import type { Gender } from "@/lib/tdee";
import { gf } from "@/lib/hebrewGenderUi";

const KEY = "cj_assistant_insight_bubble_v1";

export function isGenericAssistantGreeting(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return true;
  return /מה בא לך\?|אהלן! אני כאן כדי לעזור|היי! אני כאן כדי לעזור/.test(t);
}

export function saveAssistantInsightForBubble(text: string): void {
  if (typeof window === "undefined") return;
  const t = text.trim();
  if (t.length < 12 || isGenericAssistantGreeting(t)) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ text: t, updatedAt: Date.now() })
    );
    window.dispatchEvent(new Event("cj-assistant-insight-updated"));
  } catch {
    /* ignore */
  }
}

export function loadAssistantInsightForBubble(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { text?: string };
    return typeof j.text === "string" && j.text.trim().length > 0
      ? j.text.trim()
      : null;
  } catch {
    return null;
  }
}

/** הודעת ניחומין כשחורגים מהיעד — מוצגת בבית אם אין תובנה אחרת מהעוזר */
export function overGoalInsightFallback(gender: Gender, overKcal: number): string {
  const n = Math.max(0, Math.round(overKcal));
  return gf(
    gender,
    `ראיתי שחרגנו קצת מהיעד היום ב-${n} קלוריות, לא נורא! מחר יום חדש. אולי כדאי שנבחר ארוחת בוקר קלילה יותר מהמילון שלך?`,
    `ראיתי שחרגנו קצת מהיעד היום ב-${n} קלוריות, לא נורא! מחר יום חדש. אולי נבחר ארוחת בוקר קלילה יותר מהמילון שלך?`
  );
}

export function resolveHomeInsightBubbleText(
  gender: Gender,
  storedInsight: string | null,
  isViewingToday: boolean,
  overKcal: number
): string | null {
  if (!isViewingToday) {
    if (storedInsight && !isGenericAssistantGreeting(storedInsight)) {
      return storedInsight;
    }
    return null;
  }

  if (overKcal > 0) {
    if (storedInsight && !isGenericAssistantGreeting(storedInsight)) {
      return storedInsight;
    }
    return overGoalInsightFallback(gender, overKcal);
  }

  if (storedInsight && !isGenericAssistantGreeting(storedInsight)) {
    return storedInsight;
  }
  return null;
}
