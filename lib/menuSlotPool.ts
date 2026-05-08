import type { DictionaryItem } from "@/lib/storage";
import type { MealSlotKind } from "@/lib/menuWizardLabels";

/** קטגוריית מאגר — נירמול עדין להשוואה */
export function normCat(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function normalizeFoodNameHe(s: string): string {
  return s.trim().toLowerCase();
}

export function isVegetableCategory(cat: string): boolean {
  const c = normCat(cat);
  if (c.includes("פירות טריים")) return false;
  return (
    c.includes("ירק טרי") ||
    c.includes("ירקות קפואים") ||
    c.includes("פירות וירקות קפואים") ||
    c.includes("נבט") ||
    c.includes("חסה") ||
    c.includes("ברוקולי") ||
    (c.includes("ירקות") && !c.includes("פירות טריים"))
  );
}

export function isFruitCategory(cat: string | undefined): boolean {
  return normCat(cat).includes("פירות טריים");
}

/**
 * האם פריט מתאים למשבצת — לפי קטגוריית מאגר (כמו dbCategory במזווה הבונה תפריטים)
 * ומילות מפתח בשם המוצר.
 */
export function dictionaryMatchesSlotTheme(
  d: DictionaryItem,
  kind: MealSlotKind,
  includeVegetable: boolean,
): boolean {
  const c = normCat(d.foodCategory);
  const n = normalizeFoodNameHe(d.food ?? "");

  /** ב־primary ירקות נכללים בתמה של ארוחות עיקריות — כדי שיופיעו במאגר המסונן */
  const vegetableOkInPrimaryTheme =
    kind === "lunch" || kind === "breakfast" || kind === "dinner";

  if (
    !includeVegetable &&
    isVegetableCategory(c) &&
    !vegetableOkInPrimaryTheme
  ) {
    return false;
  }

  /** ביניים / לפני שינה: פירות, חטיפי דגנים, מעדנים חלב, יוגורט, גרנולה קלה וכו׳ */
  if (kind === "snack" || kind === "late") {
    const dairySnack =
      c.includes("משקאות חלב") ||
      c.includes("יוגורט ומעדנים") ||
      n.includes("יוגורט") ||
      n.includes("מעדן");
    return (
      isFruitCategory(d.foodCategory) ||
      c.includes("פירות וירקות קפואים") ||
      c.includes("חטיפי דגנים") ||
      c.includes("חטיפים ומתוקים") ||
      dairySnack ||
      c.includes("גלידות") ||
      c.includes("מאפים") ||
      c.includes("דגני בוקר") ||
      c.includes("אגוזים") ||
      n.includes("גרנולה") ||
      n.includes("חטיף") ||
      n.includes("בר ") ||
      n.includes("פרי") ||
      n.includes("סירופ") ||
      n.includes("נוגט") ||
      n.includes("קינוח")
    );
  }

  /** צהריים: בשרים, דגים, קטניות, ירקות, שימורים, מנות קפואות מלאות, תחליפי צומח */
  if (kind === "lunch") {
    return (
      c.includes("בשרים טרי") ||
      c.includes("בשרים טרי ומבושל") ||
      c.includes("קפואים בשר ועוף") ||
      c.includes("דגים ופירות ים") ||
      c.includes("קטניות ודגנים") ||
      c.includes("ירק טרי") ||
      c.includes("שימורים") ||
      c.includes("מזונות קפואים") ||
      c.includes("טבעוני וצמחי") ||
      c.includes("תחליפים מהצומח") ||
      isVegetableCategory(c)
    );
  }

  /** בוקר / ערב קליל: לחם, פסטרמה, גבינות וביצים, קפואים (כריך־ביצה), ממרחים, משקאות חלב, דגני בוקר, טונה/סרדין/אבוקדו… */
  if (kind === "breakfast" || kind === "dinner") {
    if (isVegetableCategory(c)) return true;

    const breadEtc =
      c.startsWith("לחם") ||
      c.includes("לחם וקמחים") ||
      c.includes("פסטרמות ונקניקים") ||
      c.includes("גבינות") ||
      c.includes("לבן וביצים") ||
      c.includes("מזונות קפואים") ||
      c.includes("סלטים") ||
      c.includes("ריבות") ||
      c.includes("ממרחים") ||
      c.includes("משקאות חלב") ||
      c.includes("יוגורט ומעדנים") ||
      c.includes("דגני בוקר") ||
      c.includes("דגים ופירות ים") ||
      c.includes("שימורים") ||
      c.includes("חטיפי דגנים") ||
      c.includes("המזווה - כללי") ||
      c.includes("אבקות") ||
      c.includes("תערובות") ||
      c.includes("הכנה מהירה") ||
      isFruitCategory(d.foodCategory);

    const nameHints =
      n.includes("ביצה") ||
      n.includes("חביתה") ||
      n.includes("ביצת עין") ||
      n.includes("טונה") ||
      n.includes("סרדין") ||
      n.includes("אבוקדו") ||
      n.includes("כריך") ||
      n.includes("פריסה") ||
      n.includes("פיתה") ||
      n.includes("חלה") ||
      n.includes("טורטיה") ||
      n.includes("פסטרמה") ||
      n.includes("נקניק") ||
      n.includes("סלמי") ||
      n.includes("גבינה") ||
      n.includes("קוטג") ||
      n.includes("לבנה") ||
      n.includes("חומוס") ||
      n.includes("טחינה") ||
      n.includes("גרנולה") ||
      n.includes("דגני") ||
      n.includes("קריספי") ||
      n.includes("קורנפלקס");

    return breadEtc || nameHints;
  }

  return true;
}

/**
 * מסנן מאגר למשבצת: קודם לפי תמה; אם ריק — מחזיר את המאגר המקורי (לא לחסום בנייה).
 */
export function filterPoolBySlotTheme(
  pool: DictionaryItem[],
  kind: MealSlotKind,
  role: "primary" | "any",
): DictionaryItem[] {
  const incVeg = role === "any";
  const themed = pool.filter((d) =>
    dictionaryMatchesSlotTheme(d, kind, incVeg),
  );
  return themed.length > 0 ? themed : pool;
}

export function vegetableCandidates(pool: DictionaryItem[]): DictionaryItem[] {
  return pool.filter((d) => isVegetableCategory(d.foodCategory ?? ""));
}
