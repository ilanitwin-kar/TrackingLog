import { getTodayKey } from "./dateKey";
import type { ActivityLevel, Gender } from "./tdee";
import { tdee } from "./tdee";

export type FoodUnit =
  | "גרם"
  | "כוס"
  | "כף"
  | "כפית"
  | "מריחה"
  | "יחידה";

/** נרמול יחידות ישנות (כף מריחה) וערכים לא מוכרים */
export function normalizeFoodUnit(raw: string): FoodUnit {
  const t = String(raw).trim();
  if (t === "כף מריחה") return "מריחה";
  const allowed: FoodUnit[] = [
    "גרם",
    "כוס",
    "כף",
    "כפית",
    "מריחה",
    "יחידה",
  ];
  if ((allowed as string[]).includes(t)) return t as FoodUnit;
  return "גרם";
}

export type LogEntry = {
  id: string;
  food: string;
  calories: number;
  quantity: number;
  unit: FoodUnit;
  createdAt: string;
  /** מסומן ליצירת ארוחה קבועה */
  mealStarred?: boolean;
  /** ערך מאומת ממאגר Caloric Intelligence */
  verified?: boolean;
  /** חלבון (גרם) לפי המנה — ממאגר ה-CSV (× כמות כמו קלוריות) */
  proteinG?: number;
  /** פחמימות (גרם) */
  carbsG?: number;
  /** שומן (גרם) */
  fatG?: number;
};

export type MealPresetComponent = {
  food: string;
  quantity: number;
  unit: FoodUnit;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};

export type MealPreset = {
  id: string;
  name: string;
  components: MealPresetComponent[];
  createdAt: string;
};

export type WeightEntry = {
  id: string;
  kg: number;
  date: string;
};

export type UserProfile = {
  email: string;
  /** שם פרטי — לפרסונליזציה (למשל בלוח המפה) */
  firstName: string;
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  deficit: number;
  activity: ActivityLevel;
  goalWeightKg: number;
  /** true רק אחרי השלמת מסך ההרשמה (TDEE) */
  onboardingComplete: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** כל השדות מלאים ותקינים (בלי דרישת onboardingComplete) */
export function isProfileFormValid(p: UserProfile): boolean {
  if (!EMAIL_RE.test(p.email.trim())) return false;
  if (p.age < 12 || p.age > 120) return false;
  if (p.heightCm < 100 || p.heightCm > 230) return false;
  if (p.weightKg < 30 || p.weightKg > 250) return false;
  if (p.goalWeightKg < 30 || p.goalWeightKg > 250) return false;
  if (p.deficit < 100 || p.deficit > 1500) return false;
  return true;
}

/** הרשמה הושלמה — מותר להיכנס לדשבורד */
export function isRegistrationComplete(p: UserProfile): boolean {
  return p.onboardingComplete === true && isProfileFormValid(p);
}

const KEYS = {
  profile: "cj_profile_v1",
  foodMemory: "cj_food_memory_v1",
  dayLogs: "cj_day_logs_v1",
  weights: "cj_weights_v1",
  halfGoalDate: "cj_half_goal_date_v1",
  fullGoalDate: "cj_full_goal_date_v1",
  dictionary: "cj_dictionary_v1",
  mealPresets: "cj_meal_presets_v1",
  /** סימוני זהב בלוח צבירת הקלוריות (תאריך → מסומן) — ירושה */
  calorieBoardGold: "cj_calorie_board_gold_v1",
  /** Legacy: story tiles by square index; migrated to storyRevealByDate. */
  storyRevealUnlock: "cj_story_reveal_unlock_v1",
  /** Story tiles unlocked by date key YYYY-MM-DD. */
  storyRevealByDate: "cj_story_reveal_by_date_v1",
  /** סגירת יומן: תארי�� → צריכה/TDEE/פער (צריכה − TDEE) */
  dayJournalClosed: "cj_day_journal_closed_v1",
  /** ימים נוספים בזנב הלוח בגלל חריגות קלוריות */
  calorieBoardExtraDays: "cj_calorie_board_extra_days_v1",
} as const;

export type DictionaryItem = {
  id: string;
  food: string;
  quantity: number;
  unit: FoodUnit;
  lastCalories?: number;
  /** ל־100 גרם — מסריקה / מקור חיצוני */
  caloriesPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  barcode?: string;
  source?: string;
  brand?: string;
  unitGrams?: number;
  /** קישור לארוחה שמורה — הוספה ליומן מוסיפה את כל הרכיבים */
  mealPresetId?: string;
};

const defaultProfile: UserProfile = {
  email: "",
  firstName: "",
  gender: "female",
  age: 0,
  heightCm: 0,
  weightKg: 0,
  deficit: 500,
  activity: "light",
  goalWeightKg: 0,
  onboardingComplete: false,
};

function finiteNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function normalizeLoadedProfile(parsed: Partial<UserProfile>): UserProfile {
  const merged = {
    ...defaultProfile,
    ...parsed,
    email: typeof parsed.email === "string" ? parsed.email : "",
    firstName:
      typeof parsed.firstName === "string" ? parsed.firstName.trim() : "",
    onboardingComplete: parsed.onboardingComplete === true,
    age: finiteNum(parsed.age, defaultProfile.age),
    heightCm: finiteNum(parsed.heightCm, defaultProfile.heightCm),
    weightKg: finiteNum(parsed.weightKg, defaultProfile.weightKg),
    goalWeightKg: finiteNum(parsed.goalWeightKg, defaultProfile.goalWeightKg),
    deficit: finiteNum(parsed.deficit, defaultProfile.deficit),
  };
  return merged;
}

export function loadProfile(): UserProfile {
  if (typeof window === "undefined") return { ...defaultProfile };
  try {
    const raw = localStorage.getItem(KEYS.profile);
    if (!raw) return { ...defaultProfile };
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return normalizeLoadedProfile(parsed);
  } catch {
    return { ...defaultProfile };
  }
}

export function saveProfile(p: UserProfile): void {
  localStorage.setItem(KEYS.profile, JSON.stringify(p));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cj-profile-updated"));
  }
}

export type FoodMemory = Record<string, { quantity: number; unit: FoodUnit }>;

export function normalizeFoodKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function loadFoodMemory(): FoodMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.foodMemory);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      { quantity?: number; unit?: string }
    >;
    const out: FoodMemory = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== "object") continue;
      out[k] = {
        quantity:
          typeof v.quantity === "number" && Number.isFinite(v.quantity)
            ? v.quantity
            : 100,
        unit: normalizeFoodUnit(String(v.unit ?? "גרם")),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFoodMemoryKey(
  food: string,
  quantity: number,
  unit: FoodUnit
): void {
  const mem = loadFoodMemory();
  mem[normalizeFoodKey(food)] = { quantity, unit };
  localStorage.setItem(KEYS.foodMemory, JSON.stringify(mem));
}

export function getFoodMemory(food: string): { quantity: number; unit: FoodUnit } | null {
  const mem = loadFoodMemory();
  return mem[normalizeFoodKey(food)] ?? null;
}

type DayLogsMap = Record<string, LogEntry[]>;

export function loadDayLogs(): DayLogsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.dayLogs);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LogEntry[]>;
    const out: DayLogsMap = {};
    for (const [dateKey, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue;
      out[dateKey] = list.map((e) => ({
        ...e,
        unit: normalizeFoodUnit(String(e.unit)),
      }));
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDayLogEntries(dateKey: string, entries: LogEntry[]): void {
  const all = loadDayLogs();
  all[dateKey] = entries;
  localStorage.setItem(KEYS.dayLogs, JSON.stringify(all));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cj-profile-updated"));
  }
}

export function getTodayEntries(): LogEntry[] {
  return loadDayLogs()[getTodayKey()] ?? [];
}

export function getEntriesForDate(dateKey: string): LogEntry[] {
  return loadDayLogs()[dateKey] ?? [];
}

export type DayJournalClosedEntry = {
  consumedKcal: number;
  tdeeKcal: number;
  /** צריכה − TDEE (שלילי = מתחת ל-TDEE, חיובי = חריגה) */
  gapKcal: number;
  closedAt: string;
};

export function loadDayJournalClosedMap(): Record<string, DayJournalClosedEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.dayJournalClosed);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DayJournalClosedEntry>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveDayJournalClosedMap(
  m: Record<string, DayJournalClosedEntry>
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.dayJournalClosed, JSON.stringify(m));
}

export function isDayJournalClosed(dateKey: string): boolean {
  return Boolean(loadDayJournalClosedMap()[dateKey]);
}

export function loadBoardExtraTailDays(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(KEYS.calorieBoardExtraDays);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function saveBoardExtraTailDays(n: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    KEYS.calorieBoardExtraDays,
    String(Math.max(0, Math.floor(n)))
  );
}

export function addBoardExtraTailDays(delta: number): void {
  if (delta <= 0) return;
  saveBoardExtraTailDays(loadBoardExtraTailDays() + delta);
}

function pruneStoryRevealToClosedDaysOnly(): void {
  if (typeof window === "undefined") return;
  const closed = loadDayJournalClosedMap();
  const m = { ...loadStoryRevealUnlock() };
  const next: Record<string, boolean> = {};
  let changed = false;
  for (const [k, v] of Object.entries(m)) {
    if (v && closed[k]) next[k] = true;
    else if (v) changed = true;
  }
  if (changed || Object.keys(next).length !== Object.keys(m).length) {
    localStorage.setItem(KEYS.storyRevealByDate, JSON.stringify(next));
  }
}

/**
 * סגירת יומן: נעילת צריכה מול TDEE ושמירת פער (צריכה − TDEE).
 * חריגה (פלוס) מוסיפה ימים לזנב הלוח לפי גודל החריגה והגירעון המתוכנן.
 */
export function closeDayJournal(dateKey: string): {
  ok: boolean;
  gapKcal?: number;
  message?: string;
} {
  if (typeof window === "undefined") {
    return { ok: false, message: "לא זמין" };
  }
  const today = getTodayKey();
  if (dateKey > today) {
    return { ok: false, message: "לא ניתן לסגור יום עתידי" };
  }
  const prev = loadDayJournalClosedMap();
  if (prev[dateKey]) {
    return {
      ok: false,
      message: "\u05d4\u05d9\u05d5\u05de\u05df \u05db\u05d1\u05e8 \u05e0\u05e1\u05d2\u05e8 \u05dc\u05ea\u05d0\u05e8\u05d9\u05da \u05d6\u05d4",
    };
  }

  const profile = loadProfile();
  const tdeeKcal = Math.round(
    tdee(
      profile.gender,
      profile.weightKg,
      profile.heightCm,
      profile.age,
      profile.activity
    )
  );
  const entries = getEntriesForDate(dateKey);
  const consumedKcal = entries.reduce(
    (s, e) => s + (Number(e.calories) || 0),
    0
  );
  const gapKcal = Math.round(consumedKcal - tdeeKcal);

  saveDayJournalClosedMap({
    ...prev,
    [dateKey]: {
      consumedKcal,
      tdeeKcal,
      gapKcal,
      closedAt: new Date().toISOString(),
    },
  });

  const reveal = { ...loadStoryRevealUnlock() };
  if (reveal[dateKey]) {
    delete reveal[dateKey];
    saveStoryRevealUnlock(reveal);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("cj-story-reveal-updated"));
    }
  }

  pruneStoryRevealToClosedDaysOnly();

  const planned = Math.max(1, Math.round(profile.deficit || 0));
  if (gapKcal > 0) {
    const addDays = Math.ceil(gapKcal / planned);
    addBoardExtraTailDays(addDays);
  }

  window.dispatchEvent(new Event("cj-day-journal-closed"));
  return { ok: true, gapKcal };
}

export function loadWeights(): WeightEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEYS.weights);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWeights(entries: WeightEntry[]): void {
  localStorage.setItem(KEYS.weights, JSON.stringify(entries));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cj-profile-updated"));
  }
}

export function getHalfGoalCelebratedDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEYS.halfGoalDate);
}

export function setHalfGoalCelebratedDate(dateKey: string): void {
  localStorage.setItem(KEYS.halfGoalDate, dateKey);
}

export function getFullGoalCelebratedDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEYS.fullGoalDate);
}

export function setFullGoalCelebratedDate(dateKey: string): void {
  localStorage.setItem(KEYS.fullGoalDate, dateKey);
}

function syncMealPresetsIntoDictionary(dict: DictionaryItem[]): DictionaryItem[] {
  const presets = loadMealPresets();
  const linked = new Set(
    dict.map((d) => d.mealPresetId).filter((x): x is string => Boolean(x))
  );
  const additions: DictionaryItem[] = [];
  for (const p of presets) {
    if (linked.has(p.id)) continue;
    const totalKcal = p.components.reduce((s, c) => s + c.calories, 0);
    additions.push({
      id: makeId(),
      food: p.name,
      quantity: 1,
      unit: "יחידה",
      lastCalories: totalKcal,
      mealPresetId: p.id,
      source: "meal-preset",
    });
  }
  if (additions.length === 0) return dict;
  const merged = [...additions, ...dict];
  saveDictionary(merged);
  return merged;
}

export function loadDictionary(): DictionaryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEYS.dictionary);
    if (!raw) return syncMealPresetsIntoDictionary([]);
    const list = JSON.parse(raw) as DictionaryItem[];
    const normalized = list.map((d) => ({
      ...d,
      unit: normalizeFoodUnit(String(d.unit)),
    }));
    return syncMealPresetsIntoDictionary(normalized);
  } catch {
    return syncMealPresetsIntoDictionary([]);
  }
}

export function saveDictionary(items: DictionaryItem[]): void {
  localStorage.setItem(KEYS.dictionary, JSON.stringify(items));
}

export function isFoodStarred(food: string): boolean {
  const n = normalizeFoodKey(food);
  return loadDictionary().some((d) => normalizeFoodKey(d.food) === n);
}

export function toggleDictionaryFromEntry(entry: LogEntry): DictionaryItem[] {
  const items = loadDictionary();
  const n = normalizeFoodKey(entry.food);
  const idx = items.findIndex((d) => normalizeFoodKey(d.food) === n);
  if (idx >= 0) {
    items.splice(idx, 1);
  } else {
    items.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      food: entry.food,
      quantity: entry.quantity,
      unit: entry.unit,
      lastCalories: entry.calories,
    });
  }
  saveDictionary(items);
  return items;
}

export function removeDictionaryItem(id: string): DictionaryItem[] {
  const items = loadDictionary();
  const victim = items.find((d) => d.id === id);
  if (!victim) return items;
  const next = items.filter((d) => d.id !== id);
  saveDictionary(next);
  if (victim.mealPresetId) {
    deleteMealPreset(victim.mealPresetId);
  }
  return next;
}

/** שמירה או עדכון פריט במילון האישי (למשל מסריקת ברקוד) */
export function upsertDictionaryFromScan(item: {
  food: string;
  quantity: number;
  unit: FoodUnit;
  lastCalories: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  barcode?: string;
}): DictionaryItem[] {
  const items = loadDictionary();
  const n = normalizeFoodKey(item.food);
  const without = items.filter((d) => normalizeFoodKey(d.food) !== n);
  const row: DictionaryItem = {
    id: makeId(),
    food: item.food,
    quantity: item.quantity,
    unit: item.unit,
    lastCalories: item.lastCalories,
    caloriesPer100g: item.caloriesPer100g,
    proteinPer100g: item.proteinPer100g,
    carbsPer100g: item.carbsPer100g,
    fatPer100g: item.fatPer100g,
    barcode: item.barcode,
    source: "manual",
  };
  without.unshift(row);
  saveDictionary(without);
  return without;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type ManualNutritionPayload = {
  food: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  /** משקל יחידה בגרם — אם מולא: נרשם כ��1 יחידה עם ערכים מוקטנים לפי המשקל */
  unitGrams?: number;
};

/**
 * הוספת מזון ידני ליומן + מילון: ערכי תזונה ל��100 גרם.
 * אם ניתן `unitGrams`, נרשמת מנה אחת ביחידה "יחידה" והקלוריות והמאקרו מחושבים לפי המשקל.
 */
export function addManualNutritionToToday(
  payload: ManualNutritionPayload,
  dateKey: string = getTodayKey()
): LogEntry[] {
  const name = payload.food.trim();
  if (!name) {
    return getEntriesForDate(dateKey);
  }

  const brand = payload.brand?.trim() || "";
  const displayFood = brand ? `${name} (${brand})` : name;

  const c100 = Math.max(0, Number(payload.caloriesPer100g) || 0);
  const p100 = Math.max(0, Number(payload.proteinPer100g) || 0);
  const f100 = Math.max(0, Number(payload.fatPer100g) || 0);
  const carbs100 = Math.max(0, Number(payload.carbsPer100g) || 0);

  const ugRaw = payload.unitGrams;
  const ug =
    ugRaw != null &&
    String(ugRaw).trim() !== "" &&
    Number.isFinite(Number(ugRaw)) &&
    Number(ugRaw) > 0
      ? Number(ugRaw)
      : undefined;

  const factor = ug != null ? ug / 100 : 1;

  let quantity: number;
  let unit: FoodUnit;
  let kcal: number;
  let proteinG: number | undefined;
  let fatG: number | undefined;
  let carbsG: number | undefined;

  if (ug != null) {
    quantity = 1;
    unit = "יחידה";
    kcal = Math.max(1, Math.round(c100 * factor));
    proteinG = Math.round(p100 * factor * 10) / 10;
    fatG = Math.round(f100 * factor * 10) / 10;
    carbsG = Math.round(carbs100 * factor * 10) / 10;
  } else {
    quantity = 100;
    unit = "גרם";
    kcal = Math.max(1, Math.round(c100));
    proteinG = Math.round(p100 * 10) / 10;
    fatG = Math.round(f100 * 10) / 10;
    carbsG = Math.round(carbs100 * 10) / 10;
  }

  const entry: LogEntry = {
    id: makeId(),
    food: displayFood,
    calories: kcal,
    quantity,
    unit,
    createdAt: new Date().toISOString(),
    mealStarred: false,
    verified: true,
    proteinG,
    carbsG,
    fatG,
  };

  const existing = getEntriesForDate(dateKey);
  const merged = [entry, ...existing];
  saveDayLogEntries(dateKey, merged);

  const items = loadDictionary();
  const n = normalizeFoodKey(displayFood);
  const without = items.filter((d) => normalizeFoodKey(d.food) !== n);
  const dictRow: DictionaryItem = {
    id: makeId(),
    food: displayFood,
    brand: brand || undefined,
    quantity,
    unit,
    lastCalories: kcal,
    caloriesPer100g: c100,
    proteinPer100g: p100,
    fatPer100g: f100,
    carbsPer100g: carbs100,
    unitGrams: ug,
    source: "manual-home",
  };
  without.unshift(dictRow);
  saveDictionary(without);

  return merged;
}

export function loadMealPresets(): MealPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEYS.mealPresets);
    if (!raw) return [];
    const list = JSON.parse(raw) as MealPreset[];
    return list.map((p) => ({
      ...p,
      components: p.components.map((c) => ({
        ...c,
        unit: normalizeFoodUnit(String(c.unit)),
      })),
    }));
  } catch {
    return [];
  }
}

export function saveMealPresets(presets: MealPreset[]): void {
  localStorage.setItem(KEYS.mealPresets, JSON.stringify(presets));
}

export function addMealPreset(preset: Omit<MealPreset, "id" | "createdAt">): MealPreset[] {
  const list = loadMealPresets();
  const full: MealPreset = {
    ...preset,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };
  list.unshift(full);
  saveMealPresets(list);
  return list;
}

export function deleteMealPreset(id: string): MealPreset[] {
  const next = loadMealPresets().filter((p) => p.id !== id);
  saveMealPresets(next);
  try {
    const raw = localStorage.getItem(KEYS.dictionary);
    if (!raw) return next;
    const list = JSON.parse(raw) as DictionaryItem[];
    const filtered = list.filter((d) => d.mealPresetId !== id);
    if (filtered.length !== list.length) {
      saveDictionary(filtered);
    }
  } catch {
    /* ignore */
  }
  return next;
}

/** הוספת כל רכיבי הארוחה ליומן היום (למעלה) */
export function applyMealPresetToToday(preset: MealPreset): LogEntry[] {
  const dateKey = getTodayKey();
  const existing = getTodayEntries();
  const newOnes: LogEntry[] = preset.components.map((c) => ({
    id: makeId(),
    food: c.food,
    calories: c.calories,
    quantity: c.quantity,
    unit: c.unit,
    createdAt: new Date().toISOString(),
    mealStarred: false,
    proteinG: c.proteinG,
    carbsG: c.carbsG,
    fatG: c.fatG,
  }));
  const merged = [...newOnes, ...existing];
  saveDayLogEntries(dateKey, merged);
  return merged;
}

/** הוספת פריט מילון ליומן היום — או כל רכיבי preset אם קיים */
export function appendDictionaryItemToToday(
  d: DictionaryItem,
  preset: MealPreset | null
): LogEntry[] {
  if (preset) {
    return applyMealPresetToToday(preset);
  }
  const dateKey = getTodayKey();
  const existing = getTodayEntries();
  let kcal =
    typeof d.lastCalories === "number" && Number.isFinite(d.lastCalories)
      ? Math.round(d.lastCalories)
      : 0;
  if (kcal <= 0 && typeof d.caloriesPer100g === "number") {
    kcal = Math.max(1, Math.round((d.caloriesPer100g * d.quantity) / 100));
  }
  const factor = d.quantity / 100;
  const entry: LogEntry = {
    id: makeId(),
    food: d.food,
    calories: kcal,
    quantity: d.quantity,
    unit: d.unit,
    createdAt: new Date().toISOString(),
    mealStarred: false,
    verified: Boolean(d.barcode),
    proteinG:
      d.proteinPer100g != null ? d.proteinPer100g * factor : undefined,
    carbsG: d.carbsPer100g != null ? d.carbsPer100g * factor : undefined,
    fatG: d.fatPer100g != null ? d.fatPer100g * factor : undefined,
  };
  const merged = [entry, ...existing];
  saveDayLogEntries(dateKey, merged);
  return merged;
}

export function loadCalorieBoardGold(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.calorieBoardGold);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCalorieBoardGold(marks: Record<string, boolean>): void {
  localStorage.setItem(KEYS.calorieBoardGold, JSON.stringify(marks));
}

/** מחליף סימון זהב ליום — נשמר ב־localStorage */
export function toggleCalorieBoardGold(dateKey: string): Record<string, boolean> {
  const m = { ...loadCalorieBoardGold() };
  m[dateKey] = !m[dateKey];
  saveCalorieBoardGold(m);
  return m;
}

function parseStoryRevealMap(raw: string | null): Record<string, boolean> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function migrateIndexStoryMarksToDates(
  legacy: Record<string, boolean>,
  sequence: string[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(legacy)) {
    if (!v) continue;
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= sequence.length) continue;
    out[sequence[idx]!] = true;
  }
  return out;
}

/**
 * Call with the same date sequence as the calorie board (e.g. getCalorieBoardDateSequence)
 * before reading unlock state, so legacy index-keyed marks map to calendar dates.
 */
export function ensureStoryRevealDateMigration(sequence: string[]): void {
  if (typeof window === "undefined" || sequence.length === 0) return;
  if (localStorage.getItem(KEYS.storyRevealByDate)) return;

  const rawLegacy = localStorage.getItem(KEYS.storyRevealUnlock);
  const legacy = parseStoryRevealMap(rawLegacy);
  if (!legacy || Object.keys(legacy).length === 0) {
    localStorage.setItem(KEYS.storyRevealByDate, JSON.stringify({}));
    return;
  }

  const keys = Object.keys(legacy);
  const allIndexKeys = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
  const allIsoDateKeys = keys.length > 0 && keys.every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));

  if (allIndexKeys) {
    const migrated = migrateIndexStoryMarksToDates(legacy, sequence);
    localStorage.setItem(KEYS.storyRevealByDate, JSON.stringify(migrated));
    localStorage.removeItem(KEYS.storyRevealUnlock);
    return;
  }

  if (allIsoDateKeys) {
    localStorage.setItem(KEYS.storyRevealByDate, JSON.stringify(legacy));
    localStorage.removeItem(KEYS.storyRevealUnlock);
    return;
  }

  localStorage.setItem(KEYS.storyRevealByDate, JSON.stringify({}));
}

export function loadStoryRevealUnlock(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  const parsed = parseStoryRevealMap(localStorage.getItem(KEYS.storyRevealByDate));
  return parsed ?? {};
}

export function saveStoryRevealUnlock(marks: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.storyRevealByDate, JSON.stringify(marks));
}

/** dateKey: YYYY-MM-DD — רק אחרי סגירת יומן לאותו תארי�� */
export function toggleStoryRevealUnlock(dateKey: string): Record<string, boolean> {
  if (typeof window !== "undefined" && !isDayJournalClosed(dateKey)) {
    return { ...loadStoryRevealUnlock() };
  }
  const m = { ...loadStoryRevealUnlock() };
  m[dateKey] = !m[dateKey];
  saveStoryRevealUnlock(m);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cj-story-reveal-updated"));
  }
  return m;
}
