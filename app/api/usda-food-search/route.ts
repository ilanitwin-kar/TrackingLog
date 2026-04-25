import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type UsdaFoodSearchItem = {
  id: string;
  name: string;
  verified: boolean;
  category: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source: "usda";
};

type UsdaNutrient = {
  nutrientId?: number;
  value?: number;
};

type UsdaFood = {
  fdcId?: number;
  description?: string;
  dataType?: string;
  brandOwner?: string;
  foodNutrients?: UsdaNutrient[];
};

function pickNutrients(nutrients: UsdaNutrient[] | undefined): {
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
} {
  if (!Array.isArray(nutrients)) return {};
  let kcal: number | undefined;
  let protein: number | undefined;
  let fat: number | undefined;
  let carbs: number | undefined;

  for (const n of nutrients) {
    const id = n.nutrientId;
    const v = n.value;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (id === 1008) kcal = v;
    else if (id === 1003) protein = v;
    else if (id === 1004) fat = v;
    else if (id === 1005) carbs = v;
  }
  return { kcal, protein, fat, carbs };
}

function mapFood(f: UsdaFood): UsdaFoodSearchItem | null {
  const fdcId = f.fdcId;
  if (typeof fdcId !== "number" || !Number.isFinite(fdcId)) return null;
  const desc = (f.description ?? "").trim();
  if (!desc) return null;

  const { kcal, protein, fat, carbs } = pickNutrients(f.foodNutrients);
  if (kcal == null || kcal <= 0) return null;

  const bits = [f.dataType, f.brandOwner].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );
  const category =
    bits.length > 0
      ? `USDA FoodData Central · ${bits.join(" · ")}`
      : "USDA FoodData Central";

  return {
    id: `usda-${fdcId}`,
    name: desc,
    verified: true,
    category,
    calories: kcal,
    protein: protein ?? 0,
    fat: fat ?? 0,
    carbs: carbs ?? 0,
    source: "usda",
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const pageSizeRaw = parseInt(searchParams.get("pageSize") ?? "20", 10) || 20;
  const pageSize = Math.min(40, Math.max(4, pageSizeRaw));

  if (q.length < 2) {
    return NextResponse.json({ items: [] as UsdaFoodSearchItem[] });
  }

  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      items: [] as UsdaFoodSearchItem[],
      error:
        "חסר מפתח USDA: הוסיפי USDA_API_KEY לקובץ .env.local (ראי .env.example)",
    });
  }

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 20_000);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: q,
        pageSize,
        pageNumber: 1,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      }),
      signal: ac.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          items: [] as UsdaFoodSearchItem[],
          error: `USDA HTTP ${res.status}`,
          detail: text.slice(0, 200),
        },
        { status: 200 }
      );
    }

    const raw = (await res.json()) as { foods?: UsdaFood[] };
    const foods = raw.foods;
    if (!Array.isArray(foods)) {
      return NextResponse.json({ items: [] as UsdaFoodSearchItem[] });
    }

    const items: UsdaFoodSearchItem[] = [];
    for (const f of foods) {
      const row = mapFood(f);
      if (row) items.push(row);
    }

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json(
      { items: [] as UsdaFoodSearchItem[], error: "USDA זמנית לא זמין" },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
