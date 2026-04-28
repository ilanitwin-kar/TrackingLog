"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadProfile, loadDictionary } from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import { addRecipe, loadRecipes, removeRecipe, type SavedRecipe } from "@/lib/recipeStorage";
import { fuzzySearch } from "@/lib/fuzzySearch";
import { saveRecipeToCloud } from "@/lib/recipeCloud";
import { rankedFuzzySearchByText, type MatchRange } from "@/lib/rankedSearch";
import { matchesAllQueryWords } from "@/lib/foodSearchRules";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

type IngredientDraft = {
  id: string;
  name: string;
  gramsText: string;
  caloriesPer100gText: string;
  proteinPer100gText: string;
  carbsPer100gText: string;
  fatPer100gText: string;
};

type SearchRow = {
  id: string;
  name: string;
  source: "dictionary" | "explorer" | "openFoodFacts" | "ai";
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function num(text: string): number {
  const t = text.trim().replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function computeTotals(ingredients: IngredientDraft[]) {
  let grams = 0;
  let kcal = 0;
  let p = 0;
  let c = 0;
  let f = 0;
  for (const row of ingredients) {
    const g = clamp(num(row.gramsText), 0, 50000);
    if (g <= 0) continue;
    grams += g;
    const kcal100 = clamp(num(row.caloriesPer100gText), 0, 2000);
    const p100 = clamp(num(row.proteinPer100gText), 0, 500);
    const c100 = clamp(num(row.carbsPer100gText), 0, 500);
    const f100 = clamp(num(row.fatPer100gText), 0, 500);
    const mul = g / 100;
    kcal += kcal100 * mul;
    p += p100 * mul;
    c += c100 * mul;
    f += f100 * mul;
  }
  return {
    grams,
    calories: Math.round(kcal),
    protein: Math.round(p * 10) / 10,
    carbs: Math.round(c * 10) / 10,
    fat: Math.round(f * 10) / 10,
  };
}

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
  return "🧠";
}

export default function RecipesPage() {
  const gender = loadProfile().gender;
  const [title, setTitle] = useState("");
  const [servingsText, setServingsText] = useState("1");
  const [finalCookedWeightText, setFinalCookedWeightText] = useState("");
  const [nutritionOpen, setNutritionOpen] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<IngredientDraft[]>(() => [
    {
      id: makeId(),
      name: "",
      gramsText: "100",
      caloriesPer100gText: "",
      proteinPer100gText: "",
      carbsPer100gText: "",
      fatPer100gText: "",
    },
  ]);

  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [explorerRows, setExplorerRows] = useState<SearchRow[]>([]);
  const [offRows, setOffRows] = useState<SearchRow[]>([]);
  const [aiRows, setAiRows] = useState<SearchRow[]>([]);
  const qRef = useRef<HTMLInputElement>(null);
  const gramsFocusRef = useRef<HTMLInputElement | null>(null);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [portionGramsText, setPortionGramsText] = useState("");

  useEffect(() => {
    setSaved(loadRecipes());
    function onStorage(e: StorageEvent) {
      if (e.key === "cj_recipes_v1") setSaved(loadRecipes());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const servings = clamp(Math.round(num(servingsText) || 1), 1, 60);
  const totals = useMemo(() => computeTotals(rows), [rows]);
  const finalWeightG = useMemo(() => {
    const w = clamp(num(finalCookedWeightText), 0, 200000);
    if (w > 0) return Math.round(w);
    return Math.round(totals.grams);
  }, [finalCookedWeightText, totals.grams]);
  const per100 = useMemo(() => {
    const w = finalWeightG;
    if (w <= 0) return null;
    const mul = 100 / w;
    return {
      calories: Math.round(totals.calories * mul),
      protein: Math.round(totals.protein * mul * 10) / 10,
      carbs: Math.round(totals.carbs * mul * 10) / 10,
      fat: Math.round(totals.fat * mul * 10) / 10,
    };
  }, [totals, finalWeightG]);
  const portion = useMemo(() => {
    const g = clamp(num(portionGramsText), 0, 200000);
    if (!per100 || g <= 0) return null;
    const mul = g / 100;
    return {
      grams: Math.round(g),
      calories: Math.round(per100.calories * mul),
      protein: Math.round(per100.protein * mul * 10) / 10,
      carbs: Math.round(per100.carbs * mul * 10) / 10,
      fat: Math.round(per100.fat * mul * 10) / 10,
    };
  }, [portionGramsText, per100]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setDebouncedQ("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedQ(t), 220);
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
    const strict = all.filter((r) => matchesAllQueryWords(r.name, t)).slice(0, 8);
    if (strict.length > 0) return strict;
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
          pageSize: "18",
        });
        const offParams = new URLSearchParams({ q: debouncedQ, pageSize: "10" });
        const aiParams = new URLSearchParams({ q: debouncedQ });
        const [exRes, offRes, aiRes] = await Promise.all([
          fetch(`/api/food-explorer?${exParams}`, { signal: ac.signal }),
          fetch(`/api/openfoodfacts-search?${offParams}`, { signal: ac.signal }),
          fetch(`/api/ai-food-suggest?${aiParams}`, { signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;
        if (exRes.ok) {
          const ex = (await exRes.json()) as {
            items?: Array<{ id: string; name: string; calories: number; protein: number; carbs: number; fat: number }>;
          };
          const mapped = (ex.items ?? []).slice(0, 18).map((r) => ({
              id: `explorer:${r.id}`,
              name: r.name,
              source: "explorer" as const,
              caloriesPer100g: r.calories,
              proteinPer100g: r.protein,
              carbsPer100g: r.carbs,
              fatPer100g: r.fat,
            }));
          setExplorerRows(mapped);
        } else setExplorerRows([]);
        if (offRes.ok) {
          const off = (await offRes.json()) as {
            items?: Array<{ id: string; name: string; calories: number; protein: number; carbs: number; fat: number }>;
          };
          const mapped = (off.items ?? []).slice(0, 10).map((r) => ({
              id: `off:${r.id}`,
              name: r.name,
              source: "openFoodFacts" as const,
              caloriesPer100g: r.calories,
              proteinPer100g: r.protein,
              carbsPer100g: r.carbs,
              fatPer100g: r.fat,
            }));
          setOffRows(mapped);
        } else setOffRows([]);
        if (aiRes.ok) {
          const ai = (await aiRes.json()) as { items?: Array<{ name: string; caloriesPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number }> };
          const mapped = (ai.items ?? []).slice(0, 8).map((r, idx) => ({
              id: `ai:${idx}:${r.name}`,
              name: r.name,
              source: "ai" as const,
              caloriesPer100g: r.caloriesPer100g,
              proteinPer100g: r.proteinPer100g,
              carbsPer100g: r.carbsPer100g,
              fatPer100g: r.fatPer100g,
            }));
          setAiRows(mapped.filter((r) => matchesAllQueryWords(r.name ?? "", debouncedQ)));
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
    const bySource = (src: SearchRow["source"]) => list.filter((x) => x.source === src);
    return [
      ...bySource("dictionary"),
      ...bySource("explorer"),
      ...bySource("openFoodFacts"),
      ...bySource("ai"),
    ];
  }, [debouncedQ, dictRows, explorerRows, offRows, aiRows]);

  const combinedHits = useMemo(
    () =>
      rankedFuzzySearchByText(combinedRows, debouncedQ, {
        getText: (r) => r.name,
        getKey: (r) => r.id,
        limit: 14,
      }),
    [combinedRows, debouncedQ]
  );

  function addRowFromSearch(match: SearchRow) {
    const id = makeId();
    setRows((prev) => [
      ...prev,
      {
        id,
        name: match.name,
        gramsText: "",
        caloriesPer100gText: String(Math.round(match.caloriesPer100g)),
        proteinPer100gText: String(match.proteinPer100g),
        carbsPer100gText: String(match.carbsPer100g),
        fatPer100gText: String(match.fatPer100g),
      },
    ]);
    setNutritionOpen((m) => ({ ...m, [id]: false }));
    setQ("");
    requestAnimationFrame(() => gramsFocusRef.current?.focus());
  }

  function addEmptyRow() {
    const id = makeId();
    setRows((prev) => [
      ...prev,
      {
        id,
        name: "",
        gramsText: "100",
        caloriesPer100gText: "",
        proteinPer100gText: "",
        carbsPer100gText: "",
        fatPer100gText: "",
      },
    ]);
    setNutritionOpen((m) => ({ ...m, [id]: true }));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setNutritionOpen((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  async function saveCurrentRecipe() {
    const t = title.trim();
    if (!t) return;
    const clean = rows
      .map((r) => ({
        id: r.id,
        name: r.name.trim(),
        grams: clamp(num(r.gramsText), 0, 50000),
        caloriesPer100g: clamp(num(r.caloriesPer100gText), 0, 2000),
        proteinPer100g: clamp(num(r.proteinPer100gText), 0, 500),
        carbsPer100g: clamp(num(r.carbsPer100gText), 0, 500),
        fatPer100g: clamp(num(r.fatPer100gText), 0, 500),
      }))
      .filter((x) => x.name && x.grams > 0);
    if (clean.length < 1) return;
    const row = addRecipe({
      title: t,
      servings,
      finalCookedWeightG: clamp(num(finalCookedWeightText), 0, 200000) > 0 ? finalWeightG : null,
      totals: {
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
      },
      ingredients: clean,
    });
    void saveRecipeToCloud(row);
    setSaved((prev) => [row, ...prev]);
    setSummaryOpen(true);
  }

  return (
    <div className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`} dir="rtl">
      <h1 className="panel-title-cherry mb-4 text-center text-lg">מחשבון מתכונים</h1>

      <motion.section className="glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm font-semibold text-[var(--stem)]/75">
          {gf(
            gender,
            "בני מתכון/ארוחה ביתית לפי מרכיבים ומשקל בגרמים. אפשר למשוך ערכים מהמילון שלך או להזין ידנית. תקבלי סה״כ, ל־1 גרם ולמנה.",
            "בנה מתכון/ארוחה ביתית לפי מרכיבים ומשקל בגרמים. אפשר למשוך ערכים מהמילון שלך או להזין ידנית. תקבל סה״כ, ל־1 גרם ולמנה."
          )}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">שם מתכון</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-luxury-search w-full" placeholder={gf(gender, "למשל: פסטה ברוטב עגבניות", "למשל: פסטה ברוטב עגבניות")} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">מספר מנות</span>
            <input value={servingsText} onChange={(e) => setServingsText(e.target.value)} className="input-luxury-search w-full" inputMode="numeric" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">משקל סופי לאחר בישול (גרם)</span>
            <input
              value={finalCookedWeightText}
              onChange={(e) => setFinalCookedWeightText(e.target.value)}
              className="input-luxury-search w-full"
              inputMode="numeric"
              placeholder={gf(gender, "אם ריק – נסכם משקלי מרכיבים", "אם ריק – נסכם משקלי מרכיבים")}
            />
            <p className="mt-1 text-xs font-semibold text-[var(--stem)]/60">
              כרגע מחושב: <span className="font-extrabold">{finalWeightG}</span> ג׳
            </p>
          </label>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
          <p className="text-sm font-extrabold text-[var(--stem)]">
            חיפוש מרכיב (מאגר אינטליגנציה קלורית → עולמי → AI)
          </p>
          <input
            ref={qRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input-luxury-search mt-2 w-full"
            placeholder={gf(gender, "הקלידי 2–3 אותיות…", "הקלד 2–3 אותיות…")}
          />
          {loading && debouncedQ.length >= 2 && (
            <p className="mt-2 text-xs font-semibold text-[var(--stem)]/60">מחפשת…</p>
          )}
          {combinedHits.length > 0 && (
            <ul className="mt-2 space-y-1">
              {combinedHits.map((h) => (
                <li key={h.item.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-start text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                    onClick={() => addRowFromSearch(h.item)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs" aria-hidden>
                        {sourceIcon(h.item.source)}
                      </span>
                      <span className="min-w-0 break-words">{renderHighlighted(h.item.name, h.ranges)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">מרכיב</span>
                    <input value={r.name} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} className="input-luxury-search w-full" placeholder={gf(gender, "לדוגמה: ביצה", "לדוגמה: ביצה")} />
                  </label>
                </div>
                <button
                  type="button"
                  className="rounded-xl border-2 border-red-300/70 bg-white px-3 py-2 text-xs font-extrabold text-red-800 hover:bg-red-50"
                  onClick={() => removeRow(r.id)}
                  title="הסר מרכיב"
                >
                  מחק
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">גרמים</span>
                  <input
                    ref={(el) => {
                      if (el && rows[rows.length - 1]?.id === r.id) gramsFocusRef.current = el;
                    }}
                    value={r.gramsText}
                    onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, gramsText: e.target.value } : x)))}
                    className="input-luxury-search w-full"
                    inputMode="numeric"
                    placeholder="למשל: 30"
                  />
                </label>
                <button
                  type="button"
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2.5 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => setNutritionOpen((m) => ({ ...m, [r.id]: !(m[r.id] ?? false) }))}
                >
                  {nutritionOpen[r.id] ? "הסתר ערכים ל־100ג׳" : "הצג/ערוך ערכים ל־100ג׳"}
                </button>
              </div>

              {nutritionOpen[r.id] ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">קק״ל ל־100ג׳</span>
                    <input value={r.caloriesPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, caloriesPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">חלבון ל־100ג׳</span>
                    <input value={r.proteinPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, proteinPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">פחמ׳ ל־100ג׳</span>
                    <input value={r.carbsPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, carbsPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">שומן ל־100ג׳</span>
                    <input value={r.fatPer100gText} onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, fatPer100gText: e.target.value } : x)))} className="input-luxury-search w-full" inputMode="numeric" />
                  </label>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-stem flex-1 rounded-xl py-3 text-sm font-extrabold" onClick={addEmptyRow}>
            הוספת מרכיב
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] disabled:opacity-50"
            disabled={!title.trim() || totals.grams <= 0}
            onClick={saveCurrentRecipe}
          >
            שמירה למתכונים שלי
          </button>
        </div>
        <div className="mt-2">
          <Link
            href="/my-recipes"
            className="inline-flex items-center justify-center rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-2.5 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
          >
            מעבר ל״המתכונים שלי״
          </Link>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
          <p className="text-sm font-extrabold text-[var(--stem)]">תוצאות</p>
          <p className="mt-2 text-sm text-[var(--stem)]/85">
            סה״כ ערכים (קבוע):{" "}
            <span className="font-extrabold text-[var(--cherry)]">{Math.round(totals.calories)}</span> קק״ל
          </p>
          <p className="mt-1 text-xs text-[var(--stem)]/70">
            חלבון {totals.protein} · פחמ׳ {totals.carbs} · שומן {totals.fat}
          </p>
          <p className="mt-2 text-xs text-[var(--stem)]/70">
            משקל סופי לחישוב ל־100ג׳: <span className="font-extrabold">{finalWeightG}</span> ג׳
          </p>
          {per100 && (
            <p className="mt-2 text-sm font-semibold text-[var(--stem)]/85">
              ל־100ג׳:{" "}
              <span className="font-extrabold text-[var(--cherry)]">{per100.calories}</span> קק״ל · ח{" "}
              {per100.protein} · פח {per100.carbs} · ש {per100.fat}
            </p>
          )}
          <button
            type="button"
            className="mt-3 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] disabled:opacity-50"
            disabled={totals.grams <= 0 || finalWeightG <= 0}
            onClick={() => setSummaryOpen(true)}
          >
            סיכום + מחשבון מנה
          </button>
        </div>
      </motion.section>

      <AnimatePresence>
        {summaryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
            onClick={() => setSummaryOpen(false)}
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-lg rounded-3xl border-2 border-[var(--border-cherry-soft)] bg-white p-4"
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-extrabold text-[var(--stem)]">סיכום מתכון</p>
                <button
                  type="button"
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  onClick={() => setSummaryOpen(false)}
                >
                  סגור
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--stem)]/85">
                סה״כ: <span className="font-extrabold text-[var(--cherry)]">{totals.calories}</span> קק״ל · ח {totals.protein} · פח {totals.carbs} · ש {totals.fat}
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--stem)]/60">
                משקל סופי: <span className="font-extrabold">{finalWeightG}</span> ג׳ · ל־100ג׳:{" "}
                <span className="font-extrabold text-[var(--cherry)]">{per100?.calories ?? 0}</span> קק״ל
              </p>

              <div className="mt-3 rounded-2xl border border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/40 p-3">
                <p className="text-sm font-extrabold text-[var(--stem)]">מחשבון מנה</p>
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">גרם למנה</span>
                  <input value={portionGramsText} onChange={(e) => setPortionGramsText(e.target.value)} className="input-luxury-search w-full" inputMode="numeric" placeholder="למשל: 180" />
                </label>
                {portion && (
                  <p className="mt-2 text-sm font-semibold text-[var(--stem)]/85">
                    מנה ({portion.grams}ג׳):{" "}
                    <span className="font-extrabold text-[var(--cherry)]">{portion.calories}</span> קק״ל · ח {portion.protein} · פח {portion.carbs} · ש {portion.fat}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.section className="mt-4 glass-panel p-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="panel-title-cherry mb-3 text-lg">המתכונים שלי</h2>
        {saved.length === 0 ? (
          <p className="text-sm text-[var(--stem)]/75">
            {gf(gender, "עדיין אין מתכונים שמורים.", "עדיין אין מתכונים שמורים.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {saved.map((r) => (
              <li key={r.id} className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3">
                <button type="button" className="w-full text-start" onClick={() => setOpenId((x) => (x === r.id ? null : r.id))}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-base font-extrabold text-[var(--stem)]">{r.title}</p>
                      <p className="mt-1 text-xs text-[var(--stem)]/65">
                        מנות: {r.servings} · מרכיבים: {r.ingredients.length}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-[var(--stem)]/55">
                      {openId === r.id ? "▲" : "▼"}
                    </span>
                  </div>
                </button>
                <AnimatePresence>
                  {openId === r.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 border-t border-[var(--border-cherry-soft)]/60 pt-3"
                    >
                      <ul className="space-y-1 text-sm text-[var(--stem)]/90">
                        {r.ingredients.map((it) => (
                          <li key={it.id}>
                            <span className="font-semibold">{it.name}</span> — {Math.round(it.grams)} ג׳ · {Math.round(it.caloriesPer100g)} קק״ל/100ג׳
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="mt-3 w-full rounded-xl border-2 border-red-300/70 bg-white px-3 py-2.5 text-sm font-extrabold text-red-800 shadow-sm transition hover:bg-red-50"
                        onClick={() => {
                          setSaved(removeRecipe(r.id));
                          if (openId === r.id) setOpenId(null);
                        }}
                      >
                        מחיקת מתכון
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}

