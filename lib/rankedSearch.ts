import Fuse from "fuse.js";

export type MatchRange = readonly [number, number];

export type RankedHit<T> = {
  item: T;
  /** ranges in displayText to render as bold */
  ranges: MatchRange[];
  /** true if displayText starts with query (case-insensitive) */
  isPrefix: boolean;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length <= 1) return ranges;
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (!last) out.push([r[0], r[1]]);
    else if (r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * הדגשה בתוצאות בלבד — רק מחרוזת החיפוש כפי שנכתבה (רצף רציף), ללא קשר ל-Fuse.
 * אם אין הופעה ליטראלית במחרוזת, לא מגיעים טווחים (ללא סימון מטעה).
 */
export function literalQueryHighlightRanges(
  displayText: string,
  query: string
): MatchRange[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const qlen = q.length;
  const needleLower = q.toLowerCase();
  const haystack = displayText;
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (i <= haystack.length - qlen) {
    if (haystack.slice(i, i + qlen).toLowerCase() === needleLower) {
      ranges.push([i, i + qlen - 1]);
      i += qlen;
    } else {
      i += 1;
    }
  }
  return mergeRanges(ranges);
}

export function rankedFuzzySearchByText<T>(
  items: T[],
  query: string,
  opts: {
    getText: (item: T) => string;
    getKey?: (item: T) => string;
    limit?: number;
    threshold?: number;
  }
): RankedHit<T>[] {
  const q = norm(query);
  if (q.length < 2) return [];

  const limit = Math.max(1, Math.min(60, opts.limit ?? 18));
  const getKey = opts.getKey ?? ((it: T) => opts.getText(it));

  const mapped = items.map((it) => ({
    key: getKey(it),
    text: opts.getText(it) ?? "",
    item: it,
  }));

  const prefix: RankedHit<T>[] = [];
  for (const m of mapped) {
    const t = norm(m.text);
    if (t.startsWith(q)) {
      prefix.push({
        item: m.item,
        ranges: literalQueryHighlightRanges(m.text, query),
        isPrefix: true,
      });
    }
  }
  prefix.sort((a, b) => (opts.getText(a.item).length || 0) - (opts.getText(b.item).length || 0));

  const fuse = new Fuse(mapped, {
    keys: ["text"],
    includeMatches: true,
    ignoreLocation: true,
    findAllMatches: true,
    threshold: opts.threshold ?? 0.36,
    distance: 80,
    minMatchCharLength: 2,
    shouldSort: true,
  });

  const seen = new Set<string>();
  const out: RankedHit<T>[] = [];

  function pushHit(hit: RankedHit<T>, key: string) {
    if (out.length >= limit) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(hit);
  }

  // prefix first
  for (const h of prefix) {
    pushHit(h, getKey(h.item));
    if (out.length >= limit) return out;
  }

  const fuzzyRes = fuse.search(q);
  for (const r of fuzzyRes) {
    const key = r.item.key;
    if (seen.has(key)) continue;
    pushHit(
      {
        item: r.item.item,
        ranges: literalQueryHighlightRanges(r.item.text, query),
        isPrefix: false,
      },
      key
    );
    if (out.length >= limit) break;
  }
  return out;
}

