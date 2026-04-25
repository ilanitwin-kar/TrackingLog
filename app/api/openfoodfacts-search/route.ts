import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** מזהה לבקשות ל־Open Food Facts (נדרש כדי שלא ייחסמו בקשות). */
const USER_AGENT = "CalorieJournal/1.0 (contact via app maintainer)";

type OffNutriments = Record<string, unknown>;

function num100g(n: OffNutriments, key: string): number {
  const v = n[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const x = parseFloat(v);
    if (Number.isFinite(x)) return x;
  }
  return NaN;
}

function kcalPer100g(n: OffNutriments): number | null {
  const kcal = num100g(n, "energy-kcal_100g");
  if (Number.isFinite(kcal)) return kcal;
  const kcal2 = num100g(n, "energy_kcal_100g");
  if (Number.isFinite(kcal2)) return kcal2;
  const kj = num100g(n, "energy-kj_100g");
  if (Number.isFinite(kj)) return kj / 4.184;
  const kj2 = num100g(n, "energy_kj_100g");
  if (Number.isFinite(kj2)) return kj2 / 4.184;
  const energy = num100g(n, "energy_100g");
  if (!Number.isFinite(energy)) return null;
  const unit = String(n["energy_unit"] ?? "").toLowerCase();
  if (unit === "kj") return energy / 4.184;
  if (unit === "kcal") return energy;
  return null;
}

/** מנקה תווים שעלולים לשבור את מנתח Lucene של Search-a-licious. */
function sanitizeSearchQuery(q: string): string {
  return q
    .replace(/["\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function parseSearchALiciousHits(data: unknown): unknown[] | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.errors) && d.errors.length > 0) return null;
  const hits = d.hits;
  if (!Array.isArray(hits)) return null;
  return hits;
}

function pickOffDisplayName(p: Record<string, unknown>): string {
  const tryField = (v: unknown): string => {
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      for (const lang of ["he", "iw", "en"]) {
        const x = o[lang];
        if (typeof x === "string" && x.trim()) return x.trim();
      }
      for (const x of Object.values(o)) {
        if (typeof x === "string" && x.trim()) return x.trim();
      }
    }
    return "";
  };

  for (const key of ["product_name", "product_name_en", "generic_name"] as const) {
    const t = tryField(p[key]);
    if (t) return t;
  }
  return "";
}

function mapProductsToItems(products: unknown[]): Array<{
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}> {
  const items: Array<{
    id: string;
    name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }> = [];

  for (const raw of products) {
    if (typeof raw !== "object" || raw === null) continue;
    const p = raw as Record<string, unknown>;
    const name = pickOffDisplayName(p);
    if (!name) continue;
    const nut = (p.nutriments ?? {}) as OffNutriments;
    const kcal = kcalPer100g(nut);
    if (kcal == null || kcal < 0) continue;

    const code = p.code != null ? String(p.code).trim() : "";
    const id = code ? `off-${code}` : `off-${items.length}-${name.slice(0, 24)}`;

    const protein = num100g(nut, "proteins_100g");
    const carbs = num100g(nut, "carbohydrates_100g");
    const fat = num100g(nut, "fat_100g");

    items.push({
      id,
      name,
      calories: Math.round(kcal),
      protein: Number.isFinite(protein) ? protein : 0,
      carbs: Number.isFinite(carbs) ? carbs : 0,
      fat: Number.isFinite(fat) ? fat : 0,
    });
  }
  return items;
}

async function fetchSearchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("application/json")) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * חיפוש טקסט ב־Open Food Facts דרך Search-a-licious (Elasticsearch).
 * ה־API הישן ‎/api/v2/search?search_terms=…‎ לא מיישם חיפוש טקסט — מחזיר דף כמעט אקראי
 * (אותו count ~מיליונים ותוצאות לא קשורות). ראו מסמכי OFF ו־search.openfoodfacts.org/docs
 */
async function fetchOpenFoodFactsTextSearch(
  q: string,
  pageSize: number
): Promise<unknown[] | null> {
  const safe = sanitizeSearchQuery(q);
  if (safe.length < 2) return null;

  const params = new URLSearchParams({
    q: safe,
    page_size: String(pageSize),
    /** עברית + אנגלית — שמות מוצרים מקומיים ומילוליים ביחד */
    langs: "he,en",
    fields: "code,product_name,product_name_en,generic_name,nutriments",
  });

  const url = `https://search.openfoodfacts.org/search?${params.toString()}`;
  const data = await fetchSearchJson(url);
  if (data == null) return null;
  return parseSearchALiciousHits(data);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ items: [] as const });
  }
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "50");
  const pageSize = Math.min(
    50,
    Math.max(4, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 50)
  );

  const hits = await fetchOpenFoodFactsTextSearch(q, pageSize);
  if (hits && hits.length > 0) {
    const items = mapProductsToItems(hits);
    if (items.length > 0) {
      return NextResponse.json({ items });
    }
  }

  return NextResponse.json({ items: [] as const });
}
