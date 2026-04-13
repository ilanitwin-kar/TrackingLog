/**
 * מנוע המרת יחידות מטבח לגרמים לפי קטגוריה (מילות מפתח בשם המזון)
 * ונוסחה: (ערך ל־100g / 100) × משקל_גרם_כולל
 */

export type MeasureCategory =
  | "POWDERS"
  | "LIQUIDS"
  | "COOKED_GRAINS"
  | "SPREADS"
  | "FRUITS_VEG"
  | "DEFAULT";

/** ערכי עקיפה אופציונליים מהמאגר (CSV) — גרמים ליחידת מטבח אחת */
export type FoodUnitGramOverrides = {
  cup?: number;
  tbsp?: number;
  tsp?: number;
  /** מריחה / כף מריחה */
  spread?: number;
  /** יחידה (פריט בודד) */
  piece?: number;
};

const KEYWORD_GROUPS: { cat: MeasureCategory; words: string[] }[] = [
  {
    cat: "POWDERS",
    words: ["קמח", "אבקה", "סוכר", "קורנפלור"],
  },
  {
    cat: "LIQUIDS",
    words: ["חלב", "מיץ", "מים", "שתייה", "משקה", "מרק"],
  },
  {
    cat: "COOKED_GRAINS",
    words: ["אורז", "פתיתים", "פסטה", "קוסקוס", "קינואה"],
  },
  {
    cat: "SPREADS",
    words: ["שוקולד למריחה", "חומוס", "גבינה", "טחינה", "ריבה", "חמאה"],
  },
  {
    cat: "FRUITS_VEG",
    words: ["פרי", "ירק", "ירקות", "פירות", "סלט"],
  },
];

/**
 * משקל נטו ליחידה (גרם) — פירות וירקות.
 * סדר בתוך המערך לא משנה; התאמה בזמן ריצה לפי אורך מחרוזת (ארוך קודם).
 */
const PRODUCE_PIECE_WEIGHTS: { keys: string[]; grams: number }[] = [
  {
    keys: ["עגבניית שרי", "עגבניות שרי", "עגבנית שרי"],
    grams: 15,
  },
  { keys: ["תות שדה", "תותי שדה"], grams: 15 },
  { keys: ["תפוח אדמה", "תפוחי אדמה"], grams: 170 },
  { keys: ["גבעול סלרי", "גבעולי סלרי"], grams: 40 },
  { keys: ["ראש חסה", "ראשי חסה"], grams: 400 },
  { keys: ["עלה חסה", "עלי חסה"], grams: 15 },
  { keys: ["שן שום", "שיני שום"], grams: 4 },
  { keys: ["פלח מלון", "פלחי מלון"], grams: 150 },
  { keys: ["פלח אבטיח", "פלחי אבטיח"], grams: 180 },
  { keys: ["בננה", "בננות"], grams: 95 },
  { keys: ["תפוח", "תפוחים"], grams: 140 },
  { keys: ["אגס", "אגסים"], grams: 130 },
  { keys: ["אפרסק", "אפרסקים"], grams: 120 },
  { keys: ["נקטרינה", "נקטרינות"], grams: 120 },
  { keys: ["תמר", "תמרים"], grams: 18 },
  { keys: ["ענבים"], grams: 5 },
  { keys: ["דובדבן", "דובדבנים"], grams: 7 },
  { keys: ["שזיף", "שזיפים"], grams: 60 },
  { keys: ["משמש", "משמשים"], grams: 35 },
  { keys: ["קיווי", "קיוויים"], grams: 70 },
  { keys: ["מנגו", "מנגואים"], grams: 200 },
  { keys: ["קלמנטינה", "קלמנטינות"], grams: 80 },
  { keys: ["תפוז", "תפוזים"], grams: 150 },
  { keys: ["אשכולית", "אשכוליות"], grams: 200 },
  { keys: ["לימון", "לימונים"], grams: 50 },
  { keys: ["מלון", "מלונים"], grams: 150 },
  { keys: ["אבטיח", "אבטיחים"], grams: 180 },
  { keys: ["תאנה", "תאנים"], grams: 40 },
  { keys: ["מלפפון", "מלפפונים"], grams: 100 },
  { keys: ["עגבניה", "עגבניות"], grams: 130 },
  { keys: ["גזר", "גזרים"], grams: 60 },
  { keys: ["גמבה", "גמבות"], grams: 150 },
  { keys: ["פלפל", "פלפלים"], grams: 150 },
  { keys: ["בצל", "בצלים"], grams: 100 },
  { keys: ["קישוא", "קישואים"], grams: 150 },
  { keys: ["חציל", "חצילים"], grams: 300 },
  { keys: ["בטטה", "בטטות"], grams: 200 },
  { keys: ["צנון", "צנונים"], grams: 40 },
];

/** ברירת מחדל לפרי/ירק בלי רשומה ספציפית בטבלה */
const PRODUCE_PIECE_FALLBACK_GRAMS = 100;

type KeyGram = { key: string; grams: number };

function buildProduceKeyListSorted(): KeyGram[] {
  const flat: KeyGram[] = [];
  for (const { keys, grams } of PRODUCE_PIECE_WEIGHTS) {
    for (const key of keys) {
      flat.push({ key, grams });
    }
  }
  flat.sort((a, b) => b.key.length - a.key.length);
  return flat;
}

const PRODUCE_KEYS_SORTED: KeyGram[] = buildProduceKeyListSorted();

function normalizeFoodName(foodName: string): string {
  return foodName.normalize("NFC");
}

/** התאמת משקל יחידה לפירות/ירקות — התאמה ראשונה לפי מחרוזת הארוכה ביותר */
export function resolveProducePieceGrams(foodName: string): number | undefined {
  const n = normalizeFoodName(foodName);
  for (const { key, grams } of PRODUCE_KEYS_SORTED) {
    if (n.includes(key)) return grams;
  }
  return undefined;
}

/** טבלאות גרם ליחידה לפי קטגוריה — כוס / כף / כפית / מריחה / יחידה (כשאין טבלת פרי/ירק) */
const GRAMS: Record<
  MeasureCategory,
  { cup: number; tbsp: number; tsp: number; spread: number; piece: number }
> = {
  POWDERS: { cup: 140, tbsp: 10, tsp: 3, spread: 20, piece: 100 },
  LIQUIDS: { cup: 240, tbsp: 15, tsp: 5, spread: 20, piece: 100 },
  COOKED_GRAINS: { cup: 170, tbsp: 20, tsp: 5, spread: 20, piece: 100 },
  SPREADS: { cup: 200, tbsp: 20, tsp: 7, spread: 20, piece: 100 },
  FRUITS_VEG: { cup: 200, tbsp: 15, tsp: 5, spread: 20, piece: 150 },
  DEFAULT: { cup: 200, tbsp: 15, tsp: 5, spread: 20, piece: 100 },
};

export function inferMeasureCategory(foodName: string): MeasureCategory {
  const n = normalizeFoodName(foodName);
  for (const { key } of PRODUCE_KEYS_SORTED) {
    if (n.includes(key)) return "FRUITS_VEG";
  }
  for (const { cat, words } of KEYWORD_GROUPS) {
    for (const w of words) {
      if (n.includes(w)) return cat;
    }
  }
  return "DEFAULT";
}

export type CanonicalKitchenUnit =
  | "גרם"
  | "כוס"
  | "כף"
  | "כפית"
  | "מריחה"
  | "יחידה";

/** נרמול תווית יחידה (legacy / סינונים) */
export function normalizeKitchenUnit(unit: string): CanonicalKitchenUnit {
  const u = unit.trim();
  if (u === "כף מריחה") return "מריחה";
  if (
    u === "גרם" ||
    u === "כוס" ||
    u === "כף" ||
    u === "כפית" ||
    u === "מריחה" ||
    u === "יחידה"
  ) {
    return u;
  }
  return "גרם";
}

function gramsForUnitFromTable(
  cat: MeasureCategory,
  unit: CanonicalKitchenUnit
): number {
  const g = GRAMS[cat];
  switch (unit) {
    case "גרם":
      return 1;
    case "כוס":
      return g.cup;
    case "כף":
      return g.tbsp;
    case "כפית":
      return g.tsp;
    case "מריחה":
      return g.spread;
    case "יחידה":
      return g.piece;
    default:
      return 1;
  }
}

/**
 * גרמים ליחידת מטבח אחת — קודם עקיפות מהמאגר (CSV), אחר כך טבלת פרי/ירק ליחידה, אחר כך קטגוריה.
 */
export function resolveGramsPerKitchenUnit(
  foodName: string,
  unitRaw: string,
  overrides?: FoodUnitGramOverrides | null
): number {
  const unit = normalizeKitchenUnit(unitRaw);
  if (unit === "גרם") return 1;

  const o = overrides;
  const fromOverride = (): number | undefined => {
    switch (unit) {
      case "כוס":
        return o?.cup;
      case "כף":
        return o?.tbsp;
      case "כפית":
        return o?.tsp;
      case "מריחה":
        return o?.spread;
      case "יחידה":
        return o?.piece;
      default:
        return undefined;
    }
  };

  const direct = fromOverride();
  if (direct != null && Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  if (unit === "יחידה") {
    const piece = resolveProducePieceGrams(foodName);
    if (piece != null) return piece;
    const cat = inferMeasureCategory(foodName);
    if (cat === "FRUITS_VEG") {
      return PRODUCE_PIECE_FALLBACK_GRAMS;
    }
    return gramsForUnitFromTable(cat, unit);
  }

  const cat = inferMeasureCategory(foodName);
  return gramsForUnitFromTable(cat, unit);
}

/**
 * סה״כ גרמים במנה: כמות × גרם ליחידה (ב־״גרם״ — הכמות היא כבר גרמים).
 */
export function totalGramsForServing(
  foodName: string,
  quantity: number,
  unitRaw: string,
  overrides?: FoodUnitGramOverrides | null
): number {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return 0;
  const unit = normalizeKitchenUnit(unitRaw);
  if (unit === "גרם") return q;
  const per = resolveGramsPerKitchenUnit(foodName, unit, overrides);
  return q * per;
}
