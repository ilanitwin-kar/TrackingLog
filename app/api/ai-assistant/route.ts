import { NextResponse } from "next/server";
import { APP_KNOWLEDGE_HE } from "@/lib/appKnowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UNAVAILABLE_HE = "שירות העוזר זמנית לא זמין";

type AssistantAction =
  | { type: "open"; label: string; payload: { href: string } }
  | { type: "log_ai_meal"; label: string; payload: { text: string } }
  | { type: "suggest_foods"; label: string; payload: { focus: "protein" | "carbs" | "fat" | "balanced" } }
  | {
      type: "search_verified_foods";
      label: string;
      payload: {
        q: string;
        sort?: "caloriesAsc" | "proteinDesc" | "carbsDesc" | "fatAsc";
        category?: string;
      };
    };

type NutritionCardJson = {
  id?: string;
  name?: string;
  portionLabel?: string;
  estimatedGrams?: number | null;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

/** סיכום ארוחה אחד — סה״כ לארוחה שלמה (לא רכיב-רכיב) */
type MealSummaryJson = {
  shortTitle: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  portionLabel?: string;
  estimatedGrams?: number | null;
};

type AssistantResponse = {
  reply: string;
  actions?: AssistantAction[];
  /** @deprecated — רק גיבוי; העדף mealSummary */
  nutritionCards?: NutritionCardJson[];
  /** סיכום מאוחד יחיד לארוחה */
  mealSummary?: MealSummaryJson | null;
};

type ChatTurn = { role: "user" | "assistant"; text: string };

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

function sanitizeNutritionCards(raw: unknown): NutritionCardJson[] {
  if (!Array.isArray(raw)) return [];
  const out: NutritionCardJson[] = [];
  for (const x of raw) {
    if (out.length >= 6) break;
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (name.length < 1 || name.length > 120) continue;
    const portionLabel =
      typeof o.portionLabel === "string" ? o.portionLabel.trim().slice(0, 80) : undefined;
    let g: number | null = null;
    if (typeof o.estimatedGrams === "number" && Number.isFinite(o.estimatedGrams)) {
      g = clamp(Math.round(o.estimatedGrams), 1, 5000);
    }
    const calories = clamp(Math.round(Number(o.calories) || 0), 1, 12000);
    const protein = clamp(Number(o.protein) || 0, 0, 500);
    const carbs = clamp(Number(o.carbs) || 0, 0, 500);
    const fat = clamp(Number(o.fat) || 0, 0, 500);
    const id =
      typeof o.id === "string" && o.id.trim().length > 0
        ? o.id.trim().slice(0, 64)
        : `card-${out.length}`;
    out.push({
      id,
      name,
      portionLabel: portionLabel || undefined,
      estimatedGrams: g,
      calories,
      protein,
      carbs,
      fat,
    });
  }
  return out;
}

function sanitizeMealSummary(raw: unknown): MealSummaryJson | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shortTitle = String(o.shortTitle ?? o.name ?? "")
    .trim()
    .slice(0, 80);
  if (shortTitle.length < 1) return null;
  const tc = clamp(Math.round(Number(o.totalCalories ?? o.calories) || 0), 1, 25000);
  const tp = clamp(Number(o.totalProtein ?? o.protein) || 0, 0, 800);
  const tcb = clamp(Number(o.totalCarbs ?? o.carbs) || 0, 0, 800);
  const tf = clamp(Number(o.totalFat ?? o.fat) || 0, 0, 800);
  const portionLabel =
    typeof o.portionLabel === "string" ? o.portionLabel.trim().slice(0, 80) : undefined;
  let g: number | null = null;
  if (typeof o.estimatedGrams === "number" && Number.isFinite(o.estimatedGrams)) {
    g = clamp(Math.round(o.estimatedGrams), 1, 8000);
  }
  return {
    shortTitle,
    totalCalories: tc,
    totalProtein: tp,
    totalCarbs: tcb,
    totalFat: tf,
    portionLabel: portionLabel || undefined,
    estimatedGrams: g,
  };
}

/** גיבוי: אם המודל עדיין מחזיר מערך רכיבים — ממזגים לסיכום אחד */
function aggregateCardsToMealSummary(cards: NutritionCardJson[]): MealSummaryJson | null {
  if (cards.length === 0) return null;
  let tc = 0;
  let tp = 0;
  let tcb = 0;
  let tf = 0;
  let tg = 0;
  const names: string[] = [];
  for (const c of cards) {
    tc += Number(c.calories) || 0;
    tp += Number(c.protein) || 0;
    tcb += Number(c.carbs) || 0;
    tf += Number(c.fat) || 0;
    if (c.estimatedGrams != null) tg += c.estimatedGrams;
    if (c.name) names.push(c.name);
  }
  const joined = names.slice(0, 4).join(" · ");
  const shortTitle =
    names.length <= 1
      ? (names[0] ?? "ארוחה").slice(0, 80)
      : `${joined}${names.length > 4 ? "…" : ""}`.slice(0, 80);
  return {
    shortTitle: shortTitle || "ארוחה",
    totalCalories: clamp(Math.round(tc), 1, 25000),
    totalProtein: clamp(tp, 0, 800),
    totalCarbs: clamp(tcb, 0, 800),
    totalFat: clamp(tf, 0, 800),
    estimatedGrams: tg > 0 ? clamp(Math.round(tg), 1, 8000) : null,
  };
}

function resolveMealSummary(
  parsed: AssistantResponse,
  legacyCards: NutritionCardJson[]
): MealSummaryJson | null {
  const direct = sanitizeMealSummary(parsed.mealSummary);
  if (direct) return direct;
  return aggregateCardsToMealSummary(legacyCards);
}

export async function POST(req: Request) {
  const openAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!openAiKey) {
    return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
  }

  let body: {
    message?: string;
    history?: ChatTurn[];
    snapshot?: unknown;
    memory?: unknown;
  };
  try {
    body = (await req.json()) as {
      message?: string;
      history?: ChatTurn[];
      snapshot?: unknown;
      memory?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (message.length < 1) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const snapshot = body.snapshot ?? {};
  const memory = body.memory ?? {};
  const history = Array.isArray(body.history) ? body.history.slice(-16) : [];

  const systemPrompt =
    `You are "Cherry/Blue" — the in-app Hebrew calorie assistant.\n` +
    `You are the ONLY source for numeric nutrition in this chat. Do NOT say you are searching a database, and NEVER write phrases like "לא מצאתי במאגר" or blame missing DB results.\n\n` +
    `snapshot (JSON) and memory are CONTEXT ONLY:\n` +
    `- Use snapshot.dictionary[] and today's totals to personalize (e.g. "אני רואה שאת אוהבת…", "נשארו לך עוד … קק״ל").\n` +
    `- Use dictionary only as context; nutrition precision comes from user-provided specifics.\n\n` +
    `Behavior:\n` +
    `- Warm, encouraging, concise Hebrew. Use את/ה naturally.\n` +
    `Precision rules (NO guessing):\n` +
    `- NEVER assume missing critical attributes for nutrition. If anything critical is missing, ask ONE focused Hebrew question and STOP.\n` +
    `- While asking a clarification question: set mealSummary=null and DO NOT provide any numeric calories/macros in reply.\n` +
    `- Ask only ONE question at a time, choose the MOST impactful missing detail.\n` +
    `- Treat these as CRITICAL for accuracy (examples):\n` +
    `  - Cheese/dairy ("גבינה", "גבינה לבנה", "קוטג׳", "לבנה", "גבינה צהובה"): ask fat % and type if unclear.\n` +
    `  - Yogurt ("יוגורט"): ask fat % and whether plain/flavored.\n` +
    `  - Bread ("לחם", "פיתה", "טורטיה"): ask type and how many slices/grams.\n` +
    `  - Rice/pasta ("אורז", "פסטה"): ask cooked vs dry and grams/cups.\n` +
    `  - Meat/chicken/fish ("עוף", "בשר", "דג"): ask cut + cooking method + grams.\n` +
    `  - Oils/nut butters ("שמן", "טחינה", "חמאת בוטנים"): ask teaspoons/tablespoons/grams.\n` +
    `- If the user already gave the missing detail in the same message, do not ask again.\n` +
    `- Understand כף / כפית / כוס / יחידה / "מנה במסעדה" / משקל בגרם when the user gives them.\n` +
    `- NEVER claim food was already saved to the journal. Saving is only via the app's buttons under your message.\n` +
    `- When (and only when) all critical details are known: output EXACTLY ONE aggregated meal summary in "mealSummary" (totals for the whole meal). Do NOT output a separate card per ingredient — put ingredient breakdown ONLY in "reply" text if useful.\n` +
    `- shortTitle: a short catchy Hebrew label for the whole meal (max ~8 words), e.g. "חזה עוף ואורז", "ארוחת בוקר קלילה".\n\n` +
    `Product routes (for suggestions, not for your math):\n${APP_KNOWLEDGE_HE}\n\n` +
    `Optional actions (shortcuts in the app UI):\n` +
    `- open: { "type":"open", "label":"…", "payload":{ "href":"/path" } }\n` +
    `- log_ai_meal: { "type":"log_ai_meal", "label":"רישום ארוחה ב-AI", "payload":{ "text":"…" } } — add when the meal is long/multi-dish or easier to refine in the dedicated AI meal screen; set payload.text to the user's wording or your short restatement.\n` +
    `- suggest_foods: macro-focused navigation\n` +
    `- Do NOT emit search_verified_foods.\n\n` +
    `JSON output schema (ONLY this object):\n` +
    `{\n` +
    `  "reply": string (Hebrew; if clarifying, ask ONE question and do NOT include numbers),\n` +
    `  "mealSummary": {\n` +
    `    "shortTitle": string (short Hebrew title for the WHOLE meal),\n` +
    `    "totalCalories": number (kcal total for entire meal),\n` +
    `    "totalProtein": number (grams protein total),\n` +
    `    "totalCarbs": number (grams carbs total),\n` +
    `    "totalFat": number (grams fat total),\n` +
    `    "portionLabel": string optional (e.g. "מנה אחת", "ארוחת ערב"),\n` +
    `    "estimatedGrams": number optional (total grams of food if you can estimate)\n` +
    `  } | null,\n` +
    `  "actions": []\n` +
    `}\n` +
    `- mealSummary MUST be null while asking a question / when missing details.\n` +
    `- The app shows ONE summary card and logs ONE journal line: "ארוחת AI: " + shortTitle.\n`;

  const contextPrompt =
    `snapshot:\n${JSON.stringify(snapshot).slice(0, 14000)}\n\n` +
    `memory:\n${JSON.stringify(memory).slice(0, 6000)}\n`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
        temperature: 0.55,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextPrompt },
          ...history.map((t) => ({
            role: t.role,
            content: String(t.text ?? "").slice(0, 2000),
          })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[ai-assistant] OpenAI error", res.status, txt.slice(0, 400));
      return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJson<AssistantResponse>(content);
    if (!parsed || typeof parsed.reply !== "string") {
      return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
    }
    const legacyCards = sanitizeNutritionCards(parsed.nutritionCards);
    const mealSummary = resolveMealSummary(parsed, legacyCards);
    const actions = (parsed.actions ?? []).filter((a) => a && a.type !== "search_verified_foods");
    return NextResponse.json({
      result: {
        reply: parsed.reply,
        actions,
        mealSummary,
      },
    });
  } catch (e) {
    console.error("[ai-assistant] Unhandled error", e);
    return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
  }
}
