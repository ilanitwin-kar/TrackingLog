import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UNAVAILABLE_HE = "שירות הניתוח זמנית לא זמין";

type MealBreakdownRow = {
  item: string;
  qty: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MealResult = {
  kind: "result";
  original: string;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  breakdown: MealBreakdownRow[];
  notes?: string;
};

type MealQuestion = {
  kind: "question";
  original: string;
  question: string;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseJsonFromText(raw: string): unknown {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(t) as unknown;
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1)) as unknown;
    }
    throw new Error("Could not parse JSON");
  }
}

function normalize(parsed: unknown, original: string): MealResult | MealQuestion | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const kind = String(o.kind ?? "").trim();
  if (kind === "question") {
    const q = String(o.question ?? "").trim();
    if (!q) return null;
    return { kind: "question", original, question: q };
  }
  if (kind !== "result") return null;

  const totalsRaw = o.totals;
  const totalsObj =
    totalsRaw && typeof totalsRaw === "object" ? (totalsRaw as Record<string, unknown>) : {};
  const calories = num(totalsObj.calories) ?? 0;
  const protein = num(totalsObj.protein) ?? 0;
  const carbs = num(totalsObj.carbs) ?? 0;
  const fat = num(totalsObj.fat) ?? 0;
  if (!Number.isFinite(calories) || calories < 0) return null;

  const breakdownRaw = Array.isArray(o.breakdown) ? (o.breakdown as unknown[]) : [];
  const breakdown: MealBreakdownRow[] = [];
  for (const r of breakdownRaw) {
    if (!r || typeof r !== "object") continue;
    const rr = r as Record<string, unknown>;
    const item = String(rr.item ?? "").trim();
    const qty = String(rr.qty ?? "").trim();
    if (!item) continue;
    breakdown.push({
      item,
      qty: qty || "כמות לא צוינה",
      calories: Math.max(0, num(rr.calories) ?? 0),
      protein: Math.max(0, num(rr.protein) ?? 0),
      carbs: Math.max(0, num(rr.carbs) ?? 0),
      fat: Math.max(0, num(rr.fat) ?? 0),
    });
  }

  return {
    kind: "result",
    original,
    totals: {
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
    },
    breakdown,
    notes: typeof o.notes === "string" ? o.notes.trim() : undefined,
  };
}

export async function POST(req: Request) {
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? "";
  const openAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!geminiKey && !openAiKey) {
    console.error(
      "[ai-meal-log] Missing AI API keys (OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY)."
    );
    return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
  }

  let body: { original?: string; input?: string; mode?: "start" | "answer" };
  try {
    body = (await req.json()) as { original?: string; input?: string; mode?: "start" | "answer" };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = body.mode ?? "start";
  const original = (body.original ?? "").trim();
  const input = (body.input ?? "").trim();

  const base = mode === "start" ? input : original;
  if (base.length < 2) {
    return NextResponse.json({ result: null as MealResult | MealQuestion | null });
  }

  const safeOriginal = (mode === "start" ? input : original).replace(/\"/g, '\\"');
  const safeAnswer = input.replace(/\"/g, '\\"');
  const answerBlock =
    mode === "answer"
      ? `\nUser answer to your question:\n\"\"\"${safeAnswer}\"\"\"\n`
      : "";

  const systemPrompt =
    `You are a Hebrew nutrition logger for an app.\n\n` +
    `Goal:\n` +
    `- User writes a free-text meal description in Hebrew.\n` +
    `- If critical info is missing and can change totals by more than 20%, DO NOT guess. Return a friendly follow-up question instead.\n` +
    `- Otherwise, compute totals and a transparent breakdown.\n\n` +
    `Important rules:\n` +
    `- Output ONLY valid JSON. No markdown.\n` +
    `- Units: totals are for the whole meal as eaten.\n` +
    `- If user mentions \"מסעדה\" / restaurant / takeout, include a reasonable extra oil/butter factor typical of restaurant dishes.\n` +
    `- If user mentions vague quantities (\"ביס\", \"חופן\", \"קצת\", \"מעט\"), ask clarification unless the impact is clearly <20%.\n\n` +
    `Conversation:\n` +
    `- If mode is \"start\": analyze the meal text.\n` +
    `- If mode is \"answer\": you already asked a question; incorporate the answer and finalize.\n\n` +
    `Return one of these shapes:\n` +
    `1) Follow-up needed:\n` +
    `{ \"kind\": \"question\", \"question\": \"...Hebrew question...\" }\n\n` +
    `2) Final result:\n` +
    `{ \"kind\": \"result\", \"totals\": { \"calories\": 0, \"protein\": 0, \"carbs\": 0, \"fat\": 0 }, \"breakdown\": [ { \"item\": \"\", \"qty\": \"\", \"calories\": 0, \"protein\": 0, \"carbs\": 0, \"fat\": 0 } ], \"notes\": \"optional\" }\n`;

  const userPrompt =
    `User original meal text:\n` + `\"\"\"${safeOriginal}\"\"\"\n` + answerBlock;

  try {
    // Prefer OpenAI if configured (as it supports System Message explicitly).
    if (openAiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MEAL_MODEL?.trim() || "gpt-4.1-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        const parsed = parseJsonFromText(content);
        const normalized = normalize(parsed, mode === "start" ? input : original);
        return NextResponse.json({ result: normalized });
      }
      const txt = await res.text().catch(() => "");
      console.error("[ai-meal-log] OpenAI error", res.status, txt.slice(0, 300));
      // fall through to Gemini if available
    }

    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(`${systemPrompt}\n${userPrompt}`);
      const text = result.response.text();
      const parsed = parseJsonFromText(text);
      const normalized = normalize(parsed, mode === "start" ? input : original);
      return NextResponse.json({ result: normalized });
    }

    return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
  } catch (e) {
    console.error("[ai-meal-log] Unhandled error", e);
    return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
  }
}

