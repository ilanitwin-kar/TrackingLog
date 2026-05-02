export type JournalMealSlot =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "night"
  | "snack";

export const JOURNAL_MEAL_SLOTS: readonly JournalMealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "night",
  "snack",
] as const;

export const JOURNAL_MEAL_LABELS: Record<JournalMealSlot, string> = {
  breakfast: "בוקר",
  lunch: "צהריים",
  dinner: "ערב",
  night: "לילה",
  snack: "ביניים",
};

/** טווחי שעות למודל «העבר אל…» — תואם ל־inferMealSlotFromTime */
export const JOURNAL_MEAL_TIME_LABELS: Record<JournalMealSlot, string> = {
  breakfast: "05:00–10:59",
  lunch: "11:00–15:59",
  dinner: "16:00–20:59",
  night: "21:00–00:59",
  snack: "01:00–04:59",
};

const SLOT_SET = new Set<string>(JOURNAL_MEAL_SLOTS);

export function isJournalMealSlot(v: unknown): v is JournalMealSlot {
  return typeof v === "string" && SLOT_SET.has(v);
}

/** פרמטר URL: mealSlot=breakfast וכו׳ */
export function parseMealSlotParam(raw: string | null): JournalMealSlot | undefined {
  if (!raw || !isJournalMealSlot(raw.trim())) return undefined;
  return raw.trim() as JournalMealSlot;
}

/** נרמול מערך JSON בטעינה (מיפוי legacy: fruits → ביניים) */
export function normalizeStoredMealSlot(raw: unknown): JournalMealSlot | undefined {
  if (raw === "fruits") return "snack";
  if (!isJournalMealSlot(raw)) return undefined;
  return raw;
}

/**
 * טווחי שעות לחלוקת היום ביומן — לפי שעון מקומי (`createdAt` בשעת ההוספה).
 *
 * | קטגוריה | שעות (כולל התחלה, לא כולל סוף חלון הבא אלא כפי שמוגדר) |
 * |---------|--------------------------------------------------------|
 * | **בוקר** | 05:00–10:59 |
 * | **צהריים** | 11:00–15:59 |
 * | **ערב** | 16:00–20:59 |
 * | **לילה** | 21:00–23:59 או 00:00–00:59 (חצות עד לפני 01:00) |
 * | **ביניים** | 01:00–04:59 (לפני חלון הבוקר; נשנוש/ארוחה קטנה מאוחרת בלילה) |
 */
export function inferMealSlotFromTime(iso: string): JournalMealSlot {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "snack";
    const h = d.getHours();
    if (h >= 5 && h < 11) return "breakfast";
    if (h >= 11 && h < 16) return "lunch";
    if (h >= 16 && h < 21) return "dinner";
    if (h >= 21 || h < 1) return "night";
    return "snack";
  } catch {
    return "snack";
  }
}

/** חמש קטגוריות תצוגה ביומן הראשי — סדר הופעה במסך */
export type JournalDaySectionSlot =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "night"
  | "snack";

export const JOURNAL_DAY_SECTION_SLOTS: readonly JournalDaySectionSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "night",
  "snack",
] as const;

/** קטגוריית סעיף ביומן לפי שעת רישום המנה בלבד */
export function journalDaySectionFromLoggedAt(
  iso: string
): JournalDaySectionSlot {
  return inferMealSlotFromTime(iso) as JournalDaySectionSlot;
}

export function getEffectiveMealSlot(entry: {
  mealSlot?: JournalMealSlot;
  createdAt: string;
}): JournalMealSlot {
  if (entry.mealSlot && isJournalMealSlot(entry.mealSlot)) return entry.mealSlot;
  return inferMealSlotFromTime(entry.createdAt);
}

export function withMealSlotFromQuery<T extends { mealSlot?: JournalMealSlot }>(
  entry: T,
  slot: JournalMealSlot | undefined
): T {
  if (!slot) return entry;
  return { ...entry, mealSlot: slot };
}

/** יעד קלוריות לארוחה — חלוקה שווה למספר חלונות הארוחה ביומן */
export function perMealCalorieBudgetKcal(dailyTarget: number): number {
  const t = Math.max(0, Math.round(dailyTarget));
  if (t <= 0) return 0;
  const n = JOURNAL_MEAL_SLOTS.length;
  return Math.max(1, Math.round(t / n));
}
