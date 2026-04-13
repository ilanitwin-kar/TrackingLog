import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

/** SDK handles REST routing; no v1beta URL in app code. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_UNAVAILABLE_HE = "שירות הניתוח זמנית לא זמין";

export type GeminiFoodResult = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export async function GET() {
  const hasKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  return NextResponse.json(
    {
      ok: true,
      hasKey,
      hint: hasKey
        ? "Key detected on server"
        : "Missing GOOGLE_GENERATIVE_AI_API_KEY in this deploy context",
    },
    // Always return 200 so the browser doesn't show a generic "page not working"
    // error page for diagnostics.
    { status: 200 }
  );
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Strip fences and parse; extract first JSON object/array if full parse fails. */
function parseGeminiResponseText(raw: string): unknown {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  const tryParse = (s: string): unknown => {
    const x = s.trim();
    if (x === "" || /^null$/i.test(x)) return null;
    return JSON.parse(x) as unknown;
  };

  try {
    return tryParse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return tryParse(t.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Could not parse JSON from Gemini. Snippet: ${t.slice(0, 200)}`);
  }
}

function normalizeFoodResult(
  parsed: unknown,
  query: string
): GeminiFoodResult | null {
  if (parsed === null) return null;
  if (!parsed || typeof parsed !== "object") return null;

  const o = parsed as Record<string, unknown>;
  const nameRaw =
    o.name ?? o.Name ?? o["שם"] ?? o.food ?? o.food_name ?? o.label;
  const name =
    typeof nameRaw === "string" && nameRaw.trim().length > 0
      ? nameRaw.trim()
      : query.trim();

  const calories =
    num(o.calories ?? o.Calories ?? o.kcal ?? o.energy ?? o.energy_kcal) ?? 0;
  const protein =
    num(o.protein ?? o.Protein ?? o.proteins ?? o.protein_g) ?? 0;
  const carbs =
    num(
      o.carbs ?? o.Carbs ?? o.carbohydrates ?? o.carbohydrate ?? o.carbohydrates_g
    ) ?? 0;
  const fat = num(o.fat ?? o.Fat ?? o.fats ?? o.fat_g) ?? 0;

  if (!Number.isFinite(calories) || calories < 0) {
    return null;
  }

  return {
    name,
    calories,
    protein: Number.isFinite(protein) ? Math.max(0, protein) : 0,
    carbs: Number.isFinite(carbs) ? Math.max(0, carbs) : 0,
    fat: Number.isFinite(fat) ? Math.max(0, fat) : 0,
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey?.trim()) {
    console.error("[gemini-food-analyze] Missing GOOGLE_GENERATIVE_AI_API_KEY");
    return NextResponse.json({ error: GEMINI_UNAVAILABLE_HE }, { status: 503 });
  }

  let body: { query?: string };
  try {
    body = (await req.json()) as { query?: string };
  } catch (e) {
    console.error("[gemini-food-analyze] Invalid request JSON", e);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ result: null as GeminiFoodResult | null });
  }

  const prompt = `You are a nutrition expert. Analyze the food item: "${query.replace(/"/g, '\\"')}".

Return ONLY valid JSON. No markdown, no backticks.
If it is not food, return null.
Otherwise return exactly this shape (numbers are per 100g):
{ "name": "Hebrew Name", "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    let parsed: unknown;
    try {
      parsed = parseGeminiResponseText(text);
    } catch (parseErr) {
      console.error("[gemini-food-analyze] JSON parse error", parseErr);
      console.error("[gemini-food-analyze] Raw text:", text);
      throw parseErr;
    }

    if (parsed === null) {
      return NextResponse.json({ result: null });
    }

    const normalized = normalizeFoodResult(parsed, query);
    if (!normalized) {
      console.warn(
        "[gemini-food-analyze] normalize returned null; parsed:",
        JSON.stringify(parsed)
      );
      return NextResponse.json({ result: null });
    }

    return NextResponse.json({ result: normalized });
  } catch (err) {
    console.error("[gemini-food-analyze] Gemini call failed:", err);
    return NextResponse.json(
      { error: GEMINI_UNAVAILABLE_HE },
      { status: 503 }
    );
  }
}
