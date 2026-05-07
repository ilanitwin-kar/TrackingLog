import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type SwapItem = {
  name: string;
  portionLabel: string;
  estimatedGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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

function sanitizeSwapItem(raw: unknown, allowedNames: Set<string>): SwapItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? "").trim().slice(0, 120);
  if (!name || !allowedNames.has(name)) return null;
  const portionLabel = String(o.portionLabel ?? "").trim().slice(0, 80);
  if (!portionLabel) return null;
  let g: number | null = null;
  if (typeof o.estimatedGrams === "number" && Number.isFinite(o.estimatedGrams)) {
    g = clamp(Math.round(o.estimatedGrams), 1, 450);
  }
  return {
    name,
    portionLabel,
    estimatedGrams: g,
    calories: clamp(Math.round(Number(o.calories) || 0), 1, 4000),
    protein: clamp(Number(o.protein) || 0, 0, 300),
    carbs: clamp(Number(o.carbs) || 0, 0, 300),
    fat: clamp(Number(o.fat) || 0, 0, 300),
  };
}

export async function POST(req: Request) {
  const openAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!openAiKey) return NextResponse.json({ item: null }, { status: 200 });

  let body: { current?: SwapItem; mealName?: string; pool?: string[] };
  try {
    body = (await req.json()) as { current?: SwapItem; mealName?: string; pool?: string[] };
  } catch {
    return NextResponse.json({ item: null }, { status: 400 });
  }

  const current = body.current;
  const pool = Array.isArray(body.pool)
    ? body.pool.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const allowed = new Set(pool);
  if (!current || !current.name || allowed.size < 3) return NextResponse.json({ item: null }, { status: 200 });

  const system =
    `את תזונאית מקצועית בעברית.\n` +
    `משימה: הציעי החלפה אחת (רק אחת) לפריט מזון, מתוך רשימת מוצרים נתונה בלבד.\n` +
    `כללים:\n` +
    `- אסור להמציא מוצרים. השם חייב להיות EXACTLY אחד מהשמות ברשימה.\n` +
    `- שמרי קלוריות דומות לפריט המקורי (סטייה עד ~±15%), אבל לא באמצעות כמויות מוגזמות של רטבים / תיבול / חטיפים«דיאטה» — תקרת גרמים סבירה למנה אחת.\n` +
    `- אם המוצר החלופי צפוף פחות בקלוריות מהמקור — אל תגדילי רק אותו למאות גרם; העדיפי מוצר צפוף יותר מהרשימה או כמות מתונה יחד עם התאמת הקלוריות הכוללת לפריט.\n` +
    `- פריכיות/חטיפים: לא יותר ממנה משביעה סטנדרטית (לא עשרות יחידות).\n` +
    `- החזירי גם estimatedGrams (מספר שלם) וגם portionLabel אנושי עם ≈ כשזה אומדן.\n` +
    `- התאימי להקשר הארוחה (בוקר לעומת צהריים) כמו בן אדם.\n` +
    `- החזירי JSON בלבד בפורמט: { "item": SwapItem | null }\n`;

  const user =
    `ארוחה: ${String(body.mealName ?? "").slice(0, 80)}\n` +
    `פריט מקורי:\n${JSON.stringify(current)}\n` +
    `מוצרים מותרים (names):\n${JSON.stringify(pool.slice(0, 800))}\n`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ item: null }, { status: 200 });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJson<{ item?: unknown }>(content);
    const item = sanitizeSwapItem(parsed?.item, allowed);
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ item: null }, { status: 200 });
  }
}
