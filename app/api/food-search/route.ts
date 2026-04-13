import { NextResponse } from "next/server";
import { normalizeSearchText } from "@/lib/foodSearchRank";
import { searchFoodDb } from "@/lib/foodDb";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (normalizeSearchText(q).length < 2) {
    return NextResponse.json({ items: [] as { name: string; verified: boolean }[] });
  }

  const rows = searchFoodDb(q, { limit: 15 });
  return NextResponse.json({
    items: rows.map((r) => ({ name: r.name, verified: true })),
  });
}
