"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadProfile, loadDictionary } from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import { dailyCalorieTarget } from "@/lib/tdee";
import { addToShopping } from "@/lib/explorerStorage";
import { useRouter } from "next/navigation";
import { addDaysToDateKey, getTodayKey } from "@/lib/dateKey";
import { addSavedMenu } from "@/lib/menuStorage";
import { loadPlannerState, savePlannerState, clearPlannerState, type PlannerItem, type PlannerMealSlot } from "@/lib/plannerStorage";
import { fuzzySearch } from "@/lib/fuzzySearch";
import { rankedFuzzySearchByText, type MatchRange } from "@/lib/rankedSearch";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

type SearchRow = {
  id: string;
  name: string;
  source: "dictionary" | "explorer" | "openFoodFacts" | "ai" | "manual";
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function num(text: string): number {
  const t = text.trim().replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function computeItemTotals(item: PlannerItem): { grams: number; calories: number; protein: number; carbs: number; fat: number } {
  const qty = clamp(Number(item.qty) || 0, 0, 50000);
  let grams = 0;
  if (item.unit === "גרם") grams = qty;
  else if (item.gramsPerUnit != null && item.gramsPerUnit > 0) grams = qty * item.gramsPerUnit;
  const mul = grams > 0 ? grams / 100 : 0;
  return {
    grams,
    calories: Math.round((Number(item.caloriesPer100g) || 0) * mul),
    protein: Math.round(((Number(item.proteinPer100g) || 0) * mul) * 10) / 10,
    carbs: Math.round(((Number(item.carbsPer100g) || 0) * mul) * 10) / 10,
    fat: Math.round(((Number(item.fatPer100g) || 0) * mul) * 10) / 10,
  };
}

function computeTotals(items: PlannerItem[]) {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const it of items) {
    const t = computeItemTotals(it);
    calories += t.calories;
    protein += t.protein;
    carbs += t.carbs;
    fat += t.fat;
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
  };
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const WEEKDAYS: Array<{ id: number; label: string }> = [
  { id: 0, label: "א׳" },
  { id: 1, label: "ב׳" },
  { id: 2, label: "ג׳" },
  { id: 3, label: "ד׳" },
  { id: 4, label: "ה׳" },
  { id: 5, label: "ו׳" },
  { id: 6, label: "ש׳" },
];

const MEAL_SLOTS: PlannerMealSlot[] = ["בוקר", "צהריים", "ערב", "ביניים"];

function renderHighlighted(text: string, ranges: MatchRange[]) {
  if (!ranges || ranges.length < 1) return text;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    const start = Math.max(0, Math.min(text.length, s));
    const end = Math.max(0, Math.min(text.length - 1, e));
    if (start > at) out.push(<span key={`t-${at}`}>{text.slice(at, start)}</span>);
    out.push(<strong key={`b-${start}`}>{text.slice(start, end + 1)}</strong>);
    at = end + 1;
  }
  if (at < text.length) out.push(<span key={`t-${at}-end`}>{text.slice(at)}</span>);
  return <>{out}</>;
}

function sourceIcon(src: SearchRow["source"]) {
  if (src === "dictionary") return "🍒";
  if (src === "explorer") return "🔎";
  if (src === "openFoodFacts") return "🌐";
  if (src === "manual") return "✏️";
  return "🧠";
}

export default function PlannerPage() {
  const router = useRouter();
  const profile = loadProfile();
  const gender = profile.gender;
  const [mode, setMode] = useState<"day" | "week">("day");
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [weekAnchorDateKey, setWeekAnchorDateKey] = useState<string>(getTodayKey());
  const [dayDateKey, setDayDateKey] = useState<string>(getTodayKey());

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [explorerRows, setExplorerRows] = useState<SearchRow[]>([]);
  const [offRows, setOffRows] = useState<SearchRow[]>([]);
  const [aiRows, setAiRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [qtyFocusId, setQtyFocusId] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manName, setManName] = useState("");
  const [manKcal, setManKcal] = useState("");
  const [manP, setManP] = useState("");
  const [manC, setManC] = useState("");
  const [manF, setManF] = useState("");

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPending, setAssignPending] = useState<SearchRow | null>(null);
  const [assignDayIndex, setAssignDayIndex] = useState<number>(0);
  const [assignMealSlot, setAssignMealSlot] = useState<PlannerMealSlot>("בוקר");
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetDayIndex, setCopyTargetDayIndex] = useState<number>(1);

  const [qtyTextById, setQtyTextById] = useState<Record<string, string>>({});

  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const s = loadPlannerState();
    setMode(s.mode);
    setItems(s.items);
    if (typeof s.selectedDayIndex === "number") setSelectedDayIndex(s.selectedDayIndex);
    if (typeof s.weekAnchorDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.weekAnchorDateKey)) setWeekAnchorDateKey(s.weekAnchorDateKey);
    if (typeof s.dayDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.dayDateKey)) setDayDateKey(s.dayDateKey);
  }, []);

  useEffect(() => {
    savePlannerState({ updatedAt: new Date().toISOString(), mode, items, selectedDayIndex, weekAnchorDateKey, dayDateKey });
  }, [mode, items, selectedDayIndex, weekAnchorDateKey, dayDateKey]);

  useEffect(() => {
    setQtyTextById((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const it of items) {
        if (next[it.id] == null) next[it.id] = it.qty > 0 ? String(it.qty) : "";
      }
      // remove missing
      for (const k of Object.keys(next)) {
        if (!items.some((it) => it.id === k)) delete next[k];
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setDebouncedQ("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedQ(t), 180);
    return () => window.clearTimeout(id);
  }, [q]);

  const dictRows = useMemo(() => {
    const t = debouncedQ.trim();
    if (t.length < 2) return [];
    const all = loadDictionary().map((d) => ({
      id: `dictionary:${d.id}`,
      name: d.food,
      source: "dictionary" as const,
      caloriesPer100g: d.caloriesPer100g ?? 0,
      proteinPer100g: d.proteinPer100g ?? 0,
      carbsPer100g: d.carbsPer100g ?? 0,
      fatPer100g: d.fatPer100g ?? 0,
    }));
    return fuzzySearch(all, t, { keys: ["name"], limit: 8 });
  }, [debouncedQ]);

  useEffect(() => {
    if (debouncedQ.length < 2) {
      setExplorerRows([]);
      setOffRows([]);
      setAiRows([]);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const exParams = new URLSearchParams({
          q: debouncedQ,
          sort: "caloriesAsc",
          category: "הכל",
          page: "1",
          pageSize: "20",
        });
        const offParams = new URLSearchParams({ q: debouncedQ, pageSize: "12" });
        const aiParams = new URLSearchParams({ q: debouncedQ });
        const [exRes, offRes, aiRes] = await Promise.all([
          fetch(`/api/food-explorer?${exParams}`, { signal: ac.signal }),
          fetch(`/api/openfoodfacts-search?${offParams}`, { signal: ac.signal }),
          fetch(`/api/ai-food-suggest?${aiParams}`, { signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;
        if (exRes.ok) {
          const ex = (await exRes.json()) as { items?: Array<{ id: string; name: string; calories: number; protein: number; carbs: number; fat: number; category: string }> };
          setExplorerRows(
            (ex.items ?? []).slice(0, 18).map((r) => ({
              id: `explorer:${r.id}`,
              name: r.name,
              source: "explorer",
              caloriesPer100g: r.calories,
              proteinPer100g: r.protein,
              carbsPer100g: r.carbs,
              fatPer100g: r.fat,
            }))
          );
        } else setExplorerRows([]);
        if (offRes.ok) {
          const off = (await offRes.json()) as { items?: Array<{ id: string; name: string; calories: number; protein: number; carbs: number; fat: number }> };
          setOffRows(
            (off.items ?? []).slice(0, 10).map((r) => ({
              id: `off:${r.id}`,
              name: r.name,
              source: "openFoodFacts",
              caloriesPer100g: r.calories,
              proteinPer100g: r.protein,
              carbsPer100g: r.carbs,
              fatPer100g: r.fat,
            }))
          );
        } else setOffRows([]);
        if (aiRes.ok) {
          const ai = (await aiRes.json()) as { items?: Array<{ name: string; caloriesPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number }> };
          setAiRows(
            (ai.items ?? []).slice(0, 10).map((r, idx) => ({
              id: `ai:${idx}:${r.name}`,
              name: r.name,
              source: "ai",
              caloriesPer100g: r.caloriesPer100g,
              proteinPer100g: r.proteinPer100g,
              carbsPer100g: r.carbsPer100g,
              fatPer100g: r.fatPer100g,
            }))
          );
        } else setAiRows([]);
      } catch {
        if (!ac.signal.aborted) {
          setExplorerRows([]);
          setOffRows([]);
          setAiRows([]);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedQ]);

  const combinedRows = useMemo(() => {
    const t = debouncedQ.trim();
    if (t.length < 2) return [];
    const all: SearchRow[] = [...dictRows, ...explorerRows, ...offRows, ...aiRows];
    const dedup = new Map<string, SearchRow>();
    for (const r of all) {
      const key = `${r.source}:${r.name}`.toLowerCase();
      if (!dedup.has(key)) dedup.set(key, r);
    }
    const list = Array.from(dedup.values());
    // Don't pre-trim here — ranking+fuzzy happens in rankedFuzzySearchByText.
    // Preserve source-priority ordering for non-prefix ties.
    const bySource = (src: SearchRow["source"]) => list.filter((x) => x.source === src);
    return [
      ...bySource("dictionary"),
      ...bySource("explorer"),
      ...bySource("openFoodFacts"),
      ...bySource("ai"),
      ...bySource("manual"),
    ];
  }, [debouncedQ, dictRows, explorerRows, offRows, aiRows]);

  const totalTarget = useMemo(() => {
    const daily = dailyCalorieTarget(
      profile.gender,
      profile.weightKg,
      profile.heightCm,
      profile.age,
      profile.deficit,
      profile.activity
    );
    return Math.round(daily) * (mode === "week" ? 7 : 1);
  }, [profile.gender, profile.weightKg, profile.heightCm, profile.age, profile.deficit, profile.activity, mode]);

  const totals = useMemo(() => computeTotals(items), [items]);
  const remaining = Math.round(totalTarget - totals.calories);

  const activeDateKey = useMemo(() => {
    if (mode === "week") return addDaysToDateKey(weekAnchorDateKey, selectedDayIndex);
    return dayDateKey;
  }, [mode, weekAnchorDateKey, selectedDayIndex, dayDateKey]);

  const visibleItems = useMemo(() => {
    const d = selectedDayIndex;
    return items.filter((x) => (x.dayIndex ?? 0) === d);
  }, [items, selectedDayIndex]);

  const visibleTotals = useMemo(() => computeTotals(visibleItems), [visibleItems]);

  function addFromRow(r: SearchRow) {
    setAssignPending(r);
    setAssignDayIndex(selectedDayIndex);
    setAssignMealSlot("בוקר");
    setAssignOpen(true);
  }

  function confirmAssign() {
    if (!assignPending) return;
    const r = assignPending;
    const newId = makeId();
    const row: PlannerItem = {
      id: newId,
      source: r.source,
      name: r.name,
      caloriesPer100g: r.caloriesPer100g,
      proteinPer100g: r.proteinPer100g,
      carbsPer100g: r.carbsPer100g,
      fatPer100g: r.fatPer100g,
      qty: 0,
      unit: "גרם",
      gramsPerUnit: null,
      dayIndex: assignDayIndex,
      mealSlot: assignMealSlot,
    };
    setItems((prev) => [row, ...prev]);
    setQtyFocusId(newId);
    setQtyTextById((m) => ({ ...m, [newId]: "" }));
    setQ("");
    setAssignPending(null);
    setAssignOpen(false);
  }

  function addManual() {
    const name = manName.trim();
    if (!name) return;
    setAssignPending({
      id: `manual:${Date.now()}`,
      name,
      source: "manual",
      caloriesPer100g: clamp(num(manKcal), 0, 2000),
      proteinPer100g: clamp(num(manP), 0, 500),
      carbsPer100g: clamp(num(manC), 0, 500),
      fatPer100g: clamp(num(manF), 0, 500),
    });
    setAssignDayIndex(selectedDayIndex);
    setAssignMealSlot("בוקר");
    setAssignOpen(true);
    setManualOpen(false);
    setManName("");
    setManKcal("");
    setManP("");
    setManC("");
    setManF("");
  }

  async function sendCoach() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    setChatInput("");
    setChat((m) => [...m, { role: "user", text }]);
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: chat.slice(-12),
          snapshot: {
            screen: "planner",
            planner: {
              mode,
              targetCalories: totalTarget,
              totals,
              remainingCalories: remaining,
              items: items.slice(0, 40).map((it) => ({
                name: it.name,
                unit: it.unit,
                qty: it.qty,
              })),
            },
          },
          memory: {},
        }),
      });
      const data = (await res.json()) as { result?: { reply?: string } };
      const reply = data.result?.reply ? String(data.result.reply) : "לא הצלחתי לענות כרגע.";
      setChat((m) => [...m, { role: "assistant", text: reply }]);
      window.requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch {
      setChat((m) => [...m, { role: "assistant", text: "לא הצלחתי לענות כרגע." }]);
    } finally {
      setChatBusy(false);
    }
  }

  const results = useMemo(
    () =>
      rankedFuzzySearchByText(combinedRows, debouncedQ, {
        getText: (r) => r.name,
        getKey: (r) => r.id,
        limit: 18,
      }),
    [combinedRows, debouncedQ]
  );

  return (
    <div className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`} dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
        >
          חזרה
        </Link>
        <h1 className="panel-title-cherry text-lg">בניית תפריט</h1>
        <div className="w-[4.25rem]" aria-hidden />
      </div>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-full border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                mode === "day"
                  ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                  : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
              }`}
              onClick={() => setMode("day")}
            >
              יומי
            </button>
            <button
              type="button"
              className={`rounded-full border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                mode === "week"
                  ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                  : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
              }`}
              onClick={() => setMode("week")}
            >
              שבועי
            </button>
          </div>
          <button
            type="button"
            className="rounded-full border-2 border-red-300/70 bg-white px-3 py-2 text-xs font-extrabold text-red-800 shadow-sm transition hover:bg-red-50"
            onClick={() => {
              clearPlannerState();
              setItems([]);
            }}
          >
            איפוס
          </button>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-[var(--stem)]">בחירת יום</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--stem)]/70">תאריך:</span>
              {mode === "week" ? (
                <input
                  type="date"
                  className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-semibold text-[var(--stem)]"
                  value={weekAnchorDateKey}
                  onChange={(e) => setWeekAnchorDateKey(e.target.value)}
                />
              ) : (
                <input
                  type="date"
                  className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-semibold text-[var(--stem)]"
                  value={dayDateKey}
                  onChange={(e) => setDayDateKey(e.target.value)}
                />
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`rounded-full border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                  selectedDayIndex === d.id
                    ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                    : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
                }`}
                onClick={() => setSelectedDayIndex(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-[var(--stem)]/60">
            משויך לתאריך: <span className="font-extrabold">{activeDateKey}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={() => {
                setCopyTargetDayIndex(selectedDayIndex === 6 ? 0 : selectedDayIndex + 1);
                setCopyOpen(true);
              }}
            >
              העתק יום זה ליום אחר
            </button>
            <button
              type="button"
              className="rounded-xl bg-[var(--stem)] px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:brightness-105"
              onClick={() => {
                // build SavedMenu from all items, grouped by day+meal
                const grouped = new Map<string, { name: string; items: Array<{ name: string; portionLabel: string; calories: number; protein: number; carbs: number; fat: number }>; calories: number; protein: number; carbs: number; fat: number }>();
                for (const it of items) {
                  const di = it.dayIndex ?? 0;
                  const slot = it.mealSlot ?? "בוקר";
                  const key = `${di}:${slot}`;
                  const g = grouped.get(key) ?? {
                    name: `${WEEKDAYS[di]?.label ?? "א׳"} · ${slot}`,
                    items: [],
                    calories: 0,
                    protein: 0,
                    carbs: 0,
                    fat: 0,
                  };
                  const t = computeItemTotals(it);
                  if ((it.qty ?? 0) > 0) {
                    g.items.push({
                      name: it.name,
                      portionLabel: it.unit === "גרם" ? `${Math.round(it.qty)}g` : `${it.qty} יח׳`,
                      calories: t.calories,
                      protein: t.protein,
                      carbs: t.carbs,
                      fat: t.fat,
                    });
                    g.calories += t.calories;
                    g.protein += t.protein;
                    g.carbs += t.carbs;
                    g.fat += t.fat;
                  }
                  grouped.set(key, g);
                }
                const meals = Array.from(grouped.values())
                  .filter((m) => m.items.length > 0)
                  .map((m) => ({
                    name: m.name,
                    items: m.items,
                    calories: Math.round(m.calories),
                    protein: Math.round(m.protein * 10) / 10,
                    carbs: Math.round(m.carbs * 10) / 10,
                    fat: Math.round(m.fat * 10) / 10,
                  }));
                if (meals.length < 1) {
                  window.alert(gf(gender, "אין מה לשמור עדיין — הוסיפי פריטים עם כמות.", "אין מה לשמור עדיין — הוסף פריטים עם כמות."));
                  return;
                }
                const total = computeTotals(items);
                const title =
                  mode === "week"
                    ? `תפריט שבועי (${weekAnchorDateKey})`
                    : `תפריט (${dayDateKey})`;
                addSavedMenu({
                  title,
                  meals,
                  totalCalories: total.calories,
                  totalProtein: total.protein,
                  totalCarbs: total.carbs,
                  totalFat: total.fat,
                });
                router.push("/menus");
              }}
            >
              סגירת תפריט → לתפריטים שלי
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
          <p className="text-xs font-extrabold text-[var(--stem)]/70">יתרה</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--cherry)]">
            {Math.round(totalTarget - visibleTotals.calories).toLocaleString("he-IL")} קק״ל
          </p>
          <p className="mt-1 text-xs text-[var(--stem)]/70">
            יעד: {totalTarget.toLocaleString("he-IL")} · נבחר ביום: {visibleTotals.calories.toLocaleString("he-IL")}
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--stem)]/85">
            חלבון {visibleTotals.protein} · פחמ׳ {visibleTotals.carbs} · שומן {visibleTotals.fat}
          </p>
        </div>

        <div className="mt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">חיפוש מזון</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="input-luxury-search w-full"
              placeholder={gf(gender, "חפשי במילון/מאגר/עולמי…", "חפש במילון/מאגר/עולמי…")}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={() => setManualOpen(true)}
            >
              הוספת פריט משלי
            </button>
          </div>
          {loading && debouncedQ.length >= 2 ? (
            <p className="mt-2 text-center text-sm text-[var(--cherry)]/80">טוען תוצאות…</p>
          ) : results.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {results.map((h) => (
                <li key={h.item.id} className="flex items-stretch gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2.5">
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => addFromRow(h.item)}>
                    <p className="flex items-center gap-2 break-words text-sm font-extrabold text-[var(--stem)]">
                      <span className="text-xs" aria-hidden>
                        {sourceIcon(h.item.source)}
                      </span>
                      <span className="min-w-0 flex-1 break-words">{renderHighlighted(h.item.name, h.ranges)}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--stem)]/65">ל־100ג׳ {Math.round(h.item.caloriesPer100g)} קק״ל</p>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--cherry)] px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:brightness-105"
                    onClick={() => addFromRow(h.item)}
                  >
                    הוסף
                  </button>
                </li>
              ))}
            </ul>
          ) : debouncedQ.length >= 2 ? (
            <p className="mt-3 text-sm text-[var(--stem)]/75">אין תוצאות — אפשר להוסיף פריט משלך.</p>
          ) : null}
        </div>
      </motion.section>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="panel-title-cherry mb-3 text-lg">התפריט שלך</h2>
        {visibleItems.length === 0 ? (
          <p className="text-sm text-[var(--stem)]/75">עוד לא הוספת פריטים.</p>
        ) : (
          <ul className="space-y-2">
            {visibleItems.map((it) => {
              const t = computeItemTotals(it);
              return (
                <li key={it.id} className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-extrabold text-[var(--stem)]">{it.name}</p>
                      <p className="mt-1 text-xs text-[var(--stem)]/70">
                        סה״כ: {t.calories} קק״ל · ח {t.protein} · פח {t.carbs} · ש {t.fat}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-xl border-2 border-red-300/70 bg-white px-3 py-2 text-xs font-extrabold text-red-800 hover:bg-red-50"
                      onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                    >
                      מחק
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">כמות</span>
                      <input
                        ref={(el) => {
                          if (el && qtyFocusId === it.id) {
                            window.requestAnimationFrame(() => {
                              try {
                                el.focus();
                              } catch {
                                /* ignore */
                              }
                            });
                          }
                        }}
                        value={qtyTextById[it.id] ?? (it.qty > 0 ? String(it.qty) : "")}
                        onChange={(e) => setQtyTextById((m) => ({ ...m, [it.id]: e.target.value }))}
                        onBlur={() => {
                          const raw = (qtyTextById[it.id] ?? "").trim();
                          const n = raw.length === 0 ? 0 : clamp(num(raw), 0, 50000);
                          setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, qty: n } : x)));
                          setQtyTextById((m) => ({ ...m, [it.id]: n > 0 ? String(n) : "" }));
                          setQtyFocusId(null);
                        }}
                        className="input-luxury-search w-full"
                        inputMode="numeric"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">יחידה</span>
                      <select
                        value={it.unit}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, unit: e.target.value === "יחידה" ? "יחידה" : "גרם" } : x))
                          )
                        }
                        className="select-luxury w-full"
                      >
                        <option value="גרם">גרם</option>
                        <option value="יחידה">יחידה</option>
                      </select>
                    </label>
                    {it.unit === "יחידה" ? (
                      <label className="col-span-2 block">
                        <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">גרם ליחידה (כדי לחשב)</span>
                        <input
                          value={it.gramsPerUnit != null ? String(it.gramsPerUnit) : ""}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id ? { ...x, gramsPerUnit: clamp(num(e.target.value), 0, 2000) || null } : x
                              )
                            )
                          }
                          className="input-luxury-search w-full"
                          inputMode="numeric"
                          placeholder={gf(gender, "למשל 60", "למשל 60")}
                        />
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2.5 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                      onClick={() => {
                        const added = addToShopping({
                          foodId: `planner:${it.id}`,
                          name: it.name,
                          category: "תפריט",
                          calories: it.caloriesPer100g,
                          protein: it.proteinPer100g,
                          carbs: it.carbsPer100g,
                          fat: it.fatPer100g,
                        });
                        if (added) window.alert(gf(gender, "נוסף לרשימת הקניות.", "נוסף לרשימת הקניות."));
                      }}
                    >
                      לקניות
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="panel-title-cherry mb-2 text-lg">עוזר לתפריט</h2>
        <p className="text-xs text-[var(--stem)]/70">
          כאן אפשר לבקש רעיונות שמסתדרים עם היתרה והמאקרו של התפריט שבנית.
        </p>
        <div className="mt-3 space-y-2">
          {chat.map((m, idx) => (
            <div
              key={`${m.role}-${idx}`}
              className={`rounded-2xl border px-3 py-2 text-sm shadow-sm ${
                m.role === "assistant"
                  ? "border-[var(--border-cherry-soft)] bg-white"
                  : "border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="input-luxury-search flex-1"
            placeholder={gf(gender, "שאלי רעיון למנה שתתאים ליתרה…", "שאל רעיון למנה שתתאים ליתרה…")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendCoach();
            }}
          />
          <button
            type="button"
            className="btn-stem rounded-xl px-4 py-3 text-sm font-extrabold disabled:opacity-50"
            disabled={chatBusy || chatInput.trim().length < 1}
            onClick={() => void sendCoach()}
          >
            {chatBusy ? "…" : "שלח"}
          </button>
        </div>
      </motion.section>

      <AnimatePresence>
        {copyOpen && (
          <motion.div
            className="fixed inset-0 z-[405] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCopyOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="glass-panel w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-xl"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.15 }}
              dir="rtl"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="panel-title-cherry text-lg">העתקת יום</h3>
                <button
                  type="button"
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  onClick={() => setCopyOpen(false)}
                >
                  X
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--stem)]/80">
                להעתיק את {WEEKDAYS[selectedDayIndex]?.label ?? "א׳"} ליום:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={d.id === selectedDayIndex}
                    className={`rounded-full border-2 px-3 py-2 text-xs font-extrabold transition-colors disabled:opacity-50 ${
                      copyTargetDayIndex === d.id
                        ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                        : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
                    }`}
                    onClick={() => setCopyTargetDayIndex(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--stem)]/60">
                הפעולה מחליפה את פריטי היעד (כדי למנוע כפילויות).
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => setCopyOpen(false)}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-[var(--stem)] px-4 py-3 text-xs font-extrabold text-white shadow-sm transition hover:brightness-105"
                  onClick={() => {
                    const src = selectedDayIndex;
                    const dst = copyTargetDayIndex;
                    const srcItems = items.filter((x) => (x.dayIndex ?? 0) === src);
                    const keep = items.filter((x) => (x.dayIndex ?? 0) !== dst);
                    const cloned = srcItems.map((x) => ({ ...x, id: makeId(), dayIndex: dst }));
                    setItems([...cloned, ...keep]);
                    setCopyOpen(false);
                  }}
                >
                  העתק
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {assignOpen && (
          <motion.div
            className="fixed inset-0 z-[410] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setAssignOpen(false);
                setAssignPending(null);
              }
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="glass-panel w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-xl"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.15 }}
              dir="rtl"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="panel-title-cherry text-lg">שיבוץ לתפריט</h3>
                <button
                  type="button"
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  onClick={() => {
                    setAssignOpen(false);
                    setAssignPending(null);
                  }}
                  aria-label="סגור"
                  title="סגור"
                >
                  X
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--stem)]/80">
                {assignPending?.name ?? ""}
              </p>

              <div className="mt-3">
                <p className="text-xs font-extrabold text-[var(--stem)]/70">לאיזה יום?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`rounded-full border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                        assignDayIndex === d.id
                          ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                          : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
                      }`}
                      onClick={() => setAssignDayIndex(d.id)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-extrabold text-[var(--stem)]/70">לאיזו ארוחה?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MEAL_SLOTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rounded-full border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                        assignMealSlot === s
                          ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                          : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
                      }`}
                      onClick={() => setAssignMealSlot(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => {
                    setAssignOpen(false);
                    setAssignPending(null);
                  }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-[var(--stem)] px-4 py-3 text-xs font-extrabold text-white shadow-sm transition hover:brightness-105"
                  onClick={confirmAssign}
                >
                  הוסף
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {manualOpen && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setManualOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="glass-panel w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-xl"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.15 }}
              dir="rtl"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="panel-title-cherry text-lg">פריט משלי (ל־100 גרם)</h3>
                <button
                  type="button"
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  onClick={() => setManualOpen(false)}
                  aria-label="סגור"
                  title="סגור"
                >
                  X
                </button>
              </div>
              <div className="mt-3 space-y-2">
                <input className="input-luxury-search w-full" value={manName} onChange={(e) => setManName(e.target.value)} placeholder={gf(gender, "שם מזון", "שם מזון")} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input-luxury-search w-full" value={manKcal} onChange={(e) => setManKcal(e.target.value)} placeholder="קק״ל" inputMode="numeric" />
                  <input className="input-luxury-search w-full" value={manP} onChange={(e) => setManP(e.target.value)} placeholder="חלבון" inputMode="numeric" />
                  <input className="input-luxury-search w-full" value={manC} onChange={(e) => setManC(e.target.value)} placeholder="פחמ׳" inputMode="numeric" />
                  <input className="input-luxury-search w-full" value={manF} onChange={(e) => setManF(e.target.value)} placeholder="שומן" inputMode="numeric" />
                </div>
                <button type="button" className="btn-stem w-full rounded-xl py-3 text-sm font-extrabold" onClick={addManual}>
                  הוסף לתפריט
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

