/** מזווה ייעודי לבניית תפריט — קטגוריות מתוך מאגר האינטליגנציה הקלורית (CSV) */

import { isFoodDbCategoryExcludedFromPantry } from "./foodDbPantryExclude";
import { loadDictionary, type DictionaryItem } from "./storage";
import {
  mealWizardLabels,
  readStoredMenuMealCount,
  slotKindFromTitle,
} from "./menuWizardLabels";

/** כל שלב = קטגוריית מאגר אחת בלבד (בלי בחירה כפולה) */
export type PantryAtomicStepId =
  | "breads"
  | "dairy_milk"
  | "dairy_cheese"
  | "substitutes"
  | "legumes"
  | "meat_fresh"
  | "meat_frozen"
  | "meat_deli"
  | "pantry"
  | "canned"
  | "vegetables"
  | "fruits"
  | "nuts_seeds_dried"
  | "powders_mixes"
  | "cereal_granola"
  | "frozen_ready_meals"
  | "spreads_jams"
  | "frozen_fruits_vegetables"
  | "sauces_syrups"
  | "oils_butter_spices"
  | "fish_fresh"
  | "fish_frozen"
  | "treat_snacks"
  | "treat_ice"
  | "treat_baked"
  | "treat_alcohol"
  | "treat_cereal_bar"
  | "aroma_per_meal"
  | "mcdonalds_per_meal";

export type MenuBuilderPantryPersistedV1 = {
  v: 2;
  dairySkipped: boolean;
  explorerIdsByStep: Partial<Record<PantryAtomicStepId, string[]>>;
  dictionaryIdByExplorerId: Record<string, string>;
  /** אינדקס ארוחה ביחס ל־mealWizardLabels */
  treatMealByExplorerId: Partial<Record<string, number>>;
};

export const MENU_BUILDER_PANTRY_KEY = "cj_menu_builder_pantry_v1";

export type PantryAtomicStepDef = {
  id: PantryAtomicStepId;
  title: string;
  hint: string;
  /** קטגוריה יחידה במאגר — כפי שמופיעה ב־CSV (לחיפוש ב־API) */
  dbCategory: string;
  min: number;
  /** אפשר להתקדם בלי למלא — האימות בסוף יכשל אם חסר מינימום */
  allowAdvanceWithoutMin: boolean;
  /** טקסט עזר לשורת החיפוש */
  searchExamples: string;
};

/** דיאלוג ארוחה — רק הקטגוריות שנדרשות במפרט המוצר */
const ASKS_TREAT_MEAL_DIALOG_IDS = new Set<PantryAtomicStepId>([
  "treat_snacks",
  "treat_ice",
  "treat_baked",
  "treat_alcohol",
  "aroma_per_meal",
  "mcdonalds_per_meal",
]);

/** שלב «ארומה לפי מנה» — רק מנות ארומה אספרסו בר בקטגוריה «לפי מנה» */
export function isPerMealAromaEspressoBarProductName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  return n.includes("ארומה אספרסו בר");
}

/** שלב «מקדונלדס לפי מנה» — מנות שבשם מופיע המותג המלא כפי שבמאגר */
export function isMcDonaldsPerMealProductName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  return n.includes("מקדונלדס");
}

export function asksTreatMealDialog(id: PantryAtomicStepId): boolean {
  return ASKS_TREAT_MEAL_DIALOG_IDS.has(id);
}

/** מוצר מקטגוריית מאגר «לפי מנה» — דורש שאילת ארוחה בשלב בחירת המזונות */
export function isDictionaryPerMealCategory(
  item: Pick<DictionaryItem, "foodCategory">,
): boolean {
  const c = (item.foodCategory ?? "").trim().toLowerCase();
  return c.includes("לפי מנה");
}

/** אגוזים/זרעים/פירות יבשים — «יבש»/«טרי» בשם המוצר לא מצביעים על לא-אכיל */
export function skipPantryRawDryFreshFilters(dbCategory: string): boolean {
  const c = dbCategory.trim();
  if (!c) return false;
  if (c.includes("אגוזים") && c.includes("זרעים")) return true;
  if (/פירות\s*יבשים/.test(c) && (/אגוזים/.test(c) || /זרעים/.test(c)))
    return true;
  return false;
}

/**
 * יישומוני Explorer במזווה שממופים למזון במילון ודורשים יישום ארוחה.
 * כש־`scanAllPantrySteps` — מחפש בכל שלבי המזווה (נדרש לפריטי «לפי מנה» לפי קטגוריית המוצר).
 */
export function explorerIdsForTreatDictionaryId(
  pantry: MenuBuilderPantryPersistedV1,
  dictionaryId: string,
  scanAllPantrySteps: boolean,
): string[] {
  const stepIds: PantryAtomicStepId[] = scanAllPantrySteps
    ? (Object.keys(pantry.explorerIdsByStep) as PantryAtomicStepId[])
    : [...ASKS_TREAT_MEAL_DIALOG_IDS];

  const out: string[] = [];
  for (const stepId of stepIds) {
    for (const exId of pantry.explorerIdsByStep[stepId] ?? []) {
      if (pantry.dictionaryIdByExplorerId[exId] === dictionaryId) {
        out.push(exId);
      }
    }
  }
  return [...new Set(out)];
}

export function needsTreatMealAssignmentForDictionary(
  pantry: MenuBuilderPantryPersistedV1,
  dictionaryId: string,
  dictionaryItem?: Pick<DictionaryItem, "foodCategory">,
): boolean {
  const scanAll =
    dictionaryItem != null && isDictionaryPerMealCategory(dictionaryItem);
  const exIds = explorerIdsForTreatDictionaryId(
    pantry,
    dictionaryId,
    scanAll,
  );
  if (exIds.length === 0) return false;
  return exIds.some((exId) => pantry.treatMealByExplorerId[exId] == null);
}

export function assignTreatMealSlotsForDictionary(
  state: MenuBuilderPantryPersistedV1,
  dictionaryId: string,
  mealSlotIndex: number,
  dictionaryItem?: Pick<DictionaryItem, "foodCategory">,
): MenuBuilderPantryPersistedV1 {
  const scanAll =
    dictionaryItem != null && isDictionaryPerMealCategory(dictionaryItem);
  const exIds = explorerIdsForTreatDictionaryId(
    state,
    dictionaryId,
    scanAll,
  );
  if (exIds.length === 0) return state;
  const treatMealByExplorerId = { ...state.treatMealByExplorerId };
  for (const exId of exIds) {
    treatMealByExplorerId[exId] = mealSlotIndex;
  }
  return { ...state, treatMealByExplorerId };
}

export function remapPantryMealSlotIndex(
  idx: number,
  fromCount: number,
  toCount: number,
): number {
  const oldLabels = mealWizardLabels(fromCount);
  const newLabels = mealWizardLabels(toCount);
  const safeIdx = Math.min(Math.max(0, idx), Math.max(0, oldLabels.length - 1));
  const title = oldLabels[safeIdx];
  if (!title) return Math.min(safeIdx, Math.max(0, newLabels.length - 1));
  const exact = newLabels.findIndex((t) => t === title);
  if (exact >= 0) return exact;
  const kind = slotKindFromTitle(title);
  const hit = newLabels.findIndex((t) => slotKindFromTitle(t) === kind);
  if (hit >= 0) return hit;
  return Math.min(safeIdx, Math.max(0, newLabels.length - 1));
}

export type PantryTreatLockInput = {
  explorerId: string;
  mealIndex: number;
  food: DictionaryItem;
  grams: number;
};

export function buildPantryTreatLocksForMenu(opts: {
  pantry: MenuBuilderPantryPersistedV1;
  dictionaryById: Map<string, DictionaryItem>;
  mealCount: number;
  storedMealCount: number | null;
  grams?: number;
}): PantryTreatLockInput[] {
  const grams = opts.grams ?? 100;
  const fromCount = opts.storedMealCount ?? opts.mealCount;
  const locks: PantryTreatLockInput[] = [];
  const pantry = opts.pantry;

  for (const stepId of Object.keys(pantry.explorerIdsByStep) as PantryAtomicStepId[]) {
    const exIds = pantry.explorerIdsByStep[stepId] ?? [];
    for (const exId of exIds) {
      const dictId = pantry.dictionaryIdByExplorerId[exId];
      const slotRaw = pantry.treatMealByExplorerId[exId];
      if (dictId == null || slotRaw == null) continue;
      const food = opts.dictionaryById.get(dictId);
      if (!food) continue;
      const lockMe =
        asksTreatMealDialog(stepId) || isDictionaryPerMealCategory(food);
      if (!lockMe) continue;
      const mealIndex = remapPantryMealSlotIndex(
        Number(slotRaw),
        fromCount,
        opts.mealCount,
      );
      locks.push({ explorerId: exId, mealIndex, food, grams });
    }
  }
  return locks;
}

export const PANTRY_ATOMIC_STEPS: PantryAtomicStepDef[] = [
  {
    id: "breads",
    title: "לחם וקמחים",
    hint: "בחרו לפחות 3 מוצרים — לרוב לבוקר או לערב (כריך, פרוסות וכו׳)",
    dbCategory: "לחם וקמחים",
    min: 3,
    allowAdvanceWithoutMin: true,
    searchExamples: "לחם מחמצת, פרוסות דקות, פיתה, חלה, טורטיה",
  },
  {
    id: "dairy_milk",
    title: "משקאות חלב יוגורט ומעדנים",
    hint: "בחרו לפחות 3 מוצרים",
    dbCategory: "משקאות חלב יוגורט ומעדנים",
    min: 3,
    allowAdvanceWithoutMin: true,
    searchExamples: "יוגורט, שמנת חמוצה, חלב 3%, מעדן חלב",
  },
  {
    id: "dairy_cheese",
    title: "גבינות, לבן וביצים",
    hint: "בחרו לפחות 2 מוצרים",
    dbCategory: "גבינות, לבן וביצים",
    min: 2,
    allowAdvanceWithoutMin: true,
    searchExamples: "ביצה קשה, גבינה צהובה, קוטג׳, גבינת שקדים",
  },
  {
    id: "substitutes",
    title: "טבעוני וצמחי ? תחליפים מהצומח",
    hint: "רשות — אפשר לדלג או להוסיף לפי מה שאתם אוכלים מהצומח",
    dbCategory: "טבעוני וצמחי ? תחליפים מהצומח",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "טופו, טמפה, חלב שקדים, גבינה צמחית",
  },
  {
    id: "legumes",
    title: "קטניות ודגנים",
    hint: "בחרו לפחות 3 מוצרים — לדוגמה: עדשים, קינואה, אורז מלא",
    dbCategory: "קטניות ודגנים",
    min: 3,
    allowAdvanceWithoutMin: true,
    searchExamples: "עדשים ירוקות, קוסקוס מלא, שעורה, אפונה יבשה",
  },
  {
    id: "meat_fresh",
    title: "בשרים טרי ומבושל",
    hint: "בחרו לפחות מוצר אחד",
    dbCategory: "בשרים טרי ומבושל",
    min: 1,
    allowAdvanceWithoutMin: true,
    searchExamples: "חזה עוף, בשר בקר טחון, כתף הודו",
  },
  {
    id: "meat_frozen",
    title: "קפואים בשר ועוף",
    hint: "רשות — אפשר לדלג או להוסיף לפי מה שיש במקפיא",
    dbCategory: "קפואים בשר ועוף",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "שניצלים קפואים, נגיסי עוף, המבורגר קפוא",
  },
  {
    id: "meat_deli",
    title: "פסטרמות ונקניקים",
    hint: "רשות — אפשר לדלג או להוסיף לכריך",
    dbCategory: "פסטרמות ונקניקים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "פסטרמה, נקניק מעושן, סלמי",
  },
  {
    id: "pantry",
    title: "המזווה - כללי",
    hint: "רשות — אפשר לדלג או להוסיף מוצרי יסוד",
    dbCategory: "המזווה - כללי",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "אורז לבן, פסטה, קמח, שמן זית",
  },
  {
    id: "canned",
    title: "שימורים",
    hint: "בחרו לפחות 3 מוצרים",
    dbCategory: "שימורים",
    min: 3,
    allowAdvanceWithoutMin: true,
    searchExamples: "טונה בשמן, עגבניות קוצץ, חומוס",
  },
  {
    id: "vegetables",
    title: "ירק טרי / מבושל",
    hint: "בחרו לפחות 3 מוצרים",
    dbCategory: "ירק טרי / מבושל",
    min: 3,
    allowAdvanceWithoutMin: true,
    searchExamples: "עגבניה, מלפפון, ברוקולי, גזר",
  },
  {
    id: "fruits",
    title: "פירות טריים",
    hint: "בחרו לפחות 3 מוצרים",
    dbCategory: "פירות טריים",
    min: 3,
    allowAdvanceWithoutMin: true,
    searchExamples: "תפוח, בננה, תות, אבוקדו",
  },
  {
    id: "nuts_seeds_dried",
    title: "אגוזים, זרעים ופירות יבשים",
    hint: "מוצרים כפי שבמאגר — גם אם בשם מופיע יבש או טרי זה אוכל תקין כך",
    dbCategory: "אגוזים, זרעים ופירות יבשים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "שקדים, אגוז מלך, גרעיני חמניה, צימוקים",
  },
  {
    id: "powders_mixes",
    title: "אבקות, תערובות והכנה מהירה",
    hint: "רשות — מוצגות רק תוצאות «מוכנות לאכילה» בשם; אבקה/תערובת יבשה בלי סימון מוכן לא תופיע.",
    dbCategory: "אבקות, תערובות והכנה מהירה",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "תערובת עוגה, אבקת מרק, פנקייק מוכן",
  },
  {
    id: "cereal_granola",
    title: "דגני בוקר וגרנולה",
    hint: "רשות — מה שנוח לכם מהמאגר",
    dbCategory: "דגני בוקר וגרנולה",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "קורנפלקס, גרנולה, חיטים מלאים",
  },
  {
    id: "frozen_ready_meals",
    title: "מזונות קפואים ומצוננים",
    hint: "רשות — מה שנוח לכם מהמאגר",
    dbCategory: "מזונות קפואים ומצוננים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "ארוחה קפואה, פיצה קפואה, ירקות מוקפצים",
  },
  {
    id: "spreads_jams",
    title: "סלטים, ריבות וממרחים",
    hint: "רשות — מה שנוח לכם מהמאגר",
    dbCategory: "סלטים, ריבות וממרחים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "חומוס, טחינה, ריבת תות, ממרח זיתים",
  },
  {
    id: "frozen_fruits_vegetables",
    title: "פירות וירקות קפואים",
    hint: "רשות — מה שנוח לכם מהמאגר",
    dbCategory: "פירות וירקות קפואים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "תערובת ירקות קפואה, פירות יער קפואים, תירס קפוא",
  },
  {
    id: "sauces_syrups",
    title: "רטבים וסירופים",
    hint: "רשות — מה שנוח לכם מהמאגר",
    dbCategory: "רטבים וסירופים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "קטשופ, חרדל, סירופ שוקולד, רוטב סויה",
  },
  {
    id: "oils_butter_spices",
    title: "שמנים חמאות ותבלינים",
    hint: "רשות — מה שנוח לכם מהמאגר",
    dbCategory: "שמנים חמאות ותבלינים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "שמן זית, חמאה, מלח, פלפל שחור, כורכום",
  },
  {
    id: "fish_fresh",
    title: "דגים ופירות ים",
    hint: "רשות — אפשר לדלג או להוסיף דגים טריים / מוכנים",
    dbCategory: "דגים ופירות ים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "סלמון, טונה טרייה, דניס, מושט",
  },
  {
    id: "fish_frozen",
    title: "דגים ופירות ים, קפואים ומוכנים",
    hint: "רשות — אפשר לדלג או להוסיף מהמקפיא",
    dbCategory: "דגים ופירות ים, קפואים ומוכנים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "פילה דג קפוא, קציצות דג, סלמון קפוא",
  },
  {
    id: "treat_snacks",
    title: "חטיפים ומתוקים",
    hint: "רשות",
    dbCategory: "חטיפים ומתוקים",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "חטיף חלבון, חטיף דגנים, שוקולד",
  },
  {
    id: "treat_ice",
    title: "גלידות",
    hint: "רשות",
    dbCategory: "גלידות",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "גלידת וניל, מגנום, יוגורט קפוא",
  },
  {
    id: "treat_baked",
    title: "מאפים, עוגות ועוגיות",
    hint: "רשות",
    dbCategory: "מאפים, עוגות ועוגיות",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "עוגיית שיבולת שועל, עוגת גבינה, קרואסון",
  },
  {
    id: "treat_alcohol",
    title: "אלכוהול, תרכיזים ומשקאות",
    hint: "רשות",
    dbCategory: "אלכוהול, תרכיזים ומשקאות",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "יין אדום, בירה, משקה משכר",
  },
  {
    id: "treat_cereal_bar",
    title: "חטיפי דגנים אנרגיה וחלבון",
    hint: "רשות — ללא נעילת ארוחה",
    dbCategory: "חטיפי דגנים אנרגיה וחלבון",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "חטיף חלבון, בר דגנים",
  },
  {
    id: "aroma_per_meal",
    title: "ארומה אספרסו בר — לפי מנה",
    hint: "רשות — חברת ארומה אספרסו בר: מנות מקטגוריה «לפי מנה» שבשם המוצר מופיע המותג. החיפוש מסנן אוטומטית.",
    dbCategory: "לפי מנה",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "אייס ארומה, בוקר ארומה, מרק עדשים ארומה",
  },
  {
    id: "mcdonalds_per_meal",
    title: "מקדונלדס לפי מנה",
    hint: "רשות — רשת מקדונלדס: מנות מקטגוריה «לפי מנה» שבשם המוצר מופיע המותג. החיפוש מסנן אוטומטית.",
    dbCategory: "לפי מנה",
    min: 0,
    allowAdvanceWithoutMin: true,
    searchExamples: "ביג מק מקדונלדס, צ׳יקן מקדונלדס, צ׳יזבורגר מקדונלדס",
  },
];

/**
 * לאיזה שלב מזווה שייך מוצר מהמאגר (לחיפוש בכל המאגר).
 * מחזיר null לקטגוריות מוחרגות (למשל «ארומה אוכל מוכן למאה גרם»).
 */
export function resolvePantryAtomicStepForFoodRow(row: {
  category: string;
  name: string;
}): PantryAtomicStepId | null {
  const cat = (row.category ?? "").trim();
  if (!cat || isFoodDbCategoryExcludedFromPantry(cat)) return null;
  const matches = PANTRY_ATOMIC_STEPS.filter((d) => d.dbCategory === cat);
  if (matches.length === 0) return "pantry";
  if (matches.length === 1) return matches[0]!.id;
  if (isMcDonaldsPerMealProductName(row.name)) return "mcdonalds_per_meal";
  if (isPerMealAromaEspressoBarProductName(row.name)) return "aroma_per_meal";
  return "aroma_per_meal";
}

function idxOr0(i: number): number {
  return i >= 0 ? i : 0;
}

function coerceTreatSlot(val: unknown, labels: string[]): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.max(0, Math.min(labels.length - 1, Math.round(val)));
  }
  if (typeof val !== "string") return undefined;
  const mapLegacy: Record<string, (labs: string[]) => number> = {
    breakfast: (labs) => idxOr0(labs.findIndex((t) => t.includes("בוקר"))),
    snack: (labs) => idxOr0(labs.findIndex((t) => t.includes("ביניים"))),
    lunch: (labs) => idxOr0(labs.findIndex((t) => t.includes("צהריים"))),
    dinner: (labs) =>
      idxOr0(
        labs.findIndex(
          (t) => t.includes("ערב") && !t.includes("צהריים"),
        ),
      ),
    late: (labs) => idxOr0(labs.findIndex((t) => t.includes("לפני שינה"))),
  };
  const fn = mapLegacy[val];
  if (!fn) return undefined;
  return Math.min(labels.length - 1, Math.max(0, fn(labels)));
}

function migrateTreatMealMap(
  raw: Record<string, unknown>,
  labelCount: number,
): Partial<Record<string, number>> {
  const labels = mealWizardLabels(labelCount);
  const out: Partial<Record<string, number>> = {};
  for (const [exId, val] of Object.entries(raw)) {
    const idx = coerceTreatSlot(val, labels);
    if (idx !== undefined) out[exId] = idx;
  }
  return out;
}

export function defaultPantryState(): MenuBuilderPantryPersistedV1 {
  return {
    v: 2,
    dairySkipped: false,
    explorerIdsByStep: {},
    dictionaryIdByExplorerId: {},
    treatMealByExplorerId: {},
  };
}

export function visiblePantryAtomicSteps(): PantryAtomicStepDef[] {
  return PANTRY_ATOMIC_STEPS;
}

type LegacyV1State = {
  v?: number;
  dairySkipped?: boolean;
  explorerIdsByStep?: Record<string, string[]>;
  dictionaryIdByExplorerId?: Record<string, string>;
  treatMealByExplorerId?: Record<string, unknown>;
};

function migrateLegacyPantry(raw: LegacyV1State): MenuBuilderPantryPersistedV1 {
  const next = defaultPantryState();
  next.dairySkipped = Boolean(raw.dairySkipped);
  next.dictionaryIdByExplorerId = { ...(raw.dictionaryIdByExplorerId ?? {}) };
  next.treatMealByExplorerId = migrateTreatMealMap(
    { ...(raw.treatMealByExplorerId ?? {}) },
    5,
  );
  const old = raw.explorerIdsByStep ?? {};
  const map: Partial<Record<PantryAtomicStepId, string[]>> = {};
  if (old.breads) map.breads = [...old.breads];
  if (old.dairy) {
    map.dairy_milk = [...old.dairy];
  }
  if (old.legumes) map.legumes = [...old.legumes];
  if (old.meats) map.meat_fresh = [...old.meats];
  if (old.pantry) map.pantry = [...old.pantry];
  if (old.canned) map.canned = [...old.canned];
  if (old.vegetables) map.vegetables = [...old.vegetables];
  if (old.fruits) map.fruits = [...old.fruits];
  if (old.fish) map.fish_fresh = [...old.fish];
  if (old.substitutes) map.substitutes = [...old.substitutes];
  if (old.treats) map.treat_snacks = [...old.treats];
  next.explorerIdsByStep = map;
  return next;
}

export function countAtomicStep(
  state: MenuBuilderPantryPersistedV1,
  stepId: PantryAtomicStepId,
): number {
  return state.explorerIdsByStep[stepId]?.length ?? 0;
}

export type PantryValidationIssue = {
  stepId: PantryAtomicStepId;
  title: string;
  message: string;
};

/** כל הקטגוריות שלא עומדות במינימום — בסדר המופיע במזווה */
export function pantryValidationIssues(
  state: MenuBuilderPantryPersistedV1,
): PantryValidationIssue[] {
  const defs = visiblePantryAtomicSteps();
  const out: PantryValidationIssue[] = [];
  for (const def of defs) {
    if (def.min === 0) continue;
    const n = countAtomicStep(state, def.id);
    if (n < def.min) {
      out.push({
        stepId: def.id,
        title: def.title,
        message: `חסרים מוצרים ב«${def.title}»: נדרשים לפחות ${def.min}, נבחרו ${n}.`,
      });
    }
  }
  return out;
}

export function validatePantryState(
  state: MenuBuilderPantryPersistedV1,
): { ok: boolean; message?: string; stepId?: PantryAtomicStepId } {
  const issues = pantryValidationIssues(state);
  if (issues.length === 0) return { ok: true };
  const first = issues[0]!;
  return {
    ok: false,
    stepId: first.stepId,
    message: first.message,
  };
}

export function allPantryDictionaryIds(
  state: MenuBuilderPantryPersistedV1,
): string[] {
  const ids = new Set<string>();
  for (const list of Object.values(state.explorerIdsByStep)) {
    if (!list) continue;
    for (const ex of list) {
      const d = state.dictionaryIdByExplorerId[ex];
      if (d) ids.add(d);
    }
  }
  return [...ids];
}

/** פיצול נתונים ישנים: פריטי מקדונלדס שנשמרו תחת השלב המשולב עוברים ל־mcdonalds_per_meal */
function migrateMcDonaldsOutOfAromaStep(
  state: MenuBuilderPantryPersistedV1,
): MenuBuilderPantryPersistedV1 {
  const aromaList = state.explorerIdsByStep.aroma_per_meal;
  if (!aromaList?.length) return state;
  const dict = loadDictionary();
  const stayAroma: string[] = [];
  const moveToMcd: string[] = [];
  for (const exId of aromaList) {
    const dictId = state.dictionaryIdByExplorerId[exId];
    const food =
      dictId != null
        ? dict.find((d) => d.id === dictId)?.food?.trim() ?? ""
        : "";
    if (isMcDonaldsPerMealProductName(food)) moveToMcd.push(exId);
    else stayAroma.push(exId);
  }
  if (moveToMcd.length === 0) return state;
  const existingMcd = state.explorerIdsByStep.mcdonalds_per_meal ?? [];
  const combined = [...new Set([...existingMcd, ...moveToMcd])];
  return {
    ...state,
    explorerIdsByStep: {
      ...state.explorerIdsByStep,
      aroma_per_meal: stayAroma,
      mcdonalds_per_meal: combined,
    },
  };
}

export function treatMealSlotLabel(labels: string[], idx: number): string {
  if (idx < 0 || idx >= labels.length) return "";
  return labels[idx] ?? "";
}

function migrateV2ExplorerIdsFromLegacyKeys(
  raw: Partial<Record<PantryAtomicStepId, string[]>> &
    Partial<{ treat_aroma?: string[] }>,
): Partial<Record<PantryAtomicStepId, string[]>> {
  const next: Partial<Record<PantryAtomicStepId, string[]>> = {
    ...raw,
  };
  const legacy = raw.treat_aroma;
  if (legacy?.length) {
    const merged = [
      ...new Set([...(next.aroma_per_meal ?? []), ...legacy]),
    ];
    next.aroma_per_meal = merged;
  }
  delete (next as Partial<{ treat_aroma?: string[] }>).treat_aroma;
  return next;
}

export function loadMenuBuilderPantryState(): MenuBuilderPantryPersistedV1 {
  if (typeof window === "undefined") return defaultPantryState();
  try {
    const raw = localStorage.getItem(MENU_BUILDER_PANTRY_KEY);
    if (!raw) return defaultPantryState();
    const p = JSON.parse(raw) as LegacyV1State & {
      v?: number;
      explorerIdsByStep?: Partial<
        Record<PantryAtomicStepId | "treat_aroma", string[]>
      >;
    };
    const mealCountGuess = readStoredMenuMealCount() ?? 5;
    if (p.v === 2) {
      const base: MenuBuilderPantryPersistedV1 = {
        v: 2,
        dairySkipped: Boolean(p.dairySkipped),
        explorerIdsByStep: migrateV2ExplorerIdsFromLegacyKeys(
          (p.explorerIdsByStep ?? {}) as Partial<
            Record<PantryAtomicStepId, string[]>
          > &
            Partial<{ treat_aroma?: string[] }>,
        ),
        dictionaryIdByExplorerId: { ...(p.dictionaryIdByExplorerId ?? {}) },
        treatMealByExplorerId: migrateTreatMealMap(
          { ...(p.treatMealByExplorerId as Record<string, unknown>) },
          mealCountGuess,
        ),
      };
      return migrateMcDonaldsOutOfAromaStep(base);
    }
    return migrateLegacyPantry(p);
  } catch {
    return defaultPantryState();
  }
}

export function saveMenuBuilderPantryState(
  state: MenuBuilderPantryPersistedV1,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MENU_BUILDER_PANTRY_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
