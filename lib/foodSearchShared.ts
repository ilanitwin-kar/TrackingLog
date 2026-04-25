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
  source?: "local" | "openFoodFacts" | "ai" | "israelMoH" | "usda";
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForRank(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function splitNameToParts(nameNorm: string): string[] {
  // CSV/internal names sometimes include aliases: "בשר עוף, שוק עוף"
  // Ranking should consider each part independently and take the best tier.
  return nameNorm
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * תבנית "מילת-שלמה" שתומכת בעברית (כי \b לא עובד טוב עם יוניקוד).
 * - exact word: (?<!\p{L})q(?!\p{L})
 * - word prefix: (?<!\p{L})q
 */
function wordRegex(queryNorm: string, kind: "exact" | "prefix"): RegExp | null {
  const q = queryNorm.trim();
  if (q.length < 1) return null;
  const core = escapeRegExp(q);
  if (kind === "exact") {
    return new RegExp(`(?<!\\p{L})${core}(?!\\p{L})`, "u");
  }
  return new RegExp(`(?<!\\p{L})${core}`, "u");
}

/** Lower = better. Tier: exact line → exact word → word-prefix → substring. */
export function homeLocalSearchRank(
  name: string,
  query: string
): [number, number, string] {
  const q = normalizeForRank(query);
  const n = name.trim();
  const nNorm = normalizeForRank(n);
  if (!q) return [99, 0, n];

  // 0) Exact whole line (normalized)
  if (nNorm === q) return [0, 0, n];

  const parts = splitNameToParts(nNorm);
  const reExact = wordRegex(q, "exact");
  const rePrefix = wordRegex(q, "prefix");

  // 1) Exact word match anywhere (best for "שוק" not "שוקו")
  if (reExact) {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (reExact.test(part)) return [1, i, n];
    }
  }

  // 2) Word prefix match (useful for short queries like "חמ" → "חמאה")
  if (rePrefix) {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (rePrefix.test(part)) return [2, i, n];
    }
  }

  // 3) Substring match (fallback)
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const idx = part.indexOf(q);
    if (idx >= 0) return [3, i * 10 + idx, n];
  }

  return [9, 0, n];
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
