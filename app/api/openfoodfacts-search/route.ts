import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type OffProductLite = {
  code: string;
  product_name: string;
  brands?: string;
  quantity?: string;
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

function normalizeProducts(raw: unknown): OffProductLite[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const products = o.products;
  if (!Array.isArray(products)) return [];

  const out: OffProductLite[] = [];
  for (const p of products) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const code = pickFirstText(r.code);
    const name = pickFirstText(r.product_name, r.product_name_he, r.product_name_en);
    if (!code || !name) continue;

    const brands = pickFirstText(r.brands);
    const quantity = pickFirstText(r.quantity);

    out.push({
      code,
      product_name: name,
      brands: brands || undefined,
      quantity: quantity || undefined,
    });
  }
  return out;
}

async function fetchOffJson(
  baseUrl: string,
  searchTerms: string,
  pageSize: number,
  signal: AbortSignal
): Promise<unknown> {
  const params = new URLSearchParams({
    search_terms: searchTerms,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(pageSize),
  });

  const url = `${baseUrl.replace(/\/+$/, "")}/cgi/search.pl?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "CalorieJournal/1.0 (Next.js; Home Search)",
    },
    signal,
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    throw new Error(`OFF HTTP ${res.status}`);
  }
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("OFF returned non-JSON");
  }
  return (await res.json()) as unknown;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const pageSizeRaw = parseInt(searchParams.get("pageSize") ?? "16", 10) || 16;
  const pageSize = Math.min(30, Math.max(6, pageSizeRaw));

  if (q.length < 2) {
    return NextResponse.json({ items: [] as OffProductLite[] });
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
        const raw = await fetchOffJson(base, q, pageSize, ac.signal);
        const items = normalizeProducts(raw);
        return NextResponse.json({ items });
      } catch (e) {
        lastErr = e;
      }
    }
    return NextResponse.json(
      {
        items: [] as OffProductLite[],
        error: "Open Food Facts זמנית לא זמין",
        detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
      },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

