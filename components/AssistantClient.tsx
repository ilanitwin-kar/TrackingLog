"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { emitMealLoggedFeedback } from "@/lib/feedbackEvents";
import {
  getAnonUid,
  loadAssistantMemory,
  saveAssistantMemory,
  type AssistantMemory,
} from "@/lib/cloudMemory";
import { getTodayKey } from "@/lib/dateKey";
import { addToShopping } from "@/lib/explorerStorage";
import { loadExerciseActivityDaySync } from "@/lib/exerciseActivity";
import { kcalBurnedFromStepsMet35 } from "@/lib/burnOffset";
import {
  getEntriesForDate,
  loadDictionary,
  loadProfile,
  saveDayLogEntries,
  upsertExplorerFoodInDictionary,
  type LogEntry,
} from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import { dailyCalorieTarget } from "@/lib/tdee";

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

type AssistantResult = {
  reply: string;
  actions?: AssistantAction[];
};

type VerifiedFoodItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  category: string;
};

type Msg = {
  role: "user" | "assistant";
  text: string;
  verifiedSuggestions?: VerifiedFoodItem[];
};

function newLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** מנה של 100 גרם לפי ערכי המאגר (ל־100 ג׳) */
function logEntryFromVerifiedPer100g(item: VerifiedFoodItem): LogEntry {
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
    verified: true,
    proteinG,
    carbsG,
    fatG,
  };
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
          typeof (x as VerifiedFoodItem).id === "string" &&
          typeof (x as VerifiedFoodItem).name === "string"
      )
    ) {
      return { role: "assistant", text, verifiedSuggestions: vs as VerifiedFoodItem[] };
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
  items: VerifiedFoodItem[];
  gender: ReturnType<typeof loadProfile>["gender"];
  onJournal: (item: VerifiedFoodItem) => void;
  onDictionary: (item: VerifiedFoodItem) => void;
  onShopping: (item: VerifiedFoodItem) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      {items.map((it) => (
        <div
          key={it.id}
          className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-br from-white/95 to-[var(--cherry-muted)]/40 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold leading-snug text-[var(--stem)]">{it.name}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-[var(--stem)]/55">
                {it.category} · ל־100 גרם
              </p>
            </div>
            <span
              className="shrink-0 rounded-full border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[var(--cherry)]"
              title="מאגר מאומת"
            >
              מאומת
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
              <p className="text-[10px] font-semibold text-[var(--stem)]/60">קק״ל</p>
              <p className="text-lg font-extrabold tabular-nums text-[var(--cherry)]">
                {Math.round(it.calories)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
              <p className="text-[10px] font-semibold text-[var(--stem)]/60">חלבון</p>
              <p className="text-base font-extrabold tabular-nums text-[var(--stem)]">{it.protein}ג׳</p>
            </div>
            <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
              <p className="text-[10px] font-semibold text-[var(--stem)]/60">פחמימות</p>
              <p className="text-base font-extrabold tabular-nums text-[var(--stem)]">{it.carbs}ג׳</p>
            </div>
            <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-2 py-2 text-center">
              <p className="text-[10px] font-semibold text-[var(--stem)]/60">שומן</p>
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

export function AssistantClient() {
  const profile = loadProfile();
  const gender = profile.gender;
  const [mem, setMem] = useState<AssistantMemory | null>(null);
  const [loadingMem, setLoadingMem] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<null | "ok" | "blocked">(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [exerciseRev, setExerciseRev] = useState(0);

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
          "היי! אני כאן כדי לעזור לך לנווט באפליקציה ולהציע רעיונות לפי מה שנשאר לך היום. מה בא לך?",
          "אהלן! אני כאן כדי לעזור לך לנווט באפליקציה ולהציע רעיונות לפי מה שנשאר לך היום. מה בא לך?"
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
    const dailyCalorieTargetKcal = dailyCalorieTarget(
      profile.gender,
      profile.weightKg,
      profile.heightCm,
      profile.age,
      profile.deficit,
      profile.activity
    );
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
    return {
      now: new Date().toISOString(),
      profile: {
        firstName: profile.firstName ?? "",
        gender: profile.gender ?? "female",
      },
      today,
      totals,
      dailyCalorieTarget: dailyCalorieTargetKcal,
      caloriesConsumed,
      caloriesOverGoal,
      withinCalorieGoal: caloriesOverGoal <= 0,
      exerciseActivity: {
        reportedSteps,
        kcalBurnedFromWalk: walkBurnKcal,
        caloriesOverGoalAfterWalk,
        fullyOffsetByWalk:
          caloriesOverGoal > 0 && caloriesOverGoalAfterWalk <= 0,
      },
      entriesCount: entries.length,
      dictionary: loadDictionary().slice(0, 120).map((d) => ({
        id: d.id,
        food: d.food,
        caloriesPer100g: d.caloriesPer100g,
        proteinPer100g: d.proteinPer100g,
        carbsPer100g: d.carbsPer100g,
        fatPer100g: d.fatPer100g,
      })),
    };
  }, [
    profile.firstName,
    profile.gender,
    profile.weightKg,
    profile.heightCm,
    profile.age,
    profile.deficit,
    profile.activity,
    exerciseRev,
  ]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setActions([]);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    try {
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
      setMessages((m) => [...m, { role: "assistant", text: data.result!.reply }]);
      const nextActions = data.result.actions ?? [];
      setActions(nextActions);

      // Execute internal search action (verified DB) on the client.
      const search = nextActions.find((a) => a.type === "search_verified_foods") as
        | Extract<AssistantAction, { type: "search_verified_foods" }>
        | undefined;
      if (search) {
        try {
          const params = new URLSearchParams({
            q: (search.payload.q ?? "").trim(),
            sort: search.payload.sort ?? "caloriesAsc",
            category: search.payload.category ?? "הכל",
            page: "1",
            pageSize: "12",
          });
          const rr = await fetch(`/api/food-explorer?${params}`);
          if (!rr.ok) throw new Error("search failed");
          const j = (await rr.json()) as {
            items?: Array<{
              id: string;
              name: string;
              calories: number;
              protein: number;
              carbs: number;
              fat: number;
              category: string;
            }>;
          };
          const items = j.items ?? [];
          if (items.length === 0) {
            setMessages((m) => [
              ...m,
              { role: "assistant", text: "לא מצאתי במאגר המאומת משהו שמתאים לזה. רוצה לנסות מילה אחרת?" },
            ]);
          } else {
            const slice = items.slice(0, 6).map((row) => ({
              id: row.id,
              name: row.name,
              calories: row.calories,
              protein: row.protein,
              carbs: row.carbs,
              fat: row.fat,
              category: row.category,
            }));
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                text: gf(
                  gender,
                  "הנה כמה הצעות מהמאגר המאומת — הערכים ל־100 גרם. אפשר להוסיף ליומן היום, לשמור במילון, או לשלוח לרשימת הקניות:",
                  "הנה כמה הצעות מהמאגר המאומת — הערכים ל־100 גרם. אפשר להוסיף ליומן היום, לשמור במילון, או לשלוח לרשימת הקניות:"
                ),
                verifiedSuggestions: slice,
              },
            ]);
            setActions((prev) => [
              ...prev.filter((a) => a.type !== "open"),
              {
                type: "open",
                label: "פתח מגלה המזונות",
                payload: {
                  href: `/explorer`,
                },
              },
            ]);
          }
        } catch {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              text: "לא הצלחתי למשוך תוצאות מהמאגר המאומת כרגע. נסי שוב בעוד רגע.",
            },
          ]);
        }
      }
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

  function onVerifiedJournal(item: VerifiedFoodItem) {
    const dateKey = getTodayKey();
    const entry = logEntryFromVerifiedPer100g(item);
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    emitMealLoggedFeedback(
      gf(
        gender,
        "נוסף ליומן היום (100 גרם). הגרפים בבית מתעדכנים מיד.",
        "נוסף ליומן היום (100 גרם). הגרפים בבית מתעדכנים מיד."
      )
    );
  }

  function onVerifiedDictionary(item: VerifiedFoodItem) {
    upsertExplorerFoodInDictionary({
      id: item.id,
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      fat: item.fat,
      carbs: item.carbs,
    });
    setToast(gf(gender, "נשמר במילון האישי.", "נשמר במילון האישי."));
  }

  function onVerifiedShopping(item: VerifiedFoodItem) {
    const added = addToShopping({
      foodId: item.id,
      name: item.name,
      category: item.category,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    });
    setToast(
      added
        ? gf(gender, "נוסף לרשימת הקניות.", "נוסף לרשימת הקניות.")
        : gf(gender, "כבר קיים ברשימת הקניות.", "כבר קיים ברשימת הקניות.")
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#fff8fa] via-white to-[#f6faf3] px-4 pb-10 pt-6" dir="rtl">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
          >
            חזרה
          </Link>
          <h1 className="panel-title-cherry text-lg">העוזר של Cherry/Blue</h1>
          <div className="w-[4.25rem]" aria-hidden />
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 p-4 shadow-sm">
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

        <div className="mt-4 space-y-2">
          {messages.map((m, i) => (
            <div
              key={i}
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
                    onJournal={onVerifiedJournal}
                    onDictionary={onVerifiedDictionary}
                    onShopping={onVerifiedShopping}
                  />
                )}
            </div>
          ))}
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
                    if (a.type === "open") window.location.assign(a.payload.href);
                    else if (a.type === "log_ai_meal") window.location.assign(`/add-food-ai?date=${encodeURIComponent(getTodayKey())}`);
                    else window.location.assign(`/add-food?date=${encodeURIComponent(getTodayKey())}`);
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
      </div>
    </div>
  );
}

