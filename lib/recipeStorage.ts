export type RecipeIngredient = {
  id: string;
  name: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

export type SavedRecipe = {
  id: string;
  title: string;
  createdAt: string;
  servings: number;
  ingredients: RecipeIngredient[];
};

const KEY = "cj_recipes_v1";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeRecipe(x: unknown): SavedRecipe | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const title = String(o.title ?? "").trim().slice(0, 120);
  if (!title) return null;
  const servings = clamp(Number(o.servings) || 1, 1, 60);
  const ingredientsRaw = o.ingredients;
  if (!Array.isArray(ingredientsRaw) || ingredientsRaw.length < 1) return null;

  const ingredients: RecipeIngredient[] = [];
  for (const r of ingredientsRaw.slice(0, 60)) {
    if (!r || typeof r !== "object") continue;
    const rr = r as Record<string, unknown>;
    const name = String(rr.name ?? "").trim().slice(0, 140);
    const grams = clamp(Number(rr.grams) || 0, 0, 50000);
    if (!name || grams <= 0) continue;
    ingredients.push({
      id: String(rr.id ?? "").trim() || makeId(),
      name,
      grams,
      caloriesPer100g: clamp(Number(rr.caloriesPer100g) || 0, 0, 2000),
      proteinPer100g: clamp(Number(rr.proteinPer100g) || 0, 0, 500),
      carbsPer100g: clamp(Number(rr.carbsPer100g) || 0, 0, 500),
      fatPer100g: clamp(Number(rr.fatPer100g) || 0, 0, 500),
    });
  }
  if (ingredients.length < 1) return null;

  const id = String(o.id ?? "").trim() || makeId();
  const createdAt = String(o.createdAt ?? "").trim() || new Date().toISOString();
  return { id, title, createdAt, servings, ingredients };
}

export function loadRecipes(): SavedRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeRecipe).filter(Boolean) as SavedRecipe[];
  } catch {
    return [];
  }
}

export function saveRecipes(list: SavedRecipe[]): void {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 80)));
}

export function addRecipe(recipe: Omit<SavedRecipe, "id" | "createdAt">): SavedRecipe {
  const row: SavedRecipe = {
    ...recipe,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };
  const rest = loadRecipes();
  saveRecipes([row, ...rest]);
  return row;
}

export function removeRecipe(id: string): SavedRecipe[] {
  const next = loadRecipes().filter((r) => r.id !== id);
  saveRecipes(next);
  return next;
}

