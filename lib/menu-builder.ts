/**
 * כללי הקשר קולינרי לבניית תפריט (עוגנים / משפחות ארוחה).
 * לא דורש שדה חדש במסד — מסיק מ־foodCategory + שם המוצר.
 * שימוש: snapshot מהקליינט, ובהמשך גם אלגוריתם מקומי.
 */

import type { DictionaryItem } from "@/lib/storage";
import { normalizeFoodNameHe, normCat } from "@/lib/menuSlotPool";

/** אילו משבצות ארוחה הפריט מתאים להן כ־«מזון עיקרי» (לא «נוספים») */
export type MenuBuilderTimeOfDay =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "extras";

function isExtrasItem(d: DictionaryItem): boolean {
  const c = normCat(d.foodCategory);
  const n = normalizeFoodNameHe(d.food ?? "");
  if (
    c.includes("אלכוהול") ||
    c.includes("חטיפים") ||
    c.includes("מתוקים") ||
    c.includes("גלידות") ||
    (c.includes("מאפים") && (n.includes("עוג") || n.includes("עוגיות"))) ||
    (n.includes("שוקולד") && (c.includes("חטיפים") || c.includes("מתוקים")))
  ) {
    return true;
  }
  if (n.includes("במבה") || n.includes("ביסלי")) return true;
  /** קפה ותרחישי קפה-בר — נוספים, לא ארוחה */
  if (
    n.includes("קפוצ") ||
    n.includes("אספרסו") ||
    n.includes("לאטה") ||
    n.includes("מקיאטו") ||
    n.includes("ניטרו") ||
    n.includes("ארומה אספרסו") ||
    /cappuccino|latte|espresso|frappuccino/i.test(d.food ?? "")
  ) {
    return true;
  }
  if (
    n.includes("קפה") &&
    (n.includes("שחור") || n.includes("הפוך") || n.includes("מוקצ") || n.includes("משקה"))
  ) {
    return true;
  }
  /** מוגזרים / שתייה ממותגת — לא חלב בסיס לבוקר */
  if (c.includes("משקאות") && !c.includes("משקאות חלב")) return true;
  if (c.includes("משקאות חלב") && (n.includes("שוקו") || n.includes("מילקי") || n.includes("נסטלי"))) {
    return true;
  }
  return false;
}

/** בשר/עוף/דג «כבד» לצהריים — לא עוגן בוקר (חוק העוגנים) */
function isMiddayHeavyProtein(d: DictionaryItem): boolean {
  const c = normCat(d.foodCategory);
  const n = normalizeFoodNameHe(d.food ?? "");
  if (n.includes("טונה") || n.includes("סרדין")) return false;
  if (c.includes("בשרים טרי") || c.includes("קפואים בשר ועוף")) return true;
  if (c.includes("דגים ופירות ים") && !n.includes("טונה")) return true;
  if (/חזה עוף|עוף.*מבושל|שניצל|בקר|בשר|סטייק|קבב|קציצות|המבורג|כבש/.test(n)) {
    return true;
  }
  return false;
}

function isFruitOrYogurtSnack(d: DictionaryItem): boolean {
  const c = normCat(d.foodCategory);
  const n = normalizeFoodNameHe(d.food ?? "");
  if (c.includes("פירות טריים")) return true;
  if (c.includes("יוגורט ומעדנים") || n.includes("יוגורט") || n.includes("מעדן")) {
    return true;
  }
  return false;
}

function isBreakfastFamily(d: DictionaryItem): boolean {
  const c = normCat(d.foodCategory);
  const n = normalizeFoodNameHe(d.food ?? "");
  if (isMiddayHeavyProtein(d)) return false;
  if (
    c.startsWith("לחם") ||
    c.includes("לחם וקמחים") ||
    c.includes("גבינות") ||
    c.includes("לבן וביצים") ||
    c.includes("פסטרמות ונקניקים") ||
    c.includes("ממרחים") ||
    c.includes("סלטים") ||
    c.includes("דגני בוקר") ||
    c.includes("שימורים") ||
    c.includes("משקאות חלב") ||
    n.includes("גרנולה") ||
    n.includes("חלה") ||
    n.includes("פיתה") ||
    n.includes("כריך")
  ) {
    return true;
  }
  if (
    c.includes("ירק טרי") ||
    c.includes("ירקות קפואים") ||
    (c.includes("ירקות") && !c.includes("פירות טריים"))
  ) {
    return true;
  }
  return false;
}

function isLunchFamily(d: DictionaryItem): boolean {
  const c = normCat(d.foodCategory);
  const n = normalizeFoodNameHe(d.food ?? "");
  if (isMiddayHeavyProtein(d)) return true;
  if (c.includes("קטניות ודגנים")) return true;
  if (c.includes("שימורים") && (n.includes("טונה") || n.includes("סרדין"))) {
    return true;
  }
  if (c.includes("ירק טרי") || c.includes("ירקות")) return true;
  return false;
}

/**
 * תגיות זמן-יום לפריט — לשימוש בהנחיות AI ובסינון מקומי עתידי.
 * "dinner" כאן = אותה משפחה כמו בוקר (לא בשר כבד כעוגן).
 */
export function menuBuilderTimeOfDayHints(d: DictionaryItem): MenuBuilderTimeOfDay[] {
  if (isExtrasItem(d)) return ["extras"];

  const out = new Set<MenuBuilderTimeOfDay>();
  if (isFruitOrYogurtSnack(d)) out.add("snack");
  if (isBreakfastFamily(d)) {
    out.add("breakfast");
    out.add("dinner");
  }
  if (isLunchFamily(d)) out.add("lunch");

  if (out.size === 0) {
    out.add("breakfast");
    out.add("lunch");
    out.add("dinner");
    out.add("snack");
  }
  return Array.from(out);
}

export function menuBuilderTimeHintSummary(
  items: DictionaryItem[],
): Array<{ food: string; category?: string; timeOfDayHints: MenuBuilderTimeOfDay[] }> {
  return items.map((d) => ({
    food: d.food,
    category: d.foodCategory,
    timeOfDayHints: menuBuilderTimeOfDayHints(d),
  }));
}
