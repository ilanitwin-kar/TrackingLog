/**
 * חלוקת קלוריות יומית בין משבצות ארוחה בבונה התפריט (אחוזים מהקלוריות שנותרו אחרי פינוק/נעילות מזווה).
 * תומך ב־3 / 4 / 5 ארוחות לפי המפרט; לשאר המספרים מחזיר null והקורא נופל לברירת מחדל ישנה.
 */
export function mealSlotCalorieFractions(mealCount: number): number[] | null {
  if (mealCount === 3) return [0.3, 0.45, 0.25];
  if (mealCount === 4) return [0.25, 0.15, 0.4, 0.2];
  if (mealCount === 5) return [0.2, 0.1, 0.35, 0.1, 0.25];
  return null;
}
