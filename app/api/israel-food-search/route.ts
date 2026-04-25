import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RESOURCE_ID = "c3cb0630-0650-46c1-a068-82d575c094b2";

type CkanRecord = Record<string, unknown>;

function asNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function displayName(rec: CkanRecord): string {
  const he = asStr(rec.shmmitzrach);
  const en = asStr(rec.english_name);
  if (he && en && en.toLowerCase() !== he.toLowerCase()) {
    return `${he} (${en})`;
  }
  return he || en || "";
}

export type IsraelFoodSearchItem = {
  id: string;
  name: string;
  verified: boolean;
  category: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source: "israelMoH";
};

function mapRecord(rec: CkanRecord): IsraelFoodSearchItem | null {
  const sml = rec.smlmitzrach;
  const id =
    typeof sml === "number"
      ? `moh-${sml}`
      : String(sml ?? "").trim()
        ? `moh-${String(sml).trim()}`
        : null;
  const name = displayName(rec);
  const kcal = asNum(rec.food_energy);
  if (!id || !name || kcal == null || kcal <= 0) return null;

  return {
    id,
    name,
    verified: true,
    category: "משרד הבריאות — טבלת הרכב המזון (ל־100 ג׳)",
    calories: kcal,
    protein: asNum(rec.protein) ?? 0,
    fat: asNum(rec.total_fat) ?? 0,
    carbs: asNum(rec.carbohydrates) ?? 0,
    source: "israelMoH",
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const pageSizeRaw = parseInt(searchParams.get("pageSize") ?? "20", 10) || 20;
  const pageSize = Math.min(40, Math.max(4, pageSizeRaw));

  if (q.length < 2) {
    return NextResponse.json({ items: [] as IsraelFoodSearchItem[] });
  }

  const url = new URL("https://data.gov.il/api/3/action/datastore_search");
  url.searchParams.set("resource_id", RESOURCE_ID);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(pageSize));

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 18_000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "CalorieJournal/1.0 (Next.js)",
      },
      signal: ac.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          items: [] as IsraelFoodSearchItem[],
          error: `data.gov.il HTTP ${res.status}`,
        },
        { status: 200 }
      );
    }

    const raw = (await res.json()) as {
      success?: boolean;
      result?: { records?: CkanRecord[] };
    };

    const records = raw?.result?.records;
    if (!Array.isArray(records)) {
      return NextResponse.json({ items: [] as IsraelFoodSearchItem[] });
    }

    const items: IsraelFoodSearchItem[] = [];
    for (const rec of records) {
      const row = mapRecord(rec);
      if (row) items.push(row);
    }

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json(
      {
        items: [] as IsraelFoodSearchItem[],
        error: "חיפוש משרד הבריאות זמנית לא זמין",
      },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
