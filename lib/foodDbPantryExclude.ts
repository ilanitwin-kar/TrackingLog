/** כללי מזווה בלי תלות ב־fs — בטוח לייבוא מרכיבי לקוח */

export const FOOD_DB_PANTRY_EXCLUDED_CATEGORY =
  "ארומה אוכל מוכן למאה גרם";

export function isFoodDbCategoryExcludedFromPantry(category: string): boolean {
  return category.trim() === FOOD_DB_PANTRY_EXCLUDED_CATEGORY;
}
