import type { DictionaryItem } from "@/lib/storage";

function normalizeHebrew(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

/**
 * דירוג חיפוש למילון: עדיפות למילה שמתחילה במחרוזת, ואז להתאמה בתחילת מילה,
 * ורק אז התאמת תת-מחרוזת — כדי שלא «לח» ייפגש קודם ב«מלח».
 */
function scoreDictionaryMatch(nameNorm: string, q: string): number {
  if (!q) return 0;
  if (nameNorm === q) return 1_000_000;
  if (nameNorm.startsWith(q)) {
    return 900_000 + Math.max(0, 400 - nameNorm.length);
  }

  const tokens = nameNorm.split(/[\s,.;:/\\|!\-_–—()[\]{}״׳]+/).filter(Boolean);
  let best = -Infinity;
  for (const tok of tokens) {
    if (tok === q) best = Math.max(best, 850_000);
    else if (tok.startsWith(q)) {
      best = Math.max(best, 750_000 + Math.max(0, 200 - tok.length));
    }
  }
  if (best > -Infinity / 2) return best;

  const boundaryBefore = (idx: number) =>
    idx === 0 || /[\s,.;:/\\|!\-_–—()[\]{}]/.test(nameNorm[idx - 1]!);

  let idx = nameNorm.indexOf(q);
  while (idx >= 0) {
    if (boundaryBefore(idx)) {
      best = Math.max(best, 500_000 - idx * 10);
    }
    idx = nameNorm.indexOf(q, idx + 1);
  }
  if (best > -Infinity / 2) return best;

  idx = nameNorm.indexOf(q);
  if (idx >= 0) return 120_000 - idx;

  return -Infinity;
}

/** מחזיר פריטים תואמים ממוינים לפי רלוונטיות (הטובים ראשון). */
export function rankDictionaryByQuery(
  items: DictionaryItem[],
  query: string,
): DictionaryItem[] {
  const q = normalizeHebrew(query);
  if (!q) return items.slice();
  const ranked = items
    .map((d) => ({
      d,
      s: scoreDictionaryMatch(normalizeHebrew(d.food), q),
    }))
    .filter((x) => Number.isFinite(x.s))
    .sort(
      (a, b) =>
        b.s - a.s || a.d.food.localeCompare(b.d.food, "he", { sensitivity: "base" }),
    );
  return ranked.map((x) => x.d);
}
