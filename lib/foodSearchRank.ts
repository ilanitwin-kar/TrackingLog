/**
 * דירוג חיפוש מזון: מדויק → קידומת מלאה → מילים ברצף → הכלה.
 * תומך בעברית: NFC, ריווח מאוחד, מילים מרובות (קידומת לכל מילה מההתחלה).
 */

export type MatchTier = 1 | 2 | 3 | 4;

export function normalizeSearchText(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** הסרת פיסוק ורווחים להשוואת הכלה בשלב 3 (למשל "חזה" ב־"עוף, חזה") */
export function stripPunctuationForSearch(s: string): string {
  return normalizeSearchText(s)
    .replace(/[,;:!?.\-_'"()[\]]/g, "")
    .replace(/\s+/g, "");
}

function consecutiveWordPrefixesFromStart(
  nameNorm: string,
  tokens: string[]
): boolean {
  const words = nameNorm.split(/\s+/).filter(Boolean);
  if (words.length < tokens.length) return false;
  return tokens.every((t, i) => words[i]!.startsWith(t));
}

/**
 * 1 = מדויק, 2 = מתחיל ב (שם מלא), 3 = מילה ראשונה / רצף מילים מההתחלה, 4 = הכלה
 */
export function matchTierForName(name: string, query: string): MatchTier | 0 {
  const n = normalizeSearchText(name);
  const qRaw = normalizeSearchText(query);
  if (qRaw.length < 2) return 0;

  const tokens = qRaw.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  if (tokens.length >= 2) {
    const joined = tokens.join(" ");
    if (n === joined) return 1;
    if (n.startsWith(joined)) return 2;
    if (consecutiveWordPrefixesFromStart(n, tokens)) return 3;
    if (n.includes(joined)) return 4;
    return 0;
  }

  const q = tokens[0]!;
  if (n === q) return 1;
  if (n.startsWith(q)) return 2;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 3;
  if (n.includes(q)) return 4;
  return 0;
}

export function searchRankedStrings(
  foods: readonly string[],
  query: string,
  limit = 15
): string[] {
  const q = query.trim();
  if (normalizeSearchText(q).length < 2) return [];

  const buckets: Map<MatchTier, string[]> = new Map([
    [1, []],
    [2, []],
    [3, []],
    [4, []],
  ]);

  const seen = new Set<string>();

  for (const raw of foods) {
    const name = raw.trim();
    if (!name) continue;
    const tier = matchTierForName(name, q);
    if (tier === 0) continue;
    const key = normalizeSearchText(name);
    if (seen.has(key)) continue;
    seen.add(key);
    buckets.get(tier)!.push(name);
  }

  const cmp = (a: string, b: string) => a.localeCompare(b, "he");
  for (const t of [1, 2, 3, 4] as const) {
    buckets.get(t)!.sort(cmp);
  }

  const out: string[] = [];
  for (const t of [1, 2, 3, 4] as const) {
    for (const name of buckets.get(t)!) {
      out.push(name);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
