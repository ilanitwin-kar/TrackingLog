import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UNAVAILABLE_HE = "שירות הניתוח זמנית לא זמין";

// Ensure .env.local is loaded in dev/turbopack route execution context.
// In production, hosting provider injects env vars; this is a no-op fallback.
loadEnvConfig(process.cwd());

function readDotEnvLocalValue(key: string): string {
  // Dev-only fallback for environments where `process.env` isn't populated correctly.
  if (process.env.NODE_ENV !== "development") return "";
  try {
    const p = path.join(process.cwd(), ".env.local");
    const exists = fs.existsSync(p);
    if (!exists) {
      console.log("[ai-meal-log] dotenv fallback: .env.local not found", { path: p });
      return "";
    }
    const raw = fs.readFileSync(p, "utf8");
    console.log("[ai-meal-log] dotenv fallback: read .env.local", {
      path: p,
      bytes: Buffer.byteLength(raw, "utf8"),
    });
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const idx = t.indexOf("=");
      if (idx <= 0) continue;
      const k = t.slice(0, idx).trim();
      if (k !== key) continue;
      let v = t.slice(idx + 1).trim();
      if (
        (v.startsWith("\"") && v.endsWith("\"")) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      console.log("[ai-meal-log] dotenv fallback: found key", {
        key,
        valueLen: v.trim().length,
      });
      return v.trim();
    }
    console.log("[ai-meal-log] dotenv fallback: key not found", { key });
    return "";
  } catch {
    return "";
  }
}

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
  /** שם נקי ליומן/מילון — רק המנה, בלי הקשר חברתי */
  displayName: string;
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

  const displayRaw = String(
    o.display_name ?? o.product_name ?? o.meal_title ?? ""
  ).trim();

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

  let displayName = displayRaw.replace(/^["']|["']$/g, "").trim();
  if (!displayName && breakdown.length > 0) {
    displayName = breakdown[0]!.item.trim();
  }
  if (!displayName) {
    displayName = "ארוחה";
  }

  return {
    kind: "result",
    original,
    displayName,
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
  const openAiKeyFromEnv = process.env.OPENAI_API_KEY?.trim() ?? "";
  const openAiKey =
    openAiKeyFromEnv.length > 0
      ? openAiKeyFromEnv
      : readDotEnvLocalValue("OPENAI_API_KEY");

  // Debug env presence without leaking secrets.
  console.log("[ai-meal-log] env check", {
    nodeEnv: process.env.NODE_ENV,
    hasOpenAI: Boolean(openAiKey),
    openAiLen: openAiKey ? openAiKey.length : 0,
    hasGemini: Boolean(geminiKey),
    geminiLen: geminiKey ? geminiKey.length : 0,
    model: process.env.OPENAI_MEAL_MODEL ?? "",
  });

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
    `- If the user already stated a concrete amount (numbers + unit such as גרם/יחידה/כוס/מנה/פרוסה/כף/חצי/שליש/רבע/כפות/יחידות, or "100ג", "2 יחידות"), treat it as authoritative. Do NOT ask again "how much" for that same item unless the text is contradictory.\n` +
    `- Ask at most ONE follow-up question per round, targeting the single biggest uncertainty (e.g. cooking method, oil, brand size) — not a questionnaire.\n` +
    `- In breakdown[].qty, echo the assumed or stated portion in short Hebrew (e.g. "100 גרם", "1 יחידה").\n` +
    `- Common shorthand assumptions (DO NOT ask grams for these):\n` +
    `  - "חצי בננה" => assume ~50g edible banana.\n` +
    `  - If user gives a clear fraction/portion for a common single item, use a reasonable standard portion instead of asking.\n` +
    `- Output ONLY valid JSON. No markdown.\n` +
    `- Units: totals are for the whole meal as eaten.\n` +
    `- If user mentions \"מסעדה\" / restaurant / takeout, include a reasonable extra oil/butter factor typical of restaurant dishes.\n` +
    `- If user mentions vague quantities (\"ביס\", \"חופן\", \"קצת\", \"מעט\"), ask clarification unless the impact is clearly <20%.\n` +
    `- CRITICAL — display_name (Hebrew): In final results you MUST include \"display_name\": a SHORT label with ONLY the dish/product name for the journal (e.g. \"רביולי מוקרם עם פטריות\", \"סלט קיסר\"). Do NOT put user chatter in display_name (no \"אני במסעדה\", \"אכלתי צלחת שלמה\", \"מתה מרעב\", etc.). That extra text is context for calculation only; it must NOT appear in display_name.\n` +
    `- breakdown[].item should also name foods only (no narrative).\n\n` +
    `Conversation:\n` +
    `- If mode is \"start\": analyze the meal text.\n` +
    `- If mode is \"answer\": you already asked a question; incorporate the answer and finalize.\n\n` +
    `Return one of these shapes:\n` +
    `1) Follow-up needed:\n` +
    `{ \"kind\": \"question\", \"question\": \"...Hebrew question...\" }\n\n` +
    `2) Final result:\n` +
    `{ \"kind\": \"result\", \"display_name\": \"שם המנה בלבד\", \"totals\": { \"calories\": 0, \"protein\": 0, \"carbs\": 0, \"fat\": 0 }, \"breakdown\": [ { \"item\": \"\", \"qty\": \"\", \"calories\": 0, \"protein\": 0, \"carbs\": 0, \"fat\": 0 } ], \"notes\": \"optional\" }\n`;

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

