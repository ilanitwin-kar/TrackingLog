import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type OffProductNormalized = {
  code: string;
  name: string;
  brand?: string;
  quantity?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickFirstText(...values: unknown[]): string {
  for (const v of values) {
    const s = asString(v).trim();
    if (s) return s;
  }
  return "";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", ".").replace(/\s/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function kjToKcal(kj: number): number {
  return kj / 4.184;
}

function normalizeProduct(raw: unknown, code: string): OffProductNormalized | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const product = o.product;
  if (!product || typeof product !== "object") return null;
  const p = product as Record<string, unknown>;

  const name = pickFirstText(p.product_name, p.product_name_he, p.product_name_en);
  if (!name) return null;

  const brands = pickFirstText(p.brands);
  const quantity = pickFirstText(p.quantity);

  const nutriments = p.nutriments;
  const n = nutriments && typeof nutriments === "object"
    ? (nutriments as Record<string, unknown>)
    : {};

  const kcal =
    num(n["energy-kcal_100g"]) ??
    num(n["energy_kcal_100g"]) ??
    (num(n["energy_100g"]) != null ? kjToKcal(num(n["energy_100g"])!) : null);

  const protein = num(n["proteins_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const fat = num(n["fat_100g"]);

  if (kcal == null || !Number.isFinite(kcal) || kcal <= 0) return null;

  return {
    code,
    name,
    brand: brands || undefined,
    quantity: quantity || undefined,
    caloriesPer100g: Math.max(0, Math.round(kcal)),
    proteinPer100g: Math.max(0, Math.round((protein ?? 0) * 10) / 10),
    carbsPer100g: Math.max(0, Math.round((carbs ?? 0) * 10) / 10),
    fatPer100g: Math.max(0, Math.round((fat ?? 0) * 10) / 10),
  };
}

async function fetchOffProductJson(
  baseUrl: string,
  code: string,
  signal: AbortSignal
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v0/product/${encodeURIComponent(code)}.json`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "CalorieJournal/1.0 (Next.js; OFF product lookup)",
    },
    signal,
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) throw new Error(`OFF HTTP ${res.status}`);
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("OFF returned non-JSON");
  }
  return (await res.json()) as unknown;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const bases = [
    "https://ssl-api.openfoodfacts.org",
    "https://us.openfoodfacts.org",
    "https://world.openfoodfacts.org",
  ];

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 20_000);

  try {
    let lastErr: unknown = null;
    for (const base of bases) {
      try {
        const raw = await fetchOffProductJson(base, code, ac.signal);
        const normalized = normalizeProduct(raw, code);
        if (!normalized) {
          lastErr = new Error("Missing nutrition data");
          continue;
        }
        return NextResponse.json({ item: normalized });
      } catch (e) {
        lastErr = e;
      }
    }
    return NextResponse.json(
      {
        error: "לא הצלחנו למשוך ערכים תזונתיים מהמאגרים",
        detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
      },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

