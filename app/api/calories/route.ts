import { NextResponse } from "next/server";
import {
  lookupFoodForLog,
  scaleCaloriesFromDb,
  scaleMacrosFromDb,
} from "@/lib/foodDb";

type Body = {
  food: string;
  quantity?: number;
  unit?: string;
};

const HEURISTICS: [RegExp, number][] = [
  [/סנדוויץ|כריך|טוסט/i, 320],
  [/חביתה|ביצה|אומלט/i, 180],
  [/אורז/i, 200],
  [/עוף/i, 250],
  [/סלט/i, 120],
  [/פיצה/i, 280],
  [/פסטה/i, 400],
  [/שוקולד/i, 230],
  [/יוגורט/i, 110],
  [/בננה/i, 105],
  [/תפוח/i, 80],
  [/חלב/i, 150],
  [/קפה/i, 5],
  [/חומוס/i, 180],
];

function heuristicCalories(food: string): number {
  for (const [re, kcal] of HEURISTICS) {
    if (re.test(food)) return kcal;
  }
  return 220;
}

async function openAiEstimate(food: string, quantity: number, unit: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'אתה דיאטנית מומחית. הערך קלוריות לפי כמות ויחידה. החזר אובייקט JSON עם המפתחות calories (מספר) ו-reason_he (משפט קצר בעברית) בלבד.',
        },
        {
          role: "user",
          content: `מזון: ${food}\nכמות: ${quantity}\nיחידה: ${unit}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { calories: number; reason_he: string };
    return {
      calories: Math.round(Math.max(0, parsed.calories)),
      note: parsed.reason_he,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const food = (body.food ?? "").trim();
  if (!food) {
    return NextResponse.json({ error: "חסר שם מזון" }, { status: 400 });
  }

  const rawQ = body.quantity;
  const quantity =
    typeof rawQ === "number" && Number.isFinite(rawQ) && rawQ > 0 ? rawQ : 100;
  const unit = (body.unit ?? "גרם").trim() || "גרם";

  const row = lookupFoodForLog(food);
  if (row) {
    const kcal = scaleCaloriesFromDb(row, quantity, unit);
    const macros = scaleMacrosFromDb(row, quantity, unit);
    return NextResponse.json({
      calories: Math.max(1, kcal),
      source: "database",
      verified: true,
      note: row.name.length > 80 ? `${row.name.slice(0, 80)}…` : row.name,
      protein: macros.proteinG,
      carbohydrates: macros.carbsG,
      fat: macros.fatG,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      meta: {
        protein: row.protein,
        fat: row.fat,
        carbs: row.carbs,
        category: row.category,
      },
    });
  }

  // רק אם אין התאמה במאגר ה-CSV — ניסיון AI, ואז הערכה מקומית
  const ai = await openAiEstimate(food, quantity, unit);
  if (ai) {
    return NextResponse.json({
      calories: ai.calories,
      source: "ai",
      verified: false,
      note: ai.note,
    });
  }

  const base = heuristicCalories(food);
  let scaled = base;
  if (unit === "גרם") {
    scaled = Math.round((base * quantity) / 100);
  } else if (unit === "יחידה") {
    scaled = Math.round(base * quantity);
  } else {
    scaled = Math.round(base * quantity * 0.9);
  }

  return NextResponse.json({
    calories: Math.max(1, scaled),
    source: "estimate",
    verified: false,
    note: "הערכה",
  });
}
