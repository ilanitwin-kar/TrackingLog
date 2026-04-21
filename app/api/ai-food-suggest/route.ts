import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SuggestItem = {
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export async function GET(req: Request) {
  const openAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!openAiKey) return NextResponse.json({ items: [] as SuggestItem[] });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 64);
  if (q.length < 2) return NextResponse.json({ items: [] as SuggestItem[] });

  const system =
    `You are a Hebrew food ingredient suggester for a recipe calculator.\n` +
    `Return ONLY JSON: { "items": SuggestItem[] }.\n` +
    `SuggestItem fields are per 100g values: caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g.\n` +
    `Be conservative and generic (typical values), prefer common Israeli foods/brands when relevant.\n` +
    `Max 8 items.\n`;

  const user =
    `Query: ${q}\n` +
    `Return suggestions matching what the user probably means.\n`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ items: [] as SuggestItem[] });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJson<{ items?: SuggestItem[] }>(content);
    const raw = Array.isArray(parsed?.items) ? parsed!.items : [];
    const items = raw
      .filter((x) => x && typeof x === "object" && typeof x.name === "string")
      .slice(0, 8)
      .map((x) => ({
        name: String(x.name).trim().slice(0, 120),
        caloriesPer100g: clamp(Math.round(Number(x.caloriesPer100g) || 0), 0, 2000),
        proteinPer100g: clamp(Number(x.proteinPer100g) || 0, 0, 500),
        carbsPer100g: clamp(Number(x.carbsPer100g) || 0, 0, 500),
        fatPer100g: clamp(Number(x.fatPer100g) || 0, 0, 500),
      }))
      .filter((x) => x.name.length > 0 && x.caloriesPer100g > 0);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] as SuggestItem[] });
  }
}

