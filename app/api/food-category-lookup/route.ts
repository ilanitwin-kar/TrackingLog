import { NextResponse } from "next/server";
import { lookupFoodForLog } from "@/lib/foodDb";

export const dynamic = "force-dynamic";

/** התאמת שם מזון למאגר (Node בלבד) — לשימוש מקומפוננטות לקוח */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ category: null as string | null });
  }
  const hit = lookupFoodForLog(q);
  const category = hit?.category?.trim() || null;
  return NextResponse.json({ category });
}
