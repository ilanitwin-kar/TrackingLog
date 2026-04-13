import { NextResponse } from "next/server";
import {
  getCategories,
  loadFoodDb,
  searchFoodDb,
  type FoodDbRow,
} from "@/lib/foodDb";

export const dynamic = "force-dynamic";

type SortKey = "caloriesAsc" | "proteinDesc" | "carbsDesc" | "fatAsc";

const VALID_SORT = new Set<SortKey>([
  "caloriesAsc",
  "proteinDesc",
  "carbsDesc",
  "fatAsc",
]);

function sortRows(rows: FoodDbRow[], sort: SortKey): FoodDbRow[] {
  const copy = [...rows];
  if (sort === "caloriesAsc") {
    copy.sort((a, b) => a.calories - b.calories);
  } else if (sort === "proteinDesc") {
    copy.sort((a, b) => b.protein - a.protein);
  } else if (sort === "carbsDesc") {
    copy.sort((a, b) => b.carbs - a.carbs);
  } else {
    copy.sort((a, b) => a.fat - b.fat);
  }
  return copy;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const category = searchParams.get("category") ?? "";
  const sortRaw = searchParams.get("sort") ?? "caloriesAsc";
  const sort = (VALID_SORT.has(sortRaw as SortKey)
    ? sortRaw
    : "caloriesAsc") as SortKey;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(120, Math.max(20, parseInt(searchParams.get("pageSize") ?? "60", 10) || 60));

  const categories = getCategories();

  let rows: FoodDbRow[];
  if (q.length >= 2) {
    rows = searchFoodDb(q, {
      category: category && category !== "הכל" ? category : undefined,
      limit: 5000,
    });
  } else {
    rows = loadFoodDb();
    if (category && category !== "הכל") {
      rows = rows.filter((r) => r.category === category);
    }
  }

  rows = sortRows(rows, sort);

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({
    items: pageRows,
    total,
    page,
    pageSize,
    categories: ["הכל", ...categories],
  });
}
