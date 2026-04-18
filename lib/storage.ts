import { getTodayKey } from "./dateKey";
import type { ActivityLevel, Gender } from "./tdee";

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
  /** גילוי מילות סיפור (אינדקס משבצת → נפתח) */
  storyRevealUnlock: "cj_story_reveal_unlock_v1",
  /** ימים שסומנו כסגורים ביומן (תאריך → true) */
  dayJournalClosed: "cj_day_journal_closed_v1",
  /** המשתמש עבר ממסך הכניסה (הרשמה/התחברות) — מותר להמשיך ל־TDEE */
  welcomeLeft: "cj_welcome_left_v1",
} as const;

export function hasLeftWelcome(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEYS.welcomeLeft) === "1";
}

export function markWelcomeLeft(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.welcomeLeft, "1");
}

export function clearWelcomeLeft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.welcomeLeft);
}

export type DictionaryItem = {
  id: string;
  food: string;
  quantity: number;
  unit: FoodUnit;
  /** משקל יחידה בגרם — כש־unit הוא «יחידה», לחישוב מול ערכי 100 ג׳ */
  gramsPerUnit?: number;
  lastCalories?: number;
  /** ל־100 גרם — מסריקה / מקור חיצוני */
  caloriesPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  barcode?: string;
  source?: string;
  /** קישור לארוחה שמורה — הוספה ליומן מוסיפה את כל הרכיבים */
  mealPresetId?: string;
};

const defaultProfile: UserProfile = {
  email: "",
  firstName: "",
  gender: "female",
  age: 30,
  heightCm: 165,
  weightKg: 70,
  deficit: 500,
  activity: "light",
  goalWeightKg: 62,
  onboardingComplete: false,
};

export function getDefaultUserProfile(): UserProfile {
  return { ...defaultProfile };
}

function normalizeLoadedProfile(parsed: Partial<UserProfile>): UserProfile {
  return {
    ...defaultProfile,
    ...parsed,
    email: typeof parsed.email === "string" ? parsed.email : "",
    firstName:
      typeof parsed.firstName === "string" ? parsed.firstName.trim() : "",
    onboardingComplete: parsed.onboardingComplete === true,
  };
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

export type FoodMemoryEntry = {
  quantity: number;
  unit: FoodUnit;
  gramsPerUnit?: number;
};

export type FoodMemory = Record<string, FoodMemoryEntry>;

function normalizeFoodKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function loadFoodMemory(): FoodMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.foodMemory);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      { quantity?: number; unit?: string; gramsPerUnit?: number }
    >;
    const out: FoodMemory = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== "object") continue;
      const gU =
        typeof v.gramsPerUnit === "number" &&
        Number.isFinite(v.gramsPerUnit) &&
        v.gramsPerUnit > 0
          ? v.gramsPerUnit
          : undefined;
      const entry: FoodMemoryEntry = {
        quantity:
          typeof v.quantity === "number" && Number.isFinite(v.quantity)
            ? v.quantity
            : 100,
        unit: normalizeFoodUnit(String(v.unit ?? "גרם")),
      };
      if (gU != null) entry.gramsPerUnit = gU;
      out[k] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFoodMemoryKey(
  food: string,
  quantity: number,
  unit: FoodUnit,
  gramsPerUnit?: number
): void {
  const mem = loadFoodMemory();
  const entry: FoodMemoryEntry = { quantity, unit };
  if (
    gramsPerUnit != null &&
    Number.isFinite(gramsPerUnit) &&
    gramsPerUnit > 0
  ) {
    entry.gramsPerUnit = gramsPerUnit;
  }
  mem[normalizeFoodKey(food)] = entry;
  localStorage.setItem(KEYS.foodMemory, JSON.stringify(mem));
}

export function getFoodMemory(food: string): FoodMemoryEntry | null {
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

/** עדכון שדות בפריט מילון לפי מזהה (שומר id ושדות מטא שלא עודכנו) */
export function patchDictionaryItemById(
  id: string,
  patch: Partial<
    Pick<
      DictionaryItem,
      "food" | "quantity" | "unit" | "gramsPerUnit" | "lastCalories"
    >
  > & { gramsPerUnit?: number | null }
): DictionaryItem[] | null {
  const items = loadDictionary();
  const idx = items.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const prev = items[idx];
  const unit = normalizeFoodUnit(String(patch.unit ?? prev.unit));
  const next: DictionaryItem = {
    ...prev,
    ...patch,
    id: prev.id,
    unit,
  };
  if (unit !== "יחידה") {
    delete next.gramsPerUnit;
  } else if ("gramsPerUnit" in patch) {
    const g = patch.gramsPerUnit;
    if (g != null && Number.isFinite(g) && g > 0) {
      next.gramsPerUnit = g;
    } else {
      delete next.gramsPerUnit;
    }
  }
  items[idx] = next;
  saveDictionary(items);
  return items;
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
  gramsPerUnit?: number;
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
  if (
    item.gramsPerUnit != null &&
    Number.isFinite(item.gramsPerUnit) &&
    item.gramsPerUnit > 0
  ) {
    row.gramsPerUnit = item.gramsPerUnit;
  }
  without.unshift(row);
  saveDictionary(without);
  return without;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** הוספת מנה ידנית (לפי 100 ג׳ ואופציונלית משקל יחידה) ליומן תאריך + מילון */
export function addManualNutritionToToday(
  item: {
    food: string;
    brand?: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    fatPer100g: number;
    carbsPer100g: number;
    unitGrams?: number;
  },
  dateKey: string
): void {
  const k100 = Math.max(0, item.caloriesPer100g);
  const p100 = Math.max(0, item.proteinPer100g);
  const f100 = Math.max(0, item.fatPer100g);
  const c100 = Math.max(0, item.carbsPer100g);
  const ug = item.unitGrams;
  const hasUnit = ug != null && Number.isFinite(ug) && ug > 0;
  const factor = hasUnit ? ug / 100 : 1;

  const displayName = item.brand?.trim()
    ? `${item.food.trim()} (${item.brand.trim()})`
    : item.food.trim();

  const calories = Math.max(1, Math.round(k100 * factor));
  const proteinG = Math.round(p100 * factor * 10) / 10;
  const fatG = Math.round(f100 * factor * 10) / 10;
  const carbsG = Math.round(c100 * factor * 10) / 10;

  const entry: LogEntry = {
    id: makeId(),
    food: displayName,
    calories,
    quantity: hasUnit ? 1 : 100,
    unit: hasUnit ? "יחידה" : "גרם",
    createdAt: new Date().toISOString(),
    verified: false,
    proteinG,
    fatG,
    carbsG,
  };

  const existing = getEntriesForDate(dateKey);
  saveDayLogEntries(dateKey, [entry, ...existing]);

  if (hasUnit) {
    upsertDictionaryFromScan({
      food: displayName,
      quantity: 1,
      unit: "יחידה",
      lastCalories: calories,
      caloriesPer100g: Math.round(k100),
      proteinPer100g: p100,
      carbsPer100g: c100,
      fatPer100g: f100,
      gramsPerUnit: ug,
    });
  } else {
    upsertDictionaryFromScan({
      food: displayName,
      quantity: 100,
      unit: "גרם",
      lastCalories: calories,
      caloriesPer100g: Math.round(k100),
      proteinPer100g: p100,
      carbsPer100g: c100,
      fatPer100g: f100,
    });
  }
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

export function loadStoryRevealUnlock(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.storyRevealUnlock);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStoryRevealUnlock(marks: Record<string, boolean>): void {
  localStorage.setItem(KEYS.storyRevealUnlock, JSON.stringify(marks));
}

export function toggleStoryRevealUnlock(squareIndex: number): Record<string, boolean> {
  const k = String(squareIndex);
  const m = { ...loadStoryRevealUnlock() };
  m[k] = !m[k];
  saveStoryRevealUnlock(m);
  return m;
}

export function loadDayJournalClosedMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.dayJournalClosed);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveDayJournalClosedMap(marks: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.dayJournalClosed, JSON.stringify(marks));
}
