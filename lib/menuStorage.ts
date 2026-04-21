export type MenuMealItem = {
  name: string;
  portionLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MenuMeal = {
  name: string;
  items: MenuMealItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type SavedMenu = {
  id: string;
  title: string;
  createdAt: string;
  meals: MenuMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

const KEY = "cj_saved_menus_v1";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeMenu(x: unknown): SavedMenu | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const title = String(o.title ?? "").trim().slice(0, 120);
  if (!title) return null;
  const mealsRaw = o.meals;
  if (!Array.isArray(mealsRaw) || mealsRaw.length < 1) return null;

  const meals: MenuMeal[] = [];
  for (const m of mealsRaw.slice(0, 12)) {
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    const name = String(mm.name ?? "").trim().slice(0, 80);
    const itemsRaw = mm.items;
    if (!name || !Array.isArray(itemsRaw) || itemsRaw.length < 1) continue;
    const items: MenuMealItem[] = [];
    for (const it of itemsRaw.slice(0, 16)) {
      if (!it || typeof it !== "object") continue;
      const ii = it as Record<string, unknown>;
      const iname = String(ii.name ?? "").trim().slice(0, 120);
      const portionLabel = String(ii.portionLabel ?? "").trim().slice(0, 80);
      if (!iname || !portionLabel) continue;
      items.push({
        name: iname,
        portionLabel,
        calories: clamp(Math.round(Number(ii.calories) || 0), 0, 4000),
        protein: clamp(Number(ii.protein) || 0, 0, 300),
        carbs: clamp(Number(ii.carbs) || 0, 0, 300),
        fat: clamp(Number(ii.fat) || 0, 0, 300),
      });
    }
    if (items.length < 1) continue;
    const calories = clamp(Math.round(Number(mm.calories) || 0), 0, 12000);
    const protein = clamp(Number(mm.protein) || 0, 0, 800);
    const carbs = clamp(Number(mm.carbs) || 0, 0, 800);
    const fat = clamp(Number(mm.fat) || 0, 0, 800);
    meals.push({ name, items, calories, protein, carbs, fat });
  }
  if (meals.length < 1) return null;

  const id = String(o.id ?? "").trim() || makeId();
  const createdAt = String(o.createdAt ?? "").trim() || new Date().toISOString();
  return {
    id,
    title,
    createdAt,
    meals,
    totalCalories: clamp(Math.round(Number(o.totalCalories) || 0), 0, 25000),
    totalProtein: clamp(Number(o.totalProtein) || 0, 0, 1200),
    totalCarbs: clamp(Number(o.totalCarbs) || 0, 0, 1200),
    totalFat: clamp(Number(o.totalFat) || 0, 0, 1200),
  };
}

export function loadSavedMenus(): SavedMenu[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeMenu).filter(Boolean) as SavedMenu[];
  } catch {
    return [];
  }
}

export function saveSavedMenus(list: SavedMenu[]): void {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 60)));
}

export function addSavedMenu(menu: Omit<SavedMenu, "id" | "createdAt">): SavedMenu {
  const row: SavedMenu = {
    ...menu,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };
  const rest = loadSavedMenus();
  saveSavedMenus([row, ...rest]);
  return row;
}

export function removeSavedMenu(id: string): SavedMenu[] {
  const next = loadSavedMenus().filter((m) => m.id !== id);
  saveSavedMenus(next);
  return next;
}

