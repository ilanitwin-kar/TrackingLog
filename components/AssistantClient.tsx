"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { emitMealLoggedFeedback } from "@/lib/feedbackEvents";
import {
  getAnonUid,
  loadAssistantMemory,
  saveAssistantMemory,
  type AssistantMemory,
} from "@/lib/cloudMemory";
import { getLastNDateKeysIncludingToday, getTodayKey } from "@/lib/dateKey";
import { addToShopping } from "@/lib/explorerStorage";
import { loadExerciseActivityDaySync } from "@/lib/exerciseActivity";
import { kcalBurnedFromStepsMet35 } from "@/lib/burnOffset";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";
import {
  getEntriesForDate,
  loadDictionary,
  loadProfile,
  loadWeights,
  saveDayLogEntries,
  upsertExplorerFoodInDictionary,
  type LogEntry,
} from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import { dailyCalorieTarget } from "@/lib/tdee";
import { addSavedMenu } from "@/lib/menuStorage";

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

type AssistantMealSummary = {
  shortTitle: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  portionLabel?: string;
  estimatedGrams?: number | null;
};

type AssistantResult = {
  reply: string;
  actions?: AssistantAction[];
  mealSummary?: AssistantMealSummary | null;
  menuDraft?: {
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
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        isSuggested?: boolean;
        description?: string;
      }>;
    }>;
  } | null;
};

const JOURNAL_AI_PREFIX = "ארוחת AI:";

/** כרטיס מהעוזרת — סיכום ארוחה מאוחד או (תאימות לאחור) ערכי 100 גרם */
type FoodSuggestionCard = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: string;
  isPortionTotals?: boolean;
  portionLabel?: string;
  estimatedGrams?: number | null;
  /** שורה אחת ביומן — "ארוחת AI: …" */
  journalFoodLabel?: string;
  isAggregatedMeal?: boolean;
};

function normalizeMealSummaryToCard(
  meal: AssistantMealSummary | null | undefined,
  stamp: string
): FoodSuggestionCard[] {
  if (!meal || typeof meal.shortTitle !== "string") return [];
  const shortTitle = meal.shortTitle.trim();
  if (shortTitle.length < 1) return [];
  const journalFoodLabel = `${JOURNAL_AI_PREFIX} ${shortTitle}`.slice(0, 140);
  return [
    {
      id: `ai:meal:${stamp}`,
      name: shortTitle,
      journalFoodLabel,
      isAggregatedMeal: true,
      calories: Math.max(1, Math.round(meal.totalCalories)),
      protein: Math.max(0, Number(meal.totalProtein) || 0),
      carbs: Math.max(0, Number(meal.totalCarbs) || 0),
      fat: Math.max(0, Number(meal.totalFat) || 0),
      category: "ארוחת AI",
      isPortionTotals: true,
      portionLabel: meal.portionLabel?.trim() || undefined,
      estimatedGrams:
        meal.estimatedGrams != null &&
        Number.isFinite(meal.estimatedGrams) &&
        meal.estimatedGrams > 0
          ? Math.min(8000, Math.round(meal.estimatedGrams))
          : null,
    },
  ];
}

type Msg = {
  role: "user" | "assistant";
  text: string;
  verifiedSuggestions?: FoodSuggestionCard[];
  menuDraft?: AssistantResult["menuDraft"];
};

function newLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** מנה של 100 גרם (כרטיס ישן / מאגר) */
function logEntryFromPer100gCard(item: FoodSuggestionCard): LogEntry {
  const kcal = Math.round(item.calories);
  const proteinG = Math.round(item.protein * 10) / 10;
  const carbsG = Math.round(item.carbs * 10) / 10;
  const fatG = Math.round(item.fat * 10) / 10;
  return {
    id: newLogId(),
    food: item.name.trim(),
    calories: Math.max(1, kcal),
    quantity: 100,
    unit: "גרם",
    createdAt: new Date().toISOString(),
    verified: item.category !== "אומדן עוזרת",
    proteinG,
    carbsG,
    fatG,
  };
}

function logEntryFromAssistantPortion(item: FoodSuggestionCard): LogEntry {
  const journalLine = item.journalFoodLabel?.trim();
  const label = item.portionLabel?.trim();
  const foodFromParts =
    label && !item.name.includes(label) ? `${item.name.trim()} (${label})` : item.name.trim();
  const food = journalLine || foodFromParts;
  const g =
    item.estimatedGrams != null && item.estimatedGrams > 0
      ? Math.round(item.estimatedGrams)
      : null;
  const proteinG = Math.round(item.protein * 10) / 10;
  const carbsG = Math.round(item.carbs * 10) / 10;
  const fatG = Math.round(item.fat * 10) / 10;
  return {
    id: newLogId(),
    food,
    calories: Math.max(1, Math.round(item.calories)),
    quantity: item.isAggregatedMeal ? 1 : g ?? 1,
    unit: item.isAggregatedMeal ? "יחידה" : g ? "גרם" : "יחידה",
    createdAt: new Date().toISOString(),
    verified: false,
    aiMeal: true,
    proteinG,
    carbsG,
    fatG,
  };
}

function logEntryFromFoodCard(item: FoodSuggestionCard): LogEntry {
  if (item.isPortionTotals) return logEntryFromAssistantPortion(item);
  return logEntryFromPer100gCard(item);
}

function MenuDraftCard({
  draft,
  gender,
  onSave,
}: {
  draft: NonNullable<AssistantResult["menuDraft"]>;
  gender: ReturnType<typeof loadProfile>["gender"];
  onSave: () => void;
}) {
  return (
    <details className="mt-3 group rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-br from-white/95 to-[var(--cherry-muted)]/40 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1 text-start">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--cherry)]/90">
            תפריט יומי מוצע
          </p>
          <p className="mt-0.5 break-words text-sm font-extrabold leading-snug text-[var(--stem)]">
            {draft.title}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--stem)]/55">
            {Math.round(draft.totalCalories)} קק״ל · חלבון {draft.totalProtein.toFixed(0)} · פחמ׳{" "}
            {draft.totalCarbs.toFixed(0)} · שומן {draft.totalFat.toFixed(0)}
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold text-[var(--stem)]/50 group-open:hidden">
          פרטים ▼
        </span>
        <span className="hidden shrink-0 text-xs font-bold text-[var(--stem)]/50 group-open:inline">
          ▲
        </span>
      </summary>
      <div className="border-t border-[var(--border-cherry-soft)]/60 px-3 pb-3 pt-2">
        <div className="space-y-3">
          {draft.meals.map((m, idx) => (
            <div key={`menu-meal-${idx}`} className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/85 p-3">
              <p className="text-sm font-extrabold text-[var(--stem)]">{m.name}</p>
              <p className="mt-1 text-xs text-[var(--stem)]/70">
                {Math.round(m.calories)} קק״ל · ח {m.protein.toFixed(0)} · פח {m.carbs.toFixed(0)} · ש {m.fat.toFixed(0)}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--stem)]/90">
                {m.items.map((it, j) => (
                  <li key={`menu-meal-${idx}-it-${j}`}>
                    <span className="font-semibold">
                      {it.isSuggested ? `✨ ${it.name}` : it.name}
                    </span>{" "}
                    <span className="text-xs font-semibold text-[var(--stem)]/65">
                      ({it.portionLabel})
                    </span>
                    {it.description ? (
                      <span className="mt-0.5 block text-xs text-[var(--stem)]/70">
                        {it.description}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 w-full rounded-xl bg-[var(--cherry)] px-3 py-3 text-sm font-extrabold text-white shadow-sm transition hover:brightness-105 active:scale-[0.99]"
          onClick={onSave}
        >
          {gf(gender, "הוסף לתפריטים שלי", "הוסף לתפריטים שלי")}
        </button>
      </div>
    </details>
  );
}

function normalizeStoredMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => {
    const o = m as Record<string, unknown>;
    const role = o.role === "user" || o.role === "assistant" ? o.role : "assistant";
    const text = typeof o.text === "string" ? o.text : "";
    const vs = o.verifiedSuggestions;
    if (
      role === "assistant" &&
      Array.isArray(vs) &&
      vs.every(
        (x) =>
          x &&
          typeof x === "object" &&
          typeof (x as FoodSuggestionCard).id === "string" &&
          typeof (x as FoodSuggestionCard).name === "string"
      )
    ) {
      return { role: "assistant", text, verifiedSuggestions: vs as FoodSuggestionCard[] };
    }
    return { role, text };
  });
}

function uniqStrings(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = x.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, 60);
}

function VerifiedSuggestionsCards({
  items,
  gender,
  onJournal,
  onDictionary,
  onShopping,
}: {
  items: FoodSuggestionCard[];
  gender: ReturnType<typeof loadProfile>["gender"];
  onJournal: (item: FoodSuggestionCard) => void;
  onDictionary: (item: FoodSuggestionCard) => void;
  onShopping: (item: FoodSuggestionCard) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      {items.map((it) => (
        <details
          key={it.id}
          className="group rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-br from-white/95 to-[var(--cherry-muted)]/40 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1 text-start">
              {it.isAggregatedMeal ? (
                <>
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--cherry)]/90">
                    סיכום ארוחה
                  </p>
                  <p className="text-sm font-extrabold leading-snug text-[var(--stem)]">{it.name}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-[var(--stem)]/55">
                    {[
                      it.portionLabel,
                      it.estimatedGrams ? `~${it.estimatedGrams} ג׳ (אומדן)` : null,
                      `${Math.round(it.calories)} קק״ל סה״כ`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-extrabold leading-snug text-[var(--stem)]">{it.name}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-[var(--stem)]/55">
                    {it.isPortionTotals
                      ? [
                          it.portionLabel,
                          it.estimatedGrams ? `~${it.estimatedGrams} ג׳` : null,
                          `${Math.round(it.calories)} קק״ל למנה`,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : `${it.category} · ל־100 גרם · ${Math.round(it.calories)} קק״ל`}
                  </p>
                </>
              )}
            </div>
            <span className="shrink-0 text-xs font-bold text-[var(--stem)]/50 group-open:hidden">
              פרטים ▼
            </span>
            <span className="hidden shrink-0 text-xs font-bold text-[var(--stem)]/50 group-open:inline">
              ▲
            </span>
          </summary>
          <div className="border-t border-[var(--border-cherry-soft)]/60 px-3 pb-3 pt-2">
            <div className="mb-2 flex justify-end">
              <span
                className="rounded-full border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[var(--cherry)]"
                title={
                  it.isAggregatedMeal
                    ? "סיכום ארוחה אחד — נשמר כשורה אחת ביומן"
                    : it.isPortionTotals
                      ? "אומדן מהעוזרת — לא נשמר אוטומטית בלי לחיצה"
                      : "ערכים לפי מאגר אינטליגנציה קלורית / מילון"
                }
              >
                {it.isAggregatedMeal
                  ? "סיכום"
                  : it.isPortionTotals
                    ? "אומדן"
                    : it.category === "מילון אישי"
                      ? "מילון"
                      : "מאומת"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
                <p className="text-[10px] font-semibold text-[var(--stem)]/60">
                  {it.isAggregatedMeal ? "קק״ל (סה״כ)" : "קק״ל"}
                </p>
                <p className="text-lg font-extrabold tabular-nums text-[var(--cherry)]">
                  {Math.round(it.calories)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
                <p className="text-[10px] font-semibold text-[var(--stem)]/60">
                  {it.isAggregatedMeal
                    ? "חלבון (סה״כ)"
                    : it.isPortionTotals
                      ? "חלבון (מנה)"
                      : "חלבון"}
                </p>
                <p className="text-base font-extrabold tabular-nums text-[var(--stem)]">{it.protein}ג׳</p>
              </div>
              <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
                <p className="text-[10px] font-semibold text-[var(--stem)]/60">
                  {it.isAggregatedMeal
                    ? "פחמימות (סה״כ)"
                    : it.isPortionTotals
                      ? "פחמימות (מנה)"
                      : "פחמימות"}
                </p>
                <p className="text-base font-extrabold tabular-nums text-[var(--stem)]">{it.carbs}ג׳</p>
              </div>
              <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
                <p className="text-[10px] font-semibold text-[var(--stem)]/60">
                  {it.isAggregatedMeal
                    ? "שומן (סה״כ)"
                    : it.isPortionTotals
                      ? "שומן (מנה)"
                      : "שומן"}
                </p>
                <p className="text-base font-extrabold tabular-nums text-[var(--stem)]">{it.fat}ג׳</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-[var(--cherry)] px-2 py-2.5 text-center text-[11px] font-extrabold text-white shadow-sm transition hover:brightness-105 active:scale-[0.99]"
                  onClick={() => onJournal(it)}
                >
                  {gf(gender, "הוסיפי ליומן", "הוסף ליומן")}
                </button>
                <button
                  type="button"
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/95 px-2 py-2.5 text-center text-[11px] font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
                  onClick={() => onDictionary(it)}
                >
                  {gf(gender, "שמרי במילון", "שמור במילון")}
                </button>
              </div>
              <button
                type="button"
                className="w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2.5 text-center text-[11px] font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
                onClick={() => onShopping(it)}
              >
                {gf(gender, "הוסיפי לקניות", "הוסף לקניות")}
              </button>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function extractPreferencePatches(text: string): { likes?: string[]; dislikes?: string[] } {
  const t = text.trim();
  if (!t) return {};

  // Very lightweight heuristics (Hebrew): "אני אוהב/ת X", "אני לא אוהב/ת X", "אל תציע X"
  const likes: string[] = [];
  const dislikes: string[] = [];

  const likeMatch = t.match(/אני\s+אוהב(?:ת)?\s+(.+)/);
  if (likeMatch?.[1]) likes.push(likeMatch[1]);

  const dislikeMatch = t.match(/אני\s+לא\s+אוהב(?:ת)?\s+(.+)/);
  if (dislikeMatch?.[1]) dislikes.push(dislikeMatch[1]);

  const dontSuggest = t.match(/אל\s+תציע(?:י)?\s+(.+)/);
  if (dontSuggest?.[1]) dislikes.push(dontSuggest[1]);

  return {
    likes: likes.length ? likes : undefined,
    dislikes: dislikes.length ? dislikes : undefined,
  };
}

function extractNutritionDefaultsPatch(
  text: string
): Partial<NonNullable<AssistantMemory["nutritionDefaults"]>> {
  const t = text.trim();
  if (!t) return {};
  const out: Partial<NonNullable<AssistantMemory["nutritionDefaults"]>> = {};

  const pct = t.match(/(\d{1,2})\s*%/);
  const p = pct?.[1] ? Number(pct[1]) : null;
  const hasCheese = /(קוטג|גבינ|לבנה|צהובה)/.test(t);
  const hasYogurt = /(יוגורט)/.test(t);
  const hasBread = /(לחם|פיתה|טורטיה|לחמניה)/.test(t);

  if (hasCheese && p != null && Number.isFinite(p) && p >= 0 && p <= 60) {
    const label =
      t.includes("קוטג") || t.includes("קוטג׳") || t.includes("קוטג'")
        ? `קוטג׳ ${p}%`
        : t.includes("לבנה")
          ? `לבנה ${p}%`
          : `גבינה ${p}%`;
    out.cheese = label;
  }
  if (hasYogurt && p != null && Number.isFinite(p) && p >= 0 && p <= 20) {
    const flavored = /(בטעם|פירות|וניל|תות|בננה)/.test(t) ? "בטעם" : "טבעי";
    out.yogurt = `יוגורט ${flavored} ${p}%`;
  }
  if (hasBread) {
    if (/(מלא)/.test(t)) out.bread = "לחם מלא";
    else if (/(לבן)/.test(t)) out.bread = "לחם לבן";
    else if (/(כוסמין)/.test(t)) out.bread = "לחם כוסמין";
  }

  return out;
}

export function AssistantClient() {
  const profile = loadProfile();
  const gender = profile.gender;
  const [mem, setMem] = useState<AssistantMemory | null>(null);
  const [loadingMem, setLoadingMem] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<null | "ok" | "blocked">(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [showFullChat, setShowFullChat] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [exerciseRev, setExerciseRev] = useState(0);
  const lastMsgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bump = () => setExerciseRev((x) => x + 1);
    window.addEventListener("cj-exercise-activity-updated", bump);
    return () =>
      window.removeEventListener("cj-exercise-activity-updated", bump);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const u = await getAnonUid();
        if (!alive) return;
        setUid(u);
        const m = await loadAssistantMemory();
        if (!alive) return;
        setMem(m);
        setCloudStatus("ok");
      } finally {
        if (alive) setLoadingMem(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (toast == null) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    // Restore chat history locally (so it doesn't disappear on refresh).
    try {
      const raw = localStorage.getItem("cj_assistant_chat_v1");
      const parsed = raw ? JSON.parse(raw) : null;
      const normalized = normalizeStoredMessages(parsed);
      if (normalized.length > 0) {
        setMessages(normalized);
        return;
      }
    } catch {
      // ignore
    }
    setMessages([
      {
        role: "assistant",
        text: gf(
          gender,
          "היי! אני כאן עם סיכום ארוחה אחד (קלוריות ומאקרו), טיפים אישיים לפי המילון, וניווט. ספרי מה אכלת — הפירוט יכול להופיע בטקסט, ובכרטיס למטה סיכום אחד ליומן.",
          "אהלן! אני כאן עם סיכום ארוחה אחד (קלוריות ומאקרו), טיפים אישיים לפי המילון, וניווט. ספר מה אכלת — הפירוט יכול להופיע בטקסט, ובכרטיס למטה סיכום אחד ליומן."
        ),
      },
    ]);
  }, [gender]);

  useEffect(() => {
    if (messages.length < 1) return;
    try {
      localStorage.setItem("cj_assistant_chat_v1", JSON.stringify(messages.slice(-80)));
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    // Keep the newest message visible (avoid scrolling past it).
    // Using "nearest" prevents jumping further down than needed.
    window.requestAnimationFrame(() => {
      lastMsgRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [messages.length]);

  const visibleMessages = useMemo(() => {
    if (showFullChat) return messages;
    return messages.slice(-20);
  }, [messages, showFullChat]);

  function clearChat() {
    try {
      localStorage.removeItem("cj_assistant_chat_v1");
    } catch {
      // ignore
    }
    setShowFullChat(false);
    setMessages([
      {
        role: "assistant",
        text: gf(
          gender,
          "ניקיתי את השיחה. ספרי מה אכלת או מה תרצי לדעת — ואשאל שאלת דיוק אחת אם חסר פרט קריטי.",
          "ניקיתי את השיחה. ספר מה אכלת או מה תרצה לדעת — ואשאל שאלת דיוק אחת אם חסר פרט קריטי."
        ),
      },
    ]);
  }

  const snapshot = useMemo(() => {
    void exerciseRev;
    const today = getTodayKey();
    const entries = getEntriesForDate(today);
    const totals = entries.reduce(
      (acc, e) => {
        acc.calories += e.calories ?? 0;
        acc.protein += typeof e.proteinG === "number" ? e.proteinG : 0;
        acc.carbs += typeof e.carbsG === "number" ? e.carbsG : 0;
        acc.fat += typeof e.fatG === "number" ? e.fatG : 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    const dailyCalorieTargetKcal = dailyCalorieTarget(profile);
    const caloriesConsumed = totals.calories;
    const caloriesOverGoal =
      dailyCalorieTargetKcal > 0
        ? Math.max(0, Math.round(caloriesConsumed - dailyCalorieTargetKcal))
        : 0;
    const ex = loadExerciseActivityDaySync(today);
    const reportedSteps = ex?.reportedSteps ?? 0;
    const walkBurnKcal = kcalBurnedFromStepsMet35(
      reportedSteps,
      profile.weightKg
    );
    const caloriesOverGoalAfterWalk = Math.max(
      0,
      caloriesOverGoal - walkBurnKcal
    );
    const daysToGoal = getDaysRemainingToGoal();
    const weights = loadWeights();
    const weightByDate = new Map<string, number>();
    for (const w of weights) {
      if (w && typeof w.date === "string" && typeof w.kg === "number") {
        weightByDate.set(w.date, w.kg);
      }
    }
    const historyDays = getLastNDateKeysIncludingToday(21).map((k) => {
      const es = getEntriesForDate(k);
      const tt = es.reduce(
        (acc, e) => {
          acc.calories += e.calories ?? 0;
          acc.protein += typeof e.proteinG === "number" ? e.proteinG : 0;
          acc.carbs += typeof e.carbsG === "number" ? e.carbsG : 0;
          acc.fat += typeof e.fatG === "number" ? e.fatG : 0;
          return acc;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      const exDay = loadExerciseActivityDaySync(k);
      const steps = exDay?.reportedSteps ?? 0;
      const weightKg = weightByDate.get(k) ?? null;
      return {
        date: k,
        calories: Math.round(tt.calories),
        protein: Math.round(tt.protein * 10) / 10,
        carbs: Math.round(tt.carbs * 10) / 10,
        fat: Math.round(tt.fat * 10) / 10,
        steps,
        weightKg,
        entriesCount: es.length,
      };
    });
    return {
      now: new Date().toISOString(),
      profile: {
        firstName: profile.firstName ?? "",
        gender: profile.gender ?? "female",
        currentWeightKg: profile.weightKg,
        goalWeightKg: profile.goalWeightKg,
      },
      today,
      totals,
      dailyCalorieTarget: dailyCalorieTargetKcal,
      caloriesConsumed,
      caloriesOverGoal,
      withinCalorieGoal: caloriesOverGoal <= 0,
      daysToGoal,
      exerciseActivity: {
        reportedSteps,
        kcalBurnedFromWalk: walkBurnKcal,
        caloriesOverGoalAfterWalk,
        fullyOffsetByWalk:
          caloriesOverGoal > 0 && caloriesOverGoalAfterWalk <= 0,
      },
      entriesCount: entries.length,
      historyDays,
      dictionary: loadDictionary().slice(0, 280).map((d) => ({
        id: d.id,
        food: d.food,
        caloriesPer100g: d.caloriesPer100g,
        proteinPer100g: d.proteinPer100g,
        carbsPer100g: d.carbsPer100g,
        fatPer100g: d.fatPer100g,
      })),
    };
  }, [profile, exerciseRev]);

  function getLastMealCardForQuickAdd(): FoodSuggestionCard | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role !== "assistant") continue;
      const cards = m.verifiedSuggestions ?? [];
      if (cards.length < 1) continue;
      const first = cards[0]!;
      if (first.isAggregatedMeal) return first;
    }
    return null;
  }

  function isUserYes(text: string): boolean {
    const t = text.trim().toLowerCase();
    return (
      t === "כן" ||
      t === "כן." ||
      t === "כן!" ||
      t === "כן תודה" ||
      t === "כן, תודה" ||
      t === "יאללה" ||
      t === "סבבה" ||
      t === "אוקיי" ||
      t === "ok" ||
      t === "yes"
    );
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setActions([]);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    try {
      // UX: אם המשתמש עונה "כן" אחרי כרטיס סיכום ארוחה — נוסיף אוטומטית ליומן כשורה אחת.
      // (עדיין לא "מנחשים": זה רק אישור לפעולת הוספה.)
      const lastCard = getLastMealCardForQuickAdd();
      if (lastCard && isUserYes(text)) {
        onCardJournal(lastCard);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: gf(
              gender,
              `בוצע — ${lastCard.journalFoodLabel ?? "נוסף ליומן היום."}`,
              `בוצע — ${lastCard.journalFoodLabel ?? "נוסף ליומן היום."}`
            ),
          },
        ]);
        return;
      }

      const history = [...messages, { role: "user" as const, text }].slice(-16);

      // Save preference facts to cloud (diet likes/dislikes) when user states them.
      const pref = extractPreferencePatches(text);
      if (pref.likes || pref.dislikes) {
        try {
          const current = mem ?? (await loadAssistantMemory()) ?? {};
          const next: AssistantMemory = {
            ...current,
            likes: uniqStrings([...(current.likes ?? []), ...(pref.likes ?? [])]),
            dislikes: uniqStrings([
              ...(current.dislikes ?? []),
              ...(pref.dislikes ?? []),
            ]),
          };
          await saveAssistantMemory({ likes: next.likes, dislikes: next.dislikes });
          setMem((prev) => ({ ...(prev ?? {}), likes: next.likes, dislikes: next.dislikes }));
          setCloudStatus("ok");
          setCloudMsg("נשמר בזיכרון הענן.");
          window.setTimeout(() => setCloudMsg(null), 1600);
        } catch {
          setCloudStatus("blocked");
          setCloudMsg("לא הצלחתי לשמור בענן (בדקי Rules/Anonymous).");
          window.setTimeout(() => setCloudMsg(null), 2400);
        }
      }

      // Save nutrition defaults for future precision (so we can confirm instead of re-asking).
      const defaultsPatch = extractNutritionDefaultsPatch(text);
      if (Object.keys(defaultsPatch).length > 0) {
        try {
          const current = mem ?? (await loadAssistantMemory()) ?? {};
          const nextDefaults = { ...(current.nutritionDefaults ?? {}), ...defaultsPatch };
          await saveAssistantMemory({ nutritionDefaults: nextDefaults });
          setMem((prev) => ({ ...(prev ?? {}), nutritionDefaults: nextDefaults }));
        } catch {
          // ignore
        }
      }

      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          snapshot,
          memory: mem ?? {},
        }),
      });
      const data = (await res.json()) as { result?: AssistantResult; error?: string };
      if (!res.ok || !data.result) {
        setError(data.error ?? "שירות העוזר זמנית לא זמין");
        return;
      }
      const result = data.result;
      const nextActions = (data.result.actions ?? []).filter(
        (a) => a.type !== "search_verified_foods"
      );
      const cards = normalizeMealSummaryToCard(
        result.mealSummary,
        `${Date.now()}`
      );

      setActions(nextActions);

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: result.reply,
          ...(cards.length > 0 ? { verifiedSuggestions: cards } : {}),
          ...(result.menuDraft ? { menuDraft: result.menuDraft } : {}),
        },
      ]);
      // Save lightweight memory hint: last topic.
      try {
        await saveAssistantMemory({ notes: `last: ${text.slice(0, 120)}` });
        setMem((prev) => ({ ...(prev ?? {}), notes: `last: ${text.slice(0, 120)}` }));
        setCloudStatus("ok");
      } catch {
        // If cloud rules block writes, we still keep local chat history.
        setCloudStatus("blocked");
      }
    } catch {
      setError("שירות העוזר זמנית לא זמין");
    } finally {
      setBusy(false);
    }
  }

  function per100FromPortion(item: FoodSuggestionCard): {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    displayName: string;
  } {
    if (item.journalFoodLabel?.trim()) {
      const base = item.journalFoodLabel.trim();
      const g = item.estimatedGrams;
      if (item.isPortionTotals && g != null && g > 0) {
        const f = 100 / g;
        return {
          calories: Math.max(1, Math.round(item.calories * f)),
          protein: Math.round(item.protein * f * 10) / 10,
          carbs: Math.round(item.carbs * f * 10) / 10,
          fat: Math.round(item.fat * f * 10) / 10,
          displayName: base,
        };
      }
      return {
        calories: Math.max(1, Math.round(item.calories)),
        protein: Math.round(item.protein * 10) / 10,
        carbs: Math.round(item.carbs * 10) / 10,
        fat: Math.round(item.fat * 10) / 10,
        displayName: base,
      };
    }
    const label = item.portionLabel?.trim();
    const displayName =
      label && !item.name.includes(label) ? `${item.name.trim()} (${label})` : item.name.trim();
    const g = item.estimatedGrams;
    if (item.isPortionTotals && g != null && g > 0) {
      const f = 100 / g;
      return {
        calories: Math.max(1, Math.round(item.calories * f)),
        protein: Math.round(item.protein * f * 10) / 10,
        carbs: Math.round(item.carbs * f * 10) / 10,
        fat: Math.round(item.fat * f * 10) / 10,
        displayName,
      };
    }
    return {
      calories: Math.max(1, Math.round(item.calories)),
      protein: Math.round(item.protein * 10) / 10,
      carbs: Math.round(item.carbs * 10) / 10,
      fat: Math.round(item.fat * 10) / 10,
      displayName,
    };
  }

  function onCardJournal(item: FoodSuggestionCard) {
    const dateKey = getTodayKey();
    const entry = logEntryFromFoodCard(item);
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    emitMealLoggedFeedback(
      gf(
        gender,
        item.isAggregatedMeal
          ? "נוספה ארוחה אחת ליומן (סיכום). הגרפים בבית מתעדכנים מיד."
          : item.isPortionTotals
            ? "נוסף ליומן היום לפי אומדן המנה. הגרפים בבית מתעדכנים מיד."
            : "נוסף ליומן היום (100 גרם). הגרפים בבית מתעדכנים מיד.",
        item.isAggregatedMeal
          ? "נוספה ארוחה אחת ליומן (סיכום). הגרפים בבית מתעדכנים מיד."
          : item.isPortionTotals
            ? "נוסף ליומן היום לפי אומדן המנה. הגרפים בבית מתעדכנים מיד."
            : "נוסף ליומן היום (100 גרם). הגרפים בבית מתעדכנים מיד."
      )
    );
  }

  function onCardDictionary(item: FoodSuggestionCard) {
    const p = per100FromPortion(item);
    upsertExplorerFoodInDictionary({
      id: item.id,
      name: p.displayName,
      calories: p.calories,
      protein: p.protein,
      fat: p.fat,
      carbs: p.carbs,
    });
    setToast(gf(gender, "נשמר במילון האישי.", "נשמר במילון האישי."));
  }

  function onCardShopping(item: FoodSuggestionCard) {
    const p = per100FromPortion(item);
    const added = addToShopping({
      foodId: item.id,
      name: p.displayName,
      category: item.category,
      calories: p.calories,
    });
    setToast(
      added
        ? gf(gender, "נוסף לרשימת הקניות.", "נוסף לרשימת הקניות.")
        : gf(gender, "כבר קיים ברשימת הקניות.", "כבר קיים ברשימת הקניות.")
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#fff8fa] via-white to-[#f6faf3] px-4 pb-10 pt-2" dir="rtl">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--stem)]/70">
            {loadingMem
              ? "מחבר זיכרון ענן…"
              : cloudStatus === "blocked"
                ? "זיכרון ענן: נחסם"
                : "זיכרון ענן מחובר."}
          </p>
          {uid && (
            <p className="mt-1 text-[11px] text-[var(--stem)]/60" dir="ltr">
              uid: {uid}
            </p>
          )}
          <p className="mt-1 text-[11px] text-[var(--stem)]/65">
            היום: {snapshot.today} · נרשמו {snapshot.entriesCount} פריטים
          </p>
          <p className="mt-1 text-[11px] text-[var(--stem)]/65">
            העדפות בענן: אהובים {mem?.likes?.length ?? 0} · לא־אהובים {mem?.dislikes?.length ?? 0}
          </p>
          {cloudMsg && (
            <p className="mt-2 text-[11px] font-semibold text-[var(--cherry)]">{cloudMsg}</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-[var(--border-cherry-soft)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--stem)]/70">
          <span>
            {showFullChat
              ? `מציגים את כל השיחה (${messages.length})`
              : `מציגים 20 אחרונות (${Math.min(20, messages.length)}/${messages.length})`}
          </span>
          <div className="flex items-center gap-2">
            {messages.length > 20 && (
              <button
                type="button"
                className="rounded-full border border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                onClick={() => setShowFullChat((x) => !x)}
              >
                {showFullChat ? "הצג פחות" : "הצג עוד"}
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-red-300/70 bg-white px-3 py-1.5 text-xs font-extrabold text-red-800 shadow-sm transition hover:bg-red-50"
              onClick={clearChat}
            >
              נקה שיחה
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {visibleMessages.map((m, i) => (
            <div
              key={`${m.role}-${i}-${m.text.slice(0, 24)}`}
              className={`rounded-2xl border px-3 py-2 text-sm shadow-sm ${
                m.role === "assistant"
                  ? "border-[var(--border-cherry-soft)] bg-white"
                  : "border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.role === "assistant" &&
                m.verifiedSuggestions &&
                m.verifiedSuggestions.length > 0 && (
                  <VerifiedSuggestionsCards
                    items={m.verifiedSuggestions}
                    gender={gender}
                    onJournal={onCardJournal}
                    onDictionary={onCardDictionary}
                    onShopping={onCardShopping}
                  />
                )}
              {m.role === "assistant" && m.menuDraft ? (
                <MenuDraftCard
                  draft={m.menuDraft}
                  gender={gender}
                  onSave={() => {
                    const d = m.menuDraft!;
                    addSavedMenu({
                      title: d.title,
                      meals: d.meals.map((x) => ({
                        name: x.name,
                        calories: x.calories,
                        protein: x.protein,
                        carbs: x.carbs,
                        fat: x.fat,
                        items: x.items.map((it) => ({ ...it })),
                      })),
                      totalCalories: d.totalCalories,
                      totalProtein: d.totalProtein,
                      totalCarbs: d.totalCarbs,
                      totalFat: d.totalFat,
                    });
                    setToast(gf(gender, "נוסף לתפריטים שלך.", "נוסף לתפריטים שלך."));
                    window.location.assign("/menus");
                  }}
                />
              ) : null}
            </div>
          ))}
          <div ref={lastMsgRef} />
        </div>

        {actions.length > 0 && (
          <div className="mt-3 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 p-3 shadow-sm">
            <p className="text-xs font-extrabold text-[var(--cherry)]">פעולות מוצעות</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="rounded-full border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-bold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
                  onClick={() => {
                    const dk = encodeURIComponent(getTodayKey());
                    if (a.type === "open") {
                      window.location.assign(a.payload.href);
                    } else if (a.type === "log_ai_meal") {
                      const t = encodeURIComponent(
                        (a as Extract<AssistantAction, { type: "log_ai_meal" }>).payload
                          ?.text ?? ""
                      );
                      window.location.assign(
                        `/add-food-ai?date=${dk}${t ? `&text=${t}` : ""}`
                      );
                    } else {
                      window.location.assign(`/add-food?date=${dk}`);
                    }
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-[#a94444]">{error}</p>}

        {toast && (
          <div
            className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[400] mx-auto max-w-lg rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-[var(--stem)] px-4 py-3 text-center text-sm font-bold text-white shadow-2xl"
            role="status"
          >
            {toast}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="input-luxury-search flex-1"
            placeholder={gf(gender, "כתבי לי משהו…", "כתוב לי משהו…")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <button
            type="button"
            className="btn-stem rounded-xl px-4 py-3 text-sm font-extrabold disabled:opacity-50"
            disabled={busy || input.trim().length < 1}
            onClick={() => void send()}
          >
            {busy ? "…" : "שלח"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-center text-xs font-semibold text-[var(--cherry)]">
          <Link href="/explorer" className="underline-offset-2 hover:underline">
            {gf(gender, "מעבר למגלה המזונות", "מעבר למגלה המזונות")}
          </Link>
          <Link href="/dictionary" className="underline-offset-2 hover:underline">
            {gf(gender, "מעבר למילון שלי", "מעבר למילון שלי")}
          </Link>
        </div>
      </div>
    </div>
  );
}

