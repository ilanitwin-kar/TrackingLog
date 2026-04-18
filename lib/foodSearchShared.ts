/** שורת הצעה בחיפוש מזון (בית / דף הוספה) */
export type HomeSuggestRow = {
  id: string;
  name: string;
  verified: boolean;
  category?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  source?: "local" | "openFoodFacts";
};

/** Lower = better. Tier: word-start → after-space substring → any partial. */
export function homeLocalSearchRank(
  name: string,
  query: string
): [number, number, string] {
  const q = query.trim();
  const n = name.trim();
  if (!q) return [99, 0, n];
  const words = n.split(/\s+/).filter(Boolean);
  const startIdx = words.findIndex((w) => w.startsWith(q));
  if (startIdx >= 0) {
    return [0, startIdx, n];
  }
  if (n.includes(` ${q}`)) {
    return [1, 0, n];
  }
  if (n.includes(q)) {
    return [2, 0, n];
  }
  return [3, 0, n];
}

export function sortHomeLocalRows(
  rows: HomeSuggestRow[],
  query: string
): HomeSuggestRow[] {
  const q = query.trim();
  return [...rows].sort((a, b) => {
    const [ta, sa, na] = homeLocalSearchRank(a.name, q);
    const [tb, sb, nb] = homeLocalSearchRank(b.name, q);
    if (ta !== tb) return ta - tb;
    if (sa !== sb) return sa - sb;
    return na.localeCompare(nb, "he");
  });
}

export const GEMINI_UNAVAILABLE_MSG = "ההשלמה החכמה זמנית לא זמינה. נסי שוב מאוחר יותר.";

export type GeminiInsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "notFood" }
  | {
      kind: "ok";
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
