import type { HomeSuggestRow } from "@/lib/foodSearchShared";

const STORAGE_KEY = "cj-recent-food-picks-v1";
const MAX_ITEMS = 14;

function normalizeRow(row: HomeSuggestRow): HomeSuggestRow {
  return {
    id: row.id,
    name: row.name.trim(),
    verified: row.verified === true,
    category: row.category,
    calories: row.calories,
    protein: row.protein,
    fat: row.fat,
    carbs: row.carbs,
    source: row.source,
  };
}

function samePick(a: HomeSuggestRow, b: HomeSuggestRow): boolean {
  return a.id === b.id && a.name.trim() === b.name.trim();
}

export function loadRecentFoodPicks(): HomeSuggestRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: HomeSuggestRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const r = item as Partial<HomeSuggestRow>;
      if (typeof r.id !== "string" || typeof r.name !== "string") continue;
      if (typeof r.calories !== "number" || !Number.isFinite(r.calories)) continue;
      out.push(
        normalizeRow({
          id: r.id,
          name: r.name,
          verified: r.verified === true,
          category: typeof r.category === "string" ? r.category : undefined,
          calories: r.calories,
          protein: typeof r.protein === "number" ? r.protein : undefined,
          fat: typeof r.fat === "number" ? r.fat : undefined,
          carbs: typeof r.carbs === "number" ? r.carbs : undefined,
          source:
            r.source === "openFoodFacts"
              ? "openFoodFacts"
              : r.source === "israelMoH"
                ? "israelMoH"
                : r.source === "usda"
                  ? "usda"
                  : r.source === "ai"
                    ? "ai"
                    : "local",
        })
      );
    }
    return out;
  } catch {
    return [];
  }
}

/** לאחר בחירה מוצלחת (יומן / מילון) — מקדם לראש הרשימה */
export function rememberFoodPick(row: HomeSuggestRow): void {
  if (typeof window === "undefined") return;
  const n = normalizeRow(row);
  if (!n.name || n.calories == null || !Number.isFinite(n.calories) || n.calories <= 0) {
    return;
  }
  const prev = loadRecentFoodPicks().filter((p) => !samePick(p, n));
  const next = [n, ...prev].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}
