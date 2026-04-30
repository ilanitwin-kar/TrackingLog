const KEY_FAV = "cj_explorer_favorites_v1";
const KEY_SHOP = "cj_shopping_list_v1";

export type ShoppingItem = {
  id: string;
  foodId: string;
  name: string;
  category: string;
  /** קלוריות ל־100 גרם */
  calories: number;
  checked: boolean;
  brand?: string;
  /** לא בשימוש ברשימת הקניות — נשמר רק לתאימות לאחור */
  protein?: number;
  carbs?: number;
  fat?: number;
  /** כמות לקנייה */
  qty?: number;
};

export function loadFavoriteIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_FAV);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(foodId: string): boolean {
  const set = new Set(loadFavoriteIds());
  if (set.has(foodId)) {
    set.delete(foodId);
  } else {
    set.add(foodId);
  }
  localStorage.setItem(KEY_FAV, JSON.stringify([...set]));
  return set.has(foodId);
}

export function isFavorite(foodId: string): boolean {
  return loadFavoriteIds().includes(foodId);
}

function stripShoppingMacros(raw: ShoppingItem): ShoppingItem {
  const { protein, carbs, fat, ...rest } = raw;
  void protein;
  void carbs;
  void fat;
  return rest;
}

function migrateShoppingRow(raw: ShoppingItem): ShoppingItem {
  const qty =
    typeof raw.qty === "number" && Number.isFinite(raw.qty) && raw.qty > 0
      ? raw.qty
      : 1;
  return { ...stripShoppingMacros(raw), qty };
}

export function loadShopping(): ShoppingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_SHOP);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShoppingItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateShoppingRow);
  } catch {
    return [];
  }
}

export function saveShopping(items: ShoppingItem[]): void {
  localStorage.setItem(KEY_SHOP, JSON.stringify(items));
}

/** @returns true אם נוסף פריט חדש */
export function addToShopping(
  item: Omit<ShoppingItem, "id" | "checked">
): boolean {
  const list = loadShopping();
  if (list.some((x) => x.foodId === item.foodId)) return false;
  const row: ShoppingItem = {
    foodId: item.foodId,
    name: item.name,
    category: item.category,
    calories: item.calories,
    brand: item.brand,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    checked: false,
    qty: item.qty ?? 1,
  };
  const next = [row, ...list];
  saveShopping(next);
  return true;
}

/** פריט אישי חדש (לא ממגלה המזונות) */
export function addPersonalShoppingItem(
  item: Omit<ShoppingItem, "id" | "checked" | "foodId"> & {
    foodId?: string;
  }
): ShoppingItem {
  const foodId =
    item.foodId ??
    `personal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: ShoppingItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    foodId,
    name: item.name.trim(),
    category: item.category?.trim() || "אישי",
    calories: item.calories,
    checked: false,
    brand: item.brand?.trim() || undefined,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    qty: item.qty ?? 1,
  };
  const next = [row, ...loadShopping()];
  saveShopping(next);
  return row;
}

export function updateShoppingItem(
  id: string,
  patch: Partial<Omit<ShoppingItem, "id">>
): ShoppingItem[] {
  const list = loadShopping();
  const next = list.map((x) =>
    x.id === id
      ? stripShoppingMacros({ ...x, ...patch, id: x.id })
      : x
  );
  saveShopping(next);
  return next;
}

export function loadShoppingFoodIds(): string[] {
  return loadShopping().map((x) => x.foodId);
}

/** פריט שנוסף ידנית (לא ממגלה המזונות) */
export function isPersonalShoppingFood(it: ShoppingItem): boolean {
  return it.foodId.startsWith("personal-") || it.category === "אישי";
}

export function toggleShoppingChecked(id: string): ShoppingItem[] {
  const next = loadShopping().map((x) =>
    x.id === id ? { ...x, checked: !x.checked } : x
  );
  saveShopping(next);
  return next;
}

export function removeShopping(id: string): ShoppingItem[] {
  const next = loadShopping().filter((x) => x.id !== id);
  saveShopping(next);
  return next;
}
