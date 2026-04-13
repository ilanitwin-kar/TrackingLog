import type { ShoppingItem } from "@/lib/explorerStorage";

export const SHOPPING_LIST_SHARE_HEADER =
  "רשימת הקניות שלי מאינטליגנציה קלורית:";

/** טקסט נקי לשיתוף (וואטסאפ / מייל / הדפסה) */
export function buildShoppingListShareText(items: ShoppingItem[]): string {
  if (items.length === 0) {
    return SHOPPING_LIST_SHARE_HEADER;
  }
  const lines = items.map((it) => `• ${it.name.trim()}`);
  return [SHOPPING_LIST_SHARE_HEADER, "", ...lines].join("\n");
}
