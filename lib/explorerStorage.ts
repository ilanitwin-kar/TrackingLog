const KEY_FAV = "cj_explorer_favorites_v1";
const KEY_SHOP = "cj_shopping_list_v1";

export type ShoppingItem = {
  id: string;
  foodId: string;
  name: string;
  category: string;
  calories: number;
  checked: boolean;
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

export function loadShopping(): ShoppingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_SHOP);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveShopping(items: ShoppingItem[]): void {
  localStorage.setItem(KEY_SHOP, JSON.stringify(items));
}

/** @returns true אם נוסף פריט חדש */
export function addToShopping(item: Omit<ShoppingItem, "id" | "checked">): boolean {
  const list = loadShopping();
  if (list.some((x) => x.foodId === item.foodId)) return false;
  const row: ShoppingItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    checked: false,
  };
  const next = [row, ...list];
  saveShopping(next);
  return true;
}

export function loadShoppingFoodIds(): string[] {
  return loadShopping().map((x) => x.foodId);
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
