import fs from "fs";
import path from "path";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import {
  normalizeSearchText,
  stripPunctuationForSearch,
} from "./foodSearchRank";
import {
  type FoodUnitGramOverrides,
  totalGramsForServing,
} from "./unitConversion";

/**
 * חיפוש מחמיר: רק אם השורה מתחילה במחרוזת המלאה, או מילה ראשונה/שורה מלאה תואמת,
 * או המחרוזת המלאה מופיעה רצוף בלי פיסוק (לא התאמת שני תווים בלבד).
 */
export function layeredSearchScore(
  productName: string,
  rawQuery: string
): number {
  const n = normalizeSearchText(productName);
  const q = normalizeSearchText(rawQuery);
  if (q.length < 2) return -1;

  const nStrip = stripPunctuationForSearch(productName);
  const qStrip = stripPunctuationForSearch(rawQuery);
  if (qStrip.length < 2) return -1;

  // Names sometimes include multiple aliases separated by commas:
  // "בשר עוף, שוק" — searching "שוק עוף" should match across aliases too.
  const parts = n.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);

  const isLetter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);
  const hasWordBoundaryMatch = (hay: string, needle: string) => {
    if (!needle) return false;
    const idx = hay.indexOf(needle);
    if (idx < 0) return false;
    const before = hay[idx - 1];
    const after = hay[idx + needle.length];
    return !isLetter(before) && !isLetter(after);
  };

  const collapseTypos = (s: string) => s.replace(/יי+/g, "י").replace(/וו+/g, "ו");
  const q2 = collapseTypos(q);
  const qWords = q2.split(/\s+/).filter(Boolean);
  const tokenVariants = (t: string): string[] => {
    const x = collapseTypos(t);
    const out = new Set<string>([t, x]);
    const add = (s: string) => {
      const v = s.trim();
      if (v) out.add(v);
    };

    // Hebrew preposition prefixes: ב/ל/כ/מ/ו/ה (heuristic).
    for (const base of [t, x]) {
      if (base.length >= 4 && /^[בלכמווה]/.test(base)) {
        add(base.slice(1));
      }
    }

    // Common equivalence: "מים" ↔ "מי"
    for (const base of [t, x]) {
      if (base === "מים") add("מי");
    }
    const stripSuffix = (s: string, suffix: string) => {
      if (s.length <= suffix.length + 2) return;
      if (!s.endsWith(suffix)) return;
      out.add(s.slice(0, -suffix.length));
    };
    for (const base of [t, x]) {
      stripSuffix(base, "יות");
      stripSuffix(base, "ים");
      stripSuffix(base, "ות");
      stripSuffix(base, "ייה");
      stripSuffix(base, "יה");
      stripSuffix(base, "ה");
      stripSuffix(base, "ת");
    }
    return [...out].filter((v) => v && (v.length >= 3 || v === "מי"));
  };
  if (qWords.length >= 2) {
    // Cross-alias match: allow words to appear across comma-separated parts.
    const joined = parts.length ? parts.join(" ") : n;
    let ok = true;
    let sumIdx = 0;
    for (const w of qWords) {
      const isDigits = /^\d+$/.test(w);
      const idx = isDigits
        ? (() => {
            const re = new RegExp(`(?<!\\d)${w}(?!\\d)`, "u");
            const m = re.exec(joined);
            return m ? m.index : -1;
          })()
        : (() => {
            let best = -1;
            for (const v of tokenVariants(w)) {
              const i = joined.indexOf(v);
              if (i >= 0 && (best < 0 || i < best)) best = i;
            }
            return best;
          })();
      if (idx < 0) {
        ok = false;
        break;
      }
      sumIdx += idx;
    }
    if (ok) {
      // Stronger than boundary/single-word matches, weaker than exact line/prefix.
      // Prefer earlier occurrences and shorter strings implicitly via sumIdx.
      return 420_000 - sumIdx;
    }

    // Space/punctuation-insensitive variant
    const joinedStrip = stripPunctuationForSearch(joined);
    let okStrip = true;
    let sumIdxStrip = 0;
    for (const w of qWords) {
      const wStrip = stripPunctuationForSearch(w);
      if (!wStrip) continue;
      const isDigits = /^\d+$/.test(wStrip);
      const idx = isDigits
        ? (() => {
            const re = new RegExp(`(?<!\\d)${wStrip}(?!\\d)`, "u");
            const m = re.exec(joinedStrip);
            return m ? m.index : -1;
          })()
        : joinedStrip.indexOf(wStrip);
      if (idx < 0) {
        okStrip = false;
        break;
      }
      sumIdxStrip += idx;
    }
    if (okStrip) {
      return 400_000 - sumIdxStrip;
    }
  }

  let best = -1;
  for (const part of parts.length ? parts : [n]) {
    const tokens = part.split(/[\s]+/).filter(Boolean);
    const firstWord = tokens[0] ?? "";

    const exactStartWordOrLine = firstWord === q || part === q;

    if (exactStartWordOrLine) {
      best = Math.max(best, 1_000_000 - part.length);
      continue;
    }

    if (part.startsWith(q)) {
      best = Math.max(best, 500_000 + q.length * 100 - part.length);
      continue;
    }

    // Multi-word in a single alias part (rare but possible)
    if (qWords.length >= 2) {
      let ok = true;
      let sumIdx = 0;
      for (const w of qWords) {
        const isDigits = /^\d+$/.test(w);
        const idx = isDigits
          ? (() => {
              const re = new RegExp(`(?<!\\d)${w}(?!\\d)`, "u");
              const m = re.exec(part);
              return m ? m.index : -1;
            })()
          : (() => {
              let best = -1;
              for (const v of tokenVariants(w)) {
                const i = part.indexOf(v);
                if (i >= 0 && (best < 0 || i < best)) best = i;
              }
              return best;
            })();
        if (idx < 0) {
          ok = false;
          break;
        }
        sumIdx += idx;
      }
      if (ok) {
        best = Math.max(best, 360_000 - sumIdx);
        continue;
      }
    }

    // Prefer boundary matches when possible (avoid "שוק" → "שוקו" outranking "שוק עוף").
    if (hasWordBoundaryMatch(part, q)) {
      const idx = part.indexOf(q);
      best = Math.max(best, 220_000 - idx);
      continue;
    }

    if (nStrip.includes(qStrip)) {
      const idx = nStrip.indexOf(qStrip);
      best = Math.max(best, 100_000 - idx);
      continue;
    }
  }

  return best;
}

export type FoodDbRow = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  category: string;
  /** עקיפות גרם/יחידה מה־CSV — דורסות טבלת הקטגוריות */
  unitGrams?: FoodUnitGramOverrides;
};

const CSV_REL = path.join("מאגר הנתונים", "my_food_db.csv");

let cache: FoodDbRow[] | null = null;
let categoriesCache: string[] | null = null;

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").trim();
}

function parsePositiveFloat(raw: string | undefined): number | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function mapRow(
  record: Record<string, string>,
  index: number
): FoodDbRow | null {
  const keys = Object.keys(record);
  const find = (candidates: string[]) => {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      if (candidates.some((c) => nk === c || nk.includes(c))) return record[k];
    }
    const lower = keys.map((k) => [k, record[k]] as const);
    for (const [k, v] of lower) {
      if (candidates.some((c) => normalizeHeader(k).includes(c))) return v;
    }
    return undefined;
  };

  let name = find(["שם המוצר"]);
  let category = find(["קטגוריה"]);
  const calStr = find(["קלוריות"]);
  const pStr = find(["חלבון"]);
  const fStr = find(["שומן"]);
  const cStr = find(["פחמימות", "פחמימה"]);

  if (!name && keys.length >= 6) {
    const vals = keys.map((k) => record[k]);
    category = vals[0];
    name = vals[1];
  }

  if (!name?.trim()) return null;

  const calories = parseFloat(String(calStr ?? "").replace(",", ".")) || 0;
  const protein = parseFloat(String(pStr ?? "").replace(",", ".")) || 0;
  const fat = parseFloat(String(fStr ?? "").replace(",", ".")) || 0;
  const carbs = parseFloat(String(cStr ?? "").replace(",", ".")) || 0;

  const unitGrams: FoodUnitGramOverrides = {};
  const cup = parsePositiveFloat(
    find([
      "גרם לכוס",
      "משקל כוס",
      "כוס גרם",
      "כוס (גרם)",
      "gram cup",
      "g cup",
    ])
  );
  const tbsp = parsePositiveFloat(
    find(["גרם לכף", "משקל כף", "כף גרם", "כף (גרם)", "gram tbsp", "g tbsp"])
  );
  const tsp = parsePositiveFloat(
    find([
      "גרם לכפית",
      "משקל כפית",
      "כפית גרם",
      "כפית (גרם)",
      "gram tsp",
      "g tsp",
    ])
  );
  const spread = parsePositiveFloat(
    find([
      "גרם למריחה",
      "משקל מריחה",
      "מריחה גרם",
      "מריחה (גרם)",
      "gram spread",
    ])
  );
  const piece = parsePositiveFloat(
    find([
      "גרם ליחידה",
      "משקל יחידה",
      "יחידה גרם",
      "יחידה (גרם)",
      "gram unit",
      "g unit",
    ])
  );
  if (cup != null) unitGrams.cup = cup;
  if (tbsp != null) unitGrams.tbsp = tbsp;
  if (tsp != null) unitGrams.tsp = tsp;
  if (spread != null) unitGrams.spread = spread;
  if (piece != null) unitGrams.piece = piece;

  return {
    id: `db-${index}`,
    name: name.trim(),
    calories,
    protein,
    fat,
    carbs,
    category: (category ?? "").trim() || "—",
    ...(Object.keys(unitGrams).length > 0 ? { unitGrams } : {}),
  };
}

export function loadFoodDb(): FoodDbRow[] {
  if (cache) return cache;

  const csvPath = path.join(process.cwd(), CSV_REL);
  if (!fs.existsSync(csvPath)) {
    console.warn("[foodDb] CSV not found:", csvPath);
    cache = [];
    return cache;
  }

  const buf = fs.readFileSync(csvPath);
  const text = iconv.decode(buf, "cp862");

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const rows: FoodDbRow[] = [];
  records.forEach((rec, i) => {
    const row = mapRow(rec, i);
    if (row) rows.push(row);
  });

  cache = rows;
  return cache;
}

export function getCategories(): string[] {
  if (categoriesCache) return categoriesCache;
  const db = loadFoodDb();
  const s = new Set<string>();
  db.forEach((r) => {
    if (r.category) s.add(r.category);
  });
  categoriesCache = [...s].sort((a, b) => a.localeCompare(b, "he"));
  return categoriesCache;
}

/** חיפוש במאגר CSV (~6K פריטים) — דירוג מילולי קשיח */
export function searchFoodDb(
  query: string,
  opts?: { category?: string; limit?: number }
): FoodDbRow[] {
  const db = loadFoodDb();
  const limit = opts?.limit ?? 200;
  const cat = opts?.category?.trim();
  const q = query;
  if (normalizeSearchText(q).length < 1) return [];

  let list = db;
  if (cat && cat !== "הכל") {
    list = list.filter((r) => r.category === cat);
  }

  const scored: { r: FoodDbRow; score: number }[] = [];
  const seen = new Set<string>();

  for (const r of list) {
    if (seen.has(r.id)) continue;
    const score = layeredSearchScore(r.name, q);
    if (score < 0) continue;
    seen.add(r.id);
    scored.push({ r, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.r.name.localeCompare(b.r.name, "he");
  });

  return scored.slice(0, limit).map((x) => x.r);
}

/**
 * התאמה ליומן: קודם שם מדויק, אחר כך הכלה, אחר כך מילה ראשונה
 */
export function lookupFoodForLog(foodInput: string): FoodDbRow | null {
  const db = loadFoodDb();
  const q = foodInput.normalize("NFC").trim();
  if (!q) return null;

  const nq = normalizeSearchText(q);

  let exact: FoodDbRow | undefined;
  let contains: FoodDbRow | undefined;
  for (const r of db) {
    const nn = normalizeSearchText(r.name);
    if (nn === nq) {
      exact = r;
      break;
    }
    if (!contains && nn.includes(nq)) contains = r;
  }
  if (exact) return exact;
  if (contains) return contains;

  const words = nq.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    for (const r of db) {
      const nn = normalizeSearchText(r.name);
      if (words.every((w) => nn.includes(w))) return r;
    }
  }
  return null;
}

/**
 * קלוריות מהמאגר — לרוב לפי 100 גרם (טבלאות תזונה סטנדרטיות)
 */
export function scaleCaloriesFromDb(
  row: FoodDbRow,
  quantity: number,
  unit: string
): number {
  const kcal100 = row.calories;
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return 0;
  const totalG = totalGramsForServing(row.name, q, unit, row.unitGrams);
  return Math.round((kcal100 * totalG) / 100);
}

function safePer100(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** חלבון / פחמימות / שומן לפי 100 גרם במאגר — כפל בכמות כמו קלוריות */
export function scaleMacrosFromDb(
  row: FoodDbRow,
  quantity: number,
  unit: string
): { proteinG: number; carbsG: number; fatG: number } {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) {
    return { proteinG: 0, carbsG: 0, fatG: 0 };
  }
  const totalG = totalGramsForServing(row.name, q, unit, row.unitGrams);
  const scale = (per100Raw: number) => {
    const per100 = safePer100(per100Raw);
    const v = (per100 * totalG) / 100;
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  };
  return {
    proteinG: scale(row.protein),
    carbsG: scale(row.carbs),
    fatG: scale(row.fat),
  };
}

export function clearFoodDbCache(): void {
  cache = null;
  categoriesCache = null;
}
