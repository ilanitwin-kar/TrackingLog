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

type AssistantResponse = {
  reply: string;
  actions?: AssistantAction[];
};

type ChatTurn = { role: "user" | "assistant"; text: string };

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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
    body = (await req.json()) as { message?: string; history?: ChatTurn[]; snapshot?: unknown; memory?: unknown };
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
    `You are "Cherry/Blue" — a Hebrew in-app assistant and navigator.\n` +
    `You MUST be helpful, warm, non-judgmental, and concise.\n\n` +
    `Product knowledge (Hebrew):\n${APP_KNOWLEDGE_HE}\n\n` +
    `You receive:\n` +
    `- snapshot: current user data (today log, remaining macros/calories, favorites, time).\n` +
    `- memory: long-term preferences (likes/dislikes, typical meals, tone).\n\n` +
    `Capabilities (suggest via actions, do NOT pretend you clicked UI):\n` +
    `- open: navigate to a screen by href (e.g. /add-food, /add-food-ai, /dictionary, /shopping, /daily-summary).\n` +
    `- log_ai_meal: start AI free meal logging with text.\n` +
    `- suggest_foods: suggest foods based on macro focus.\n\n` +
    `- search_verified_foods: search the verified internal database used by the Explorer screen ("/explorer").\n\n` +
    `Rules:\n` +
    `- Answer in Hebrew.\n` +
    `- If snapshot shows caloriesOverGoal > 0 (daily calories consumed above dailyCalorieTarget), acknowledge warmly and without judgment. Mention the exact overage in kcal (e.g. "חרגנו ב-412 קק״ל"). Suggest a lighter next step — e.g. lighter breakfast from dictionary (/dictionary) or browsing Explorer — and remind tomorrow is a fresh start.\n` +
    `- If user says "אני רעב/ה", use snapshot remaining + time-of-day to propose 2-4 options.\n` +
    `- Prefer foods from favorites if present.\n` +
    `- If you need verified items from the internal database, return an action of type "search_verified_foods" instead of guessing.\n` +
    `- If info is missing, ask ONE short clarifying question.\n` +
    `- Output ONLY JSON with shape: { "reply": string, "actions": [] }.\n`;

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
        temperature: 0.4,
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
    return NextResponse.json({ result: parsed });
  } catch (e) {
    console.error("[ai-assistant] Unhandled error", e);
    return NextResponse.json({ error: UNAVAILABLE_HE }, { status: 503 });
  }
}

