import { loadDayLogs, loadDictionary, loadFoodMemory } from "./storage";

/** חיפוש קידומת פשוט — ללא fuzzy וללא מקורות חיצוניים */
export function searchFoods(
  query: string,
  foods: readonly string[]
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return foods
    .filter((name) => name.toLowerCase().startsWith(q))
    .slice(0, 15);
}

/**
 * מסד דמה — מזונים נפוצים בישראל (השלמה מהירה)
 */
export const MOCK_ISRAELI_FOODS: string[] = [
  "חביתה",
  "חביתה בשמן זית",
  "לחמניה",
  "לחם לבן",
  "לחם מלא",
  "פיתה",
  "חומוס",
  "חומוס עם פיתה",
  "טחינה",
  "גבינה צהובה",
  "גבינה לבנה",
  "גבינת קוטג'",
  "מלפפון",
  "עגבנייה",
  "מלפפון חמוץ",
  "סלט ישראלי",
  "ביצה קשה",
  "שקשוקה",
  "אורז מבושל",
  "אורז אדום",
  "שניצל עוף",
  "חזה עוף בתנור",
  "קבב",
  "פלאפל",
  "סביח",
  "בורקס גבינה",
  "בורקס תפו״א",
  "בורקס בשר",
  "מסטיק פלאפל",
  "טחינה גולמית",
  "זיתים",
  "טונה בשמן",
  "סלט טונה",
  "יוגורט",
  "לבנה",
  "קוטג'",
  "קפה נס",
  "קפה עם חלב",
  "בננה",
  "תפוח",
  "שוקולד פרה",
  "במבה",
  "ביסלי",
  "פיצה משולש",
  "פסטה ברוטב עגבניות",
  "סנדוויץ' חביתה",
  "טוסט גבינה",
  "אבוקדו",
  "שיבולת שועל",
  "גרנולה",
  "חלב 3%",
  "מיץ תפוזים",
  "סלמון בתנור",
  "בצל ירוק",
  "גזר",
  "כרובית בתנור",
  "חלה",
  "רוגעלך",
  "עוגת שוקולד",
  "ממרח נוטלה",
];

function uniqueSorted(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "he")
  );
}

/** כל השמות הזמינים להשלמה (לקוח בלבד) */
export function buildSuggestionPool(): string[] {
  const pool = new Set<string>(MOCK_ISRAELI_FOODS);

  try {
    const mem = loadFoodMemory();
    Object.keys(mem).forEach((k) => pool.add(k));
  } catch {
    /* ignore */
  }

  try {
    const dict = loadDictionary();
    dict.forEach((d) => pool.add(d.food));
  } catch {
    /* ignore */
  }

  try {
    const logs = loadDayLogs();
    Object.values(logs).forEach((entries) => {
      entries.forEach((e) => pool.add(e.food));
    });
  } catch {
    /* ignore */
  }

  return uniqueSorted([...pool]);
}

/** מילון משתמש + זיכרון מזון + יומנים — ללא רשימת הדמה; חיפוש ראשון כאן */
export function buildUserLocalPool(): string[] {
  const pool = new Set<string>();

  try {
    const mem = loadFoodMemory();
    Object.keys(mem).forEach((k) => pool.add(k));
  } catch {
    /* ignore */
  }

  try {
    const dict = loadDictionary();
    dict.forEach((d) => pool.add(d.food));
  } catch {
    /* ignore */
  }

  try {
    const logs = loadDayLogs();
    Object.values(logs).forEach((entries) => {
      entries.forEach((e) => pool.add(e.food));
    });
  } catch {
    /* ignore */
  }

  return uniqueSorted([...pool]);
}

export function filterSuggestions(
  query: string,
  pool: string[],
  limit = 10
): string[] {
  return searchFoods(query, pool).slice(0, limit);
}
