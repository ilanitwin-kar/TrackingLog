import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildFoodDbPicklistForAi } from "@/lib/aiAssistantFoodDbContext";
import { aiAssistantMenuSystemPrompt } from "@/lib/aiAssistantMenuPrompt";
import { APP_KNOWLEDGE_HE } from "@/lib/appKnowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UNAVAILABLE_HE = "שירות העוזר זמנית לא זמין";
const GEMINI_UNAVAILABLE_HE = "שירות Gemini זמנית לא זמין";

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

type MenuDraftJson = {
  title: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  meals: Array<{
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    items: Array<{
      name: string;
      portionLabel: string;
      estimatedGrams?: number | null;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      /** מוצר מהמאגר שהוצע כי חסר במזווה — להצגה עם ✨ */
      isSuggested?: boolean;
      /** למשל רכיבי סלט מאוחד: «מכיל עגבנייה, מלפפון ובצל» */
      description?: string;
    }>;
  }>;
};

type AssistantResponse = {
  reply: string;
  actions?: AssistantAction[];
  /** @deprecated — רק גיבוי; העדף mealSummary */
  nutritionCards?: NutritionCardJson[];
  /** סיכום מאוחד יחיד לארוחה */
  mealSummary?: MealSummaryJson | null;
  /** טיוטת תפריט שמורה (למסך “התפריטים שלי”) */
  menuDraft?: MenuDraftJson | null;
};

type ChatTurn = { role: "user" | "assistant"; text: string };

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Strip fences and parse; extract first JSON object if full parse fails. */
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

function sanitizeMenuDraft(raw: unknown): MenuDraftJson | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? "").trim().slice(0, 120);
  const mealsRaw = o.meals;
  if (!title || !Array.isArray(mealsRaw) || mealsRaw.length < 1) return null;

  const meals: MenuDraftJson["meals"] = [];
  for (const m of mealsRaw.slice(0, 10)) {
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    const name = String(mm.name ?? "").trim().slice(0, 80);
    const itemsRaw = mm.items;
    if (!name || !Array.isArray(itemsRaw) || itemsRaw.length < 1) continue;
    const items: MenuDraftJson["meals"][number]["items"] = [];
    for (const it of itemsRaw.slice(0, 16)) {
      if (!it || typeof it !== "object") continue;
      const ii = it as Record<string, unknown>;
      const iname = String(ii.name ?? "").trim().slice(0, 120);
      const portionLabel = String(ii.portionLabel ?? "").trim().slice(0, 80);
      if (!iname || !portionLabel) continue;
      let g: number | null = null;
      if (typeof ii.estimatedGrams === "number" && Number.isFinite(ii.estimatedGrams)) {
        g = clamp(Math.round(ii.estimatedGrams), 1, 2000);
      }
      const descRaw = ii.description;
      const description =
        typeof descRaw === "string" && descRaw.trim().length > 0
          ? descRaw.trim().slice(0, 400)
          : undefined;
      const item: (typeof items)[number] = {
        name: iname,
        portionLabel,
        estimatedGrams: g,
        calories: clamp(Math.round(Number(ii.calories) || 0), 0, 4000),
        protein: clamp(Number(ii.protein) || 0, 0, 300),
        carbs: clamp(Number(ii.carbs) || 0, 0, 300),
        fat: clamp(Number(ii.fat) || 0, 0, 300),
      };
      if (description) item.description = description;
      if (ii.isSuggested === true) item.isSuggested = true;
      items.push(item);
    }
    if (items.length < 1) continue;
    meals.push({
      name,
      calories: clamp(Math.round(Number(mm.calories) || 0), 0, 12000),
      protein: clamp(Number(mm.protein) || 0, 0, 800),
      carbs: clamp(Number(mm.carbs) || 0, 0, 800),
      fat: clamp(Number(mm.fat) || 0, 0, 800),
      items,
    });
  }
  if (meals.length < 1) return null;

  return {
    title,
    totalCalories: clamp(Math.round(Number(o.totalCalories) || 0), 0, 25000),
    totalProtein: clamp(Number(o.totalProtein) || 0, 0, 1200),
    totalCarbs: clamp(Number(o.totalCarbs) || 0, 0, 1200),
    totalFat: clamp(Number(o.totalFat) || 0, 0, 1200),
    meals,
  };
}

export async function POST(req: Request) {
  let body: {
    provider?: "openai" | "gemini";
    message?: string;
    history?: ChatTurn[];
    snapshot?: unknown;
    memory?: unknown;
  };
  try {
    body = (await req.json()) as {
      provider?: "openai" | "gemini";
      message?: string;
      history?: ChatTurn[];
      snapshot?: unknown;
      memory?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = body.provider === "gemini" ? "gemini" : "openai";

  const message = String(body.message ?? "").trim();
  if (message.length < 1) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const snapshot = body.snapshot ?? {};
  const memory = body.memory ?? {};
  const history = Array.isArray(body.history) ? body.history.slice(-16) : [];

  const systemPrompt = aiAssistantMenuSystemPrompt(APP_KNOWLEDGE_HE);

  const snapRec =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? (snapshot as Record<string, unknown>)
      : {};
  const calorieTargetN = Number(snapRec.calorieTarget);
  const calorieLine =
    Number.isFinite(calorieTargetN) && calorieTargetN > 0
      ? `יעד קלורי יומי מה-snapshot (להתקרב אליו, ±10% לפי ההנחיות במערכת): בערך ${Math.round(calorieTargetN)} קל׳.\n`
      : `התאימי את סך הקלוריות ל-snapshot.calorieTarget של המשתמש (לא מספר קבוע גלובלי).\n`;
  const selectiveUsageHint =
    `[בחירה מושכלת] snapshot.dictionary הוא מאגר מותר בלבד — אין חובה להשתמש בכל פריט. אם יש עומס חלבונים/מוצרים, בחרי תת־קבוצה קולינרית שנכנסת במסגרת הקלוריות; פריטים שלא בתפריט נשארים במזווה.\n` +
    calorieLine;

  const foodDbPicklist = buildFoodDbPicklistForAi(10500);
  const contextPrompt =
    `snapshot:\n${JSON.stringify(snapshot).slice(0, 13000)}\n\n` +
    selectiveUsageHint +
    `\n` +
    `memory:\n${JSON.stringify(memory).slice(0, 6000)}\n\n` +
    `foodDbPicklist (מאגר CSV — רק לבחירת עד 2 פריטים מוצעים עם isSuggested; שם מדויק מהשורה):\n${foodDbPicklist.slice(0, 10500)}\n`;
  try {
    let parsed: AssistantResponse | null = null;
    if (provider === "gemini") {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? "";
      if (!apiKey) {
        return NextResponse.json({ error: GEMINI_UNAVAILABLE_HE }, { status: 503 });
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_ASSISTANT_MODEL?.trim() || "gemini-1.5-pro",
        generationConfig: {
          temperature: 0.48,
          responseMimeType: "application/json",
        },
      });
      const historyBlock =
        history.length > 0
          ? `history:\n${history
              .map((t) => `${t.role.toUpperCase()}: ${String(t.text ?? "").slice(0, 1000)}`)
              .join("\n")}\n\n`
          : "";
      const prompt =
        `${systemPrompt}\n\n` +
        `${contextPrompt}\n\n` +
        `${historyBlock}` +
        `user:\n${message}\n`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const normalized = parseGeminiResponseText(text);
      parsed = normalized && typeof normalized === "object" ? (normalized as AssistantResponse) : null;
    } else {
      const openAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
      if (!openAiKey) {
        return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
      }
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
          temperature: 0.48,
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
      parsed = safeJson<AssistantResponse>(content);
    }

    if (!parsed || typeof parsed.reply !== "string") {
      return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
    }
    const legacyCards = sanitizeNutritionCards(parsed.nutritionCards);
    const mealSummary = resolveMealSummary(parsed, legacyCards);
    const menuDraft = sanitizeMenuDraft(parsed.menuDraft);
    const actions = (parsed.actions ?? []).filter((a) => a && a.type !== "search_verified_foods");
    return NextResponse.json({
      result: {
        reply: parsed.reply,
        actions,
        mealSummary,
        menuDraft,
      },
    });
  } catch (e) {
    console.error("[ai-assistant] Unhandled error", e);
    return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
  }
}
