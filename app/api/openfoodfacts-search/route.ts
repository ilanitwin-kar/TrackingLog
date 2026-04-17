import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

function parseProductsPayload(data: unknown): unknown[] {
  if (typeof data !== "object" || data === null) return [];
  const d = data as Record<string, unknown>;
  const products = d.products;
  return Array.isArray(products) ? products : [];
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
    const name = String(
      p.product_name ?? p.product_name_en ?? p.generic_name ?? ""
    ).trim();
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ items: [] as const });
  }
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "24");
  const pageSize = Math.min(
    40,
    Math.max(4, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 24)
  );

  const enc = encodeURIComponent(q);

  const tryUrls = [
    `https://world.openfoodfacts.net/cgi/search.pl?action=process&search_terms=${enc}&json=true&page_size=${pageSize}&sort_by=unique_scans_n`,
    `https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=${enc}&json=true&page_size=${pageSize}&sort_by=unique_scans_n`,
    `https://world.openfoodfacts.net/api/v2/search?search_terms=${enc}&page_size=${pageSize}&fields=code,product_name,product_name_en,generic_name,nutriments`,
    `https://world.openfoodfacts.org/api/v2/search?search_terms=${enc}&page_size=${pageSize}&fields=code,product_name,product_name_en,generic_name,nutriments`,
  ];

  for (const url of tryUrls) {
    const data = await fetchSearchJson(url);
    if (data == null) continue;
    const products = parseProductsPayload(data);
    const items = mapProductsToItems(products);
    if (items.length > 0) {
      return NextResponse.json({ items });
    }
  }

  return NextResponse.json({ items: [] as const });
}
