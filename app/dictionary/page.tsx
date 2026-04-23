"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DictionaryItem,
  type FoodUnit,
  type LogEntry,
  type MealPreset,
  type MealPresetComponent,
  applyMealPresetToToday,
  getEntriesForDate,
  isExplorerFoodInDictionary,
  loadDictionary,
  loadMealPresets,
  loadProfile,
  patchDictionaryItemById,
  removeDictionaryItem,
  saveDayLogEntries,
  toggleExplorerFoodInDictionary,
} from "@/lib/storage";
import {
  addToShopping,
  loadShoppingFoodIds,
} from "@/lib/explorerStorage";
import { IconCaption } from "@/components/IconCaption";
import {
  IconBookmark,
  IconCart,
  IconPencil,
  IconTrash,
  IconPlusCircle,
  IconVerified,
} from "@/components/Icons";
import { InfoCard } from "@/components/InfoCard";
import { emitMealLoggedFeedback } from "@/lib/feedbackEvents";
import {
  dictionaryEditFoodError,
  dictionaryHeading,
  dictionaryIntroBody,
  dictionaryIntroTitle,
  dictionarySavedFilterPlaceholder,
  gf,
} from "@/lib/hebrewGenderUi";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { rankedFuzzySearchByText, type MatchRange } from "@/lib/rankedSearch";
import { getTodayKey } from "@/lib/dateKey";

const fontFood =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

type ExplorerFoodRow = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  category: string;
};

const UNITS: FoodUnit[] = [
  "גרם",
  "כוס",
  "כף",
  "כפית",
  "מריחה",
  "יחידה",
];

const HEB_LETTERS = [
  "א",
  "ב",
  "ג",
  "ד",
  "ה",
  "ו",
  "ז",
  "ח",
  "ט",
  "י",
  "כ",
  "ל",
  "מ",
  "נ",
  "ס",
  "ע",
  "פ",
  "צ",
  "ק",
  "ר",
  "ש",
  "ת",
] as const;

function normalizeTitleForIndex(title: string): string {
  const t = title.trim();
  // סדר טוב יותר למוצרים שנשמרים עם פריפיקס
  if (t.startsWith("מתכון:")) return t.replace(/^מתכון:\s*/, "");
  return t;
}

function firstHebLetter(title: string): string | null {
  const t = normalizeTitleForIndex(title);
  const ch = t[0] ?? "";
  // אותיות סופיות: להשוות לצורה הרגילה כדי שהסינון יהיה צפוי
  const mapFinal: Record<string, string> = {
    ך: "כ",
    ם: "מ",
    ן: "נ",
    ף: "פ",
    ץ: "צ",
  };
  const norm = mapFinal[ch] ?? ch;
  return (HEB_LETTERS as readonly string[]).includes(norm) ? norm : null;
}

function clampGramQty(q: number): number {
  if (!Number.isFinite(q)) return 100;
  return Math.min(5000, Math.max(1, Math.round(q)));
}

function clampOtherQty(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.min(50, Math.max(0.25, Math.round(q * 100) / 100));
}

function parseQtyForUnit(text: string, unit: FoodUnit): number {
  const n = parseFloat(text.replace(",", "."));
  if (unit === "גרם") return clampGramQty(n);
  return clampOtherQty(n);
}

function parseGramsPerUnitField(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = parseFloat(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5000, Math.max(0.1, Math.round(n * 100) / 100));
}

function servingTotalGrams(
  qty: number,
  unit: FoodUnit,
  gramsPerUnit: number | null
): number | null {
  if (unit === "גרם") return clampGramQty(qty);
  if (unit === "יחידה" && gramsPerUnit != null && gramsPerUnit > 0) {
    return clampGramQty(qty * gramsPerUnit);
  }
  return null;
}

function kcalPer100FromMealComponent(c: MealPresetComponent): number {
  if (c.unit === "גרם" && c.quantity > 0 && c.calories > 0) {
    return Math.round((c.calories / c.quantity) * 100);
  }
  return 0;
}

function clampJournalQty(q: number, unit: FoodUnit): number {
  if (unit === "גרם") return clampGramQty(q);
  return clampOtherQty(q);
}

function sortSavedByQuery(items: DictionaryItem[], query: string): DictionaryItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return items;
  const p: DictionaryItem[] = [];
  const c: DictionaryItem[] = [];
  for (const d of items) {
    const f = d.food.toLowerCase();
    if (f.startsWith(q)) p.push(d);
    else if (f.includes(q)) c.push(d);
  }
  return [...p, ...c];
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

export default function DictionaryPage() {
  const gender = loadProfile().gender;
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState<DictionaryItem[]>([]);
  const [presetMap, setPresetMap] = useState<Map<string, MealPreset>>(
    () => new Map()
  );
  const [rawQ, setRawQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [explorerRows, setExplorerRows] = useState<ExplorerFoodRow[]>([]);
  const [offRows, setOffRows] = useState<ExplorerFoodRow[]>([]);
  const [extSearchLoading, setExtSearchLoading] = useState(false);
  const [explorerUiTick, setExplorerUiTick] = useState(0);
  const [appliedMealId, setAppliedMealId] = useState<string | null>(null);
  const [shopTick, setShopTick] = useState(0);
  const [shopToast, setShopToast] = useState(false);
  const [editTarget, setEditTarget] = useState<DictionaryItem | null>(null);
  const [editFood, setEditFood] = useState("");
  const [editQtyText, setEditQtyText] = useState("1");
  const [editUnit, setEditUnit] = useState<FoodUnit>("גרם");
  const [editGramsPerUnitText, setEditGramsPerUnitText] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const editTitleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [openSavedId, setOpenSavedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSaved(loadDictionary());
    const m = new Map<string, MealPreset>();
    for (const p of loadMealPresets()) {
      m.set(p.id, p);
    }
    setPresetMap(m);
    setShopTick((x) => x + 1);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const filteredSaved = useMemo(() => sortSavedByQuery(saved, rawQ), [saved, rawQ]);

  const savedHits = useMemo(() => {
    const q = rawQ.trim();
    if (q.length < 2) return null;
    return rankedFuzzySearchByText(filteredSaved, q, {
      getText: (d) => d.food,
      getKey: (d) => d.id,
      limit: 80,
      threshold: 0.34,
    });
  }, [filteredSaved, rawQ]);

  const explorerHits = useMemo(() => {
    const q = debouncedQ.trim();
    if (q.length < 2) return null;
    return rankedFuzzySearchByText(explorerRows, q, {
      getText: (r) => r.name,
      getKey: (r) => `ex:${r.id}`,
      limit: 40,
      threshold: 0.34,
    });
  }, [explorerRows, debouncedQ]);

  const offHits = useMemo(() => {
    const q = debouncedQ.trim();
    if (q.length < 2) return null;
    return rankedFuzzySearchByText(offRows, q, {
      getText: (r) => r.name,
      getKey: (r) => `off:${r.id}`,
      limit: 24,
      threshold: 0.34,
    });
  }, [offRows, debouncedQ]);

  useEffect(() => {
    const t = rawQ.trim();
    if (t.length < 2) {
      setDebouncedQ("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedQ(t), 280);
    return () => window.clearTimeout(id);
  }, [rawQ]);

  useEffect(() => {
    if (debouncedQ.length < 2) {
      setExplorerRows([]);
      setOffRows([]);
      setExtSearchLoading(false);
      return;
    }
    const ac = new AbortController();
    (async () => {
      setExtSearchLoading(true);
      setExplorerRows([]);
      setOffRows([]);
      try {
        const exParams = new URLSearchParams({
          q: debouncedQ,
          sort: "caloriesAsc",
          category: "הכל",
          page: "1",
          pageSize: "40",
        });
        const offParams = new URLSearchParams({
          q: debouncedQ,
          pageSize: "16",
        });
        const [exRes, offRes] = await Promise.all([
          fetch(`/api/food-explorer?${exParams}`, { signal: ac.signal }),
          fetch(`/api/openfoodfacts-search?${offParams}`, { signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;
        if (exRes.ok) {
          const exData = (await exRes.json()) as { items?: ExplorerFoodRow[] };
          setExplorerRows(exData.items ?? []);
        } else {
          setExplorerRows([]);
        }
        if (offRes.ok) {
          const offData = (await offRes.json()) as {
            items?: Array<{
              id: string;
              name: string;
              calories: number;
              protein: number;
              fat: number;
              carbs: number;
            }>;
          };
          setOffRows(
            (offData.items ?? []).map((r) => ({
              id: r.id,
              name: r.name,
              calories: r.calories,
              protein: r.protein,
              fat: r.fat,
              carbs: r.carbs,
              category: "Open Food Facts",
            }))
          );
        } else {
          setOffRows([]);
        }
      } catch {
        if (!ac.signal.aborted) {
          setExplorerRows([]);
          setOffRows([]);
        }
      } finally {
        if (!ac.signal.aborted) setExtSearchLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedQ]);

  const cartLookup = useMemo(() => {
    void shopTick;
    void explorerUiTick;
    return new Set(loadShoppingFoodIds());
  }, [shopTick, explorerUiTick]);

  useEffect(() => {
    if (!shopToast) return;
    const t = window.setTimeout(() => setShopToast(false), 2200);
    return () => window.clearTimeout(t);
  }, [shopToast]);

  function onCartDictionaryItem(d: DictionaryItem) {
    const k100 =
      d.caloriesPer100g != null && Number.isFinite(d.caloriesPer100g)
        ? Math.round(d.caloriesPer100g)
        : 0;
    const added = addToShopping({
      foodId: `dictionary:${d.id}`,
      name: d.food.trim(),
      category: "מילון אישי",
      calories: k100,
      protein: d.proteinPer100g,
      carbs: d.carbsPer100g,
      fat: d.fatPer100g,
    });
    setShopTick((x) => x + 1);
    if (added) setShopToast(true);
  }

  function onCartMealPreset(preset: MealPreset) {
    let anyNew = false;
    preset.components.forEach((c, i) => {
      const added = addToShopping({
        foodId: `dictionary-meal:${preset.id}:${i}`,
        name: c.food.trim(),
        category: `מרכיב: ${preset.name}`,
        calories: kcalPer100FromMealComponent(c),
      });
      if (added) anyNew = true;
    });
    setShopTick((x) => x + 1);
    if (anyNew) setShopToast(true);
  }

  function onExplorerDictionary(row: ExplorerFoodRow) {
    toggleExplorerFoodInDictionary({
      id: row.id,
      name: row.name,
      calories: row.calories,
      protein: row.protein,
      fat: row.fat,
      carbs: row.carbs,
    });
    setExplorerUiTick((x) => x + 1);
    refresh();
  }

  function onExplorerJournal(row: ExplorerFoodRow) {
    const dateKey = getTodayKey();
    const existing = getEntriesForDate(dateKey);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      food: row.name,
      calories: Math.max(1, Math.round(row.calories)),
      quantity: 100,
      unit: "גרם" as const,
      createdAt: new Date().toISOString(),
      verified: true,
      proteinG: Math.round(row.protein * 10) / 10,
      carbsG: Math.round(row.carbs * 10) / 10,
      fatG: Math.round(row.fat * 10) / 10,
    };
    saveDayLogEntries(dateKey, [entry, ...existing]);
    emitMealLoggedFeedback(
      gf(gender, "נוסף ליומן היום.", "נוסף ליומן היום.")
    );
  }

  function onSavedJournal(d: DictionaryItem) {
    const dateKey = getTodayKey();
    const existing = getEntriesForDate(dateKey);

    const k100 =
      d.caloriesPer100g != null && Number.isFinite(d.caloriesPer100g)
        ? Math.max(0, d.caloriesPer100g)
        : null;

    const p100 =
      d.proteinPer100g != null && Number.isFinite(d.proteinPer100g)
        ? Math.max(0, d.proteinPer100g)
        : null;
    const c100 =
      d.carbsPer100g != null && Number.isFinite(d.carbsPer100g)
        ? Math.max(0, d.carbsPer100g)
        : null;
    const f100 =
      d.fatPer100g != null && Number.isFinite(d.fatPer100g)
        ? Math.max(0, d.fatPer100g)
        : null;

    const gPerU =
      d.gramsPerUnit != null && Number.isFinite(d.gramsPerUnit) && d.gramsPerUnit > 0
        ? d.gramsPerUnit
        : null;
    const totalG = servingTotalGrams(d.quantity, d.unit, gPerU);
    const qty = clampJournalQty(d.quantity, d.unit);

    let calories: number;
    let proteinG: number | undefined;
    let carbsG: number | undefined;
    let fatG: number | undefined;
    let unit: FoodUnit = d.unit;
    let quantity = qty;

    if (k100 != null && totalG != null && totalG > 0) {
      const factor = totalG / 100;
      calories = Math.max(1, Math.round(k100 * factor));
      if (p100 != null) proteinG = Math.round(p100 * factor * 10) / 10;
      if (c100 != null) carbsG = Math.round(c100 * factor * 10) / 10;
      if (f100 != null) fatG = Math.round(f100 * factor * 10) / 10;
    } else if (
      d.lastCalories != null &&
      Number.isFinite(d.lastCalories) &&
      d.lastCalories > 0
    ) {
      calories = Math.max(1, Math.round(d.lastCalories));
    } else if (k100 != null) {
      calories = Math.max(1, Math.round(k100));
      if (p100 != null) proteinG = Math.round(p100 * 10) / 10;
      if (c100 != null) carbsG = Math.round(c100 * 10) / 10;
      if (f100 != null) fatG = Math.round(f100 * 10) / 10;
      unit = "גרם";
      quantity = 100;
    } else {
      calories = 1;
    }

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      food: d.food,
      calories,
      quantity,
      unit,
      createdAt: new Date().toISOString(),
      verified: false,
      ...(proteinG != null ? { proteinG } : {}),
      ...(carbsG != null ? { carbsG } : {}),
      ...(fatG != null ? { fatG } : {}),
    };

    saveDayLogEntries(dateKey, [entry, ...existing]);
    emitMealLoggedFeedback(gf(gender, "נוסף ליומן היום.", "נוסף ליומן היום."));
  }

  function onExplorerCart(row: ExplorerFoodRow) {
    const added = addToShopping({
      foodId: row.id,
      name: row.name,
      category: row.category,
      calories: row.calories,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
    });
    setShopTick((x) => x + 1);
    if (added) setShopToast(true);
  }

  function mealFullyInCart(preset: MealPreset): boolean {
    if (preset.components.length === 0) return false;
    return preset.components.every((_, i) =>
      cartLookup.has(`dictionary-meal:${preset.id}:${i}`)
    );
  }

  function applyPreset(preset: MealPreset) {
    applyMealPresetToToday(preset);
    emitMealLoggedFeedback(
      gf(
        gender,
        `הארוחה «${preset.name}» נוספה ליומן היום`,
        `הארוחה «${preset.name}» נוספה ליומן היום`
      )
    );
    setAppliedMealId(preset.id);
    window.setTimeout(() => setAppliedMealId(null), 2500);
  }

  function openEdit(d: DictionaryItem) {
    setEditError(null);
    setEditTarget(d);
    setEditFood(d.food);
    setEditQtyText(String(d.quantity));
    setEditUnit(d.unit);
    setEditGramsPerUnitText(
      d.gramsPerUnit != null && d.gramsPerUnit > 0 ? String(d.gramsPerUnit) : ""
    );
  }

  function closeEdit() {
    setEditTarget(null);
    setEditError(null);
  }

  function saveDictionaryEdit() {
    if (!editTarget) return;
    const name = editFood.trim();
    if (!name) {
      setEditError(dictionaryEditFoodError(gender));
      return;
    }
    const qty = parseQtyForUnit(editQtyText, editUnit);
    const gPerU = parseGramsPerUnitField(editGramsPerUnitText);
    const totalG = servingTotalGrams(qty, editUnit, gPerU);

    const patch: Parameters<typeof patchDictionaryItemById>[1] = {
      food: name,
      quantity: qty,
      unit: editUnit,
      lastCalories: editTarget.lastCalories,
    };

    const c100 = editTarget.caloriesPer100g;
    if (c100 != null && Number.isFinite(c100) && totalG != null) {
      patch.lastCalories = Math.max(1, Math.round(c100 * (totalG / 100)));
    }

    if (editUnit === "יחידה") {
      patch.gramsPerUnit = gPerU ?? undefined;
    }

    const next = patchDictionaryItemById(editTarget.id, patch);
    if (next) {
      setSaved(next);
      closeEdit();
    }
  }

  return (
    <div
      className={`mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 ${fontFood}`}
      dir="rtl"
    >
      {(() => {
        const date = searchParams.get("date");
        const meal = searchParams.get("meal");
        const from = searchParams.get("from");
        const backHref =
          date && meal && from
            ? `/add-food?from=${encodeURIComponent(from)}&date=${encodeURIComponent(
                date
              )}&meal=${encodeURIComponent(meal)}`
            : "/";
        return (
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link
              href={backHref}
              className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
            >
              חזרה
            </Link>
            <div className="w-[4.25rem]" aria-hidden />
          </div>
        );
      })()}
      <motion.h1
        className="heading-page mb-6 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {dictionaryHeading(gender)}
      </motion.h1>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <InfoCard
          gender={gender}
          icon="📖"
          title={dictionaryIntroTitle()}
          body={dictionaryIntroBody(gender)}
          className="mb-5"
        />
      </motion.div>

      {appliedMealId && (
        <p className="mb-4 rounded-xl border border-[var(--border-cherry-soft)] bg-cherry-faint py-2 text-center text-sm font-semibold text-[var(--cherry)]">
          נוסף ליומן היום
        </p>
      )}

      <label className="mb-5 block">
        <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
          חיפוש
        </span>
        <input
          ref={searchInputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={rawQ}
          onChange={(e) => setRawQ(e.target.value)}
          placeholder={dictionarySavedFilterPlaceholder(gender)}
          className="input-luxury-search w-full"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <p className="mt-1 text-[11px] font-medium text-[var(--stem)]/65">
          {gf(
            gender,
            "אותו שדה: למעלה המילון האישי, למטה מאגר פנימי + Open Food Facts (כמו בחיפוש המאוחד בבית).",
            "אותו שדה: למעלה המילון האישי, למטה מאגר פנימי + Open Food Facts (כמו בחיפוש המאוחד בבית)."
          )}
        </p>
      </label>

      <motion.section
        className="glass-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="panel-title-cherry mb-3 text-lg">המילון שלי</h2>
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-[var(--stem)]/70">
              א-ת (לחצי על אות לסינון)
            </p>
            {activeLetter ? (
              <button
                type="button"
                className="rounded-lg border border-[var(--border-cherry-soft)] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[var(--cherry)] shadow-sm"
                onClick={() => setActiveLetter(null)}
              >
                ניקוי סינון
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {HEB_LETTERS.map((l) => {
              const on = activeLetter === l;
              return (
                <button
                  key={l}
                  type="button"
                  className={`shrink-0 rounded-full border-2 px-3 py-1 text-xs font-extrabold shadow-sm transition ${
                    on
                      ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                      : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85 hover:bg-[var(--cherry-muted)]"
                  } ${debouncedQ.length >= 2 ? "opacity-50" : ""}`}
                  disabled={debouncedQ.length >= 2}
                  aria-pressed={on}
                  onClick={() => setActiveLetter(l)}
                >
                  {l}
                </button>
              );
            })}
          </div>
          {debouncedQ.length >= 2 ? (
            <p className="mt-2 text-[11px] font-medium text-[var(--stem)]/60">
              חיפוש פעיל — סינון א-ת מושבת בזמן חיפוש.
            </p>
          ) : null}
        </div>
        {filteredSaved.length === 0 ? (
          <p className="text-[var(--text)]/85">
            {saved.length === 0 && rawQ.trim().length < 2
              ? gf(
                  gender,
                  "עדיין אין כאן פריטים. פריטים מהיומן, ארוחות שמורות מבית וסריקות יופיעו כאן.",
                  "עדיין אין כאן פריטים. פריטים מהיומן, ארוחות שמורות מבית וסריקות יופיעו כאן."
                )
              : saved.length === 0 && rawQ.trim().length >= 2
                ? gf(
                    gender,
                    "המילון האישי עדיין ריק — בדקי למטה במאגר הפנימי, או שמרי מזון מהיומן/ממגלה המזונות.",
                    "המילון האישי עדיין ריק — בדוק למטה במאגר הפנימי, או שמור מזון מהיומן/ממגלה המזונות."
                  )
              : rawQ.trim().length >= 2
                ? gf(
                    gender,
                    "אין התאמה במילון האישי לחיפוש הזה — בדקי למטה במאגר הפנימי.",
                    "אין התאמה במילון האישי לחיפוש הזה — בדוק למטה במאגר הפנימי."
                  )
                : gf(
                    gender,
                    "הקלידי לפחות 2 אותיות כדי לסנן את הרשימה.",
                    "הקלד לפחות 2 אותיות כדי לסנן את הרשימה."
                  )}
          </p>
        ) : (
          <ul className="space-y-2">
            {(
              (() => {
                const base = savedHits ? savedHits.map((h) => h.item) : filteredSaved;
                const sorted = [...base].sort((a, b) =>
                  normalizeTitleForIndex(a.food).localeCompare(normalizeTitleForIndex(b.food), "he")
                );
                if (debouncedQ.length >= 2) return sorted;
                if (!activeLetter) return sorted;
                return sorted.filter((x) => firstHebLetter(x.food) === activeLetter);
              })()
            ).map((d) => {
              const preset =
                d.mealPresetId != null
                  ? presetMap.get(d.mealPresetId)
                  : undefined;
              const isMeal = Boolean(d.mealPresetId && preset);
              const inCart = isMeal
                ? preset != null && mealFullyInCart(preset)
                : cartLookup.has(`dictionary:${d.id}`);
              const isOpen = openSavedId === d.id;
              return (
                <motion.li
                  key={d.id}
                  layout
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3"
                  style={{ boxShadow: "var(--list-row-shadow)" }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-right"
                    onClick={() => setOpenSavedId((x) => (x === d.id ? null : d.id))}
                    aria-expanded={isOpen}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-xs" aria-hidden>
                        🍒
                      </span>
                      <span className="min-w-0 flex-1 break-words text-base font-extrabold leading-snug text-[var(--stem)]">
                        {savedHits
                          ? renderHighlighted(
                              d.food,
                              savedHits.find((x) => x.item.id === d.id)?.ranges ?? []
                            )
                          : d.food}
                      </span>
                      {isMeal && (
                        <span className="shrink-0 rounded-md bg-[var(--cherry-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--cherry)]">
                          ארוחה
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[var(--stem)]/55">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        className="mt-3"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        <div className="flex min-w-0 flex-col gap-2">
                          {!isMeal && (
                            <p className="text-sm text-[var(--text)]/80">
                              {d.quantity} {d.unit}
                              {d.lastCalories != null
                                ? ` · קלוריות (אחרון ביומן): ${d.lastCalories}`
                                : ""}
                            </p>
                          )}

                          {isMeal && preset && (
                            <ul className="space-y-1 text-sm text-[var(--text)]/90">
                              {preset.components.map((c, i) => (
                                <li key={`${d.id}-c-${i}`}>
                                  {c.food} — {c.quantity} {c.unit} ({c.calories} קק״ל)
                                </li>
                              ))}
                            </ul>
                          )}

                          {d.caloriesPer100g != null && !isMeal && (
                            <p className="text-xs text-[var(--text)]/70">
                              ל־100 גרם: {Math.round(d.caloriesPer100g)} קק״ל
                              {d.proteinPer100g != null &&
                                d.carbsPer100g != null &&
                                d.fatPer100g != null && (
                                  <>
                                    {" "}
                                    · ח {d.proteinPer100g.toFixed(1)} · פחם{" "}
                                    {d.carbsPer100g.toFixed(1)} · שומן{" "}
                                    {d.fatPer100g.toFixed(1)} ג׳
                                  </>
                                )}
                              {d.barcode ? ` · ברקוד ${d.barcode}` : ""}
                            </p>
                          )}

                          <div className="mt-2 flex w-full max-w-full flex-wrap items-center justify-center gap-2 border-t border-[var(--border-cherry-soft)]/60 bg-gradient-to-b from-[var(--cherry-muted)]/35 to-transparent px-1 py-2.5 sm:gap-3">
                            {!isMeal && (
                              <button
                                type="button"
                                className="btn-icon-luxury flex min-w-[3.1rem] flex-col justify-center gap-0 py-1.5"
                                title="הוספה ליומן היום לפי מה ששמור במילון (כמות ויחידה)"
                                aria-label="יומן — הוספה ליומן היום"
                                onClick={() => onSavedJournal(d)}
                              >
                                <IconCaption label="יומן">
                                  <IconPlusCircle className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--stem)]" />
                                </IconCaption>
                              </button>
                            )}
                            {!isMeal && (
                              <button
                                type="button"
                                className="btn-icon-luxury flex min-w-[3.1rem] flex-col justify-center gap-0 py-1.5"
                                title="עריכת שם וכמויות"
                                aria-label={`עריכה — עריכת «${d.food}» במילון`}
                                onClick={() => openEdit(d)}
                              >
                                <IconCaption label="עריכה">
                                  <IconPencil className="h-5 w-5 sm:h-6 sm:w-6" />
                                </IconCaption>
                              </button>
                            )}
                            {preset && isMeal ? (
                              <button
                                type="button"
                                className={`btn-icon-luxury flex min-w-[3.1rem] flex-col justify-center gap-0 py-1.5 transition-colors ${
                                  inCart
                                    ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                                    : ""
                                }`}
                                title="הוספת מרכיבי הארוחה לרשימת הקניות"
                                aria-label="קניות — הוספת מרכיבי הארוחה לרשימת הקניות"
                                aria-pressed={inCart}
                                onClick={() => onCartMealPreset(preset)}
                              >
                                <IconCaption label="קניות">
                                  <IconCart
                                    filled={inCart}
                                    className={`h-5 w-5 sm:h-6 sm:w-6 ${
                                      inCart ? "text-[var(--cherry)]" : "text-[var(--stem)]"
                                    }`}
                                  />
                                </IconCaption>
                              </button>
                            ) : !isMeal ? (
                              <button
                                type="button"
                                className={`btn-icon-luxury flex min-w-[3.1rem] flex-col justify-center gap-0 py-1.5 transition-colors ${
                                  inCart
                                    ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                                    : ""
                                }`}
                                title="הוספה לרשימת הקניות במסך הקניות"
                                aria-label="קניות — הוספה לרשימת קניות"
                                aria-pressed={inCart}
                                onClick={() => onCartDictionaryItem(d)}
                              >
                                <IconCaption label="קניות">
                                  <IconCart
                                    filled={inCart}
                                    className={`h-5 w-5 sm:h-6 sm:w-6 ${
                                      inCart ? "text-[var(--cherry)]" : "text-[var(--stem)]"
                                    }`}
                                  />
                                </IconCaption>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setSaved(removeDictionaryItem(d.id))}
                              className="btn-icon-luxury btn-icon-luxury-danger flex min-w-[3.1rem] shrink-0 flex-col justify-center gap-0 py-1.5"
                              aria-label="מחיקה — הסרה מהמילון"
                              title="הסרה מהמילון האישי"
                            >
                              <IconCaption label="מחק">
                                <IconTrash className="h-5 w-5 sm:h-6 sm:w-6" />
                              </IconCaption>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {isMeal && preset && (
                    <button
                      type="button"
                      className="btn-stem mt-3 w-full rounded-xl py-3 text-sm font-semibold"
                      onClick={() => applyPreset(preset)}
                    >
                      הוספה ליומן היום
                    </button>
                  )}
                  {d.mealPresetId && !preset && (
                    <p className="mt-2 text-xs text-[#8b2e2e]">
                      לא נמצאה ארוחה — ניתן להסיר את הרשומה.
                    </p>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.section>

      <motion.section
        className="glass-panel mt-4 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
      >
        <h2 className="panel-title-cherry mb-1 text-lg">מחוץ למילון (פנימי + עולמי)</h2>
        <p className="mb-3 text-xs text-[var(--stem)]/65">
          {gf(
            gender,
            "מאגר פנימי מאומת ו־Open Food Facts — אותו חיפוש כמו בשדה החיפוש למעלה.",
            "מאגר פנימי מאומת ו־Open Food Facts — אותו חיפוש כמו בשדה החיפוש למעלה."
          )}
        </p>
        {debouncedQ.length < 2 ? (
          <p className="text-sm text-[var(--text)]/85">
            {gf(
              gender,
              "כשמקלידים לפחות 2 תווים בשדה למעלה — יוצגו כאן תוצאות מהמאגר הפנימי ומהעולם.",
              "כשמקלידים לפחות 2 תווים בשדה למעלה — יוצגו כאן תוצאות מהמאגר הפנימי ומהעולם."
            )}
          </p>
        ) : extSearchLoading ? (
          <p className="text-center text-sm text-[var(--cherry)]/80">
            {gf(gender, "טוען מאגר פנימי ו־Open Food Facts…", "טוען מאגר פנימי ו־Open Food Facts…")}
          </p>
        ) : explorerRows.length === 0 && offRows.length === 0 ? (
          <p className="text-sm text-[var(--text)]/85">
            {gf(
              gender,
              "לא נמצאו פריטים במאגר הפנימי או ב־Open Food Facts לחיפוש הזה.",
              "לא נמצאו פריטים במאגר הפנימי או ב־Open Food Facts לחיפוש הזה."
            )}
          </p>
        ) : (
          <>
            {explorerRows.length > 0 && (
              <>
                <h3 className="mb-2 text-sm font-extrabold text-[var(--stem)]">מאגר פנימי</h3>
                <ul className="mb-5 space-y-2">
                  {(explorerHits ? explorerHits.map((h) => h.item) : explorerRows).map((row) => {
                    void explorerUiTick;
                    const inDict = isExplorerFoodInDictionary(row.id);
                    const inCart = cartLookup.has(row.id);
                    return (
                      <li
                        key={`ex-${row.id}-${row.name}`}
                        className="flex flex-wrap items-start gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-b from-white to-[var(--welcome-gradient-to)] px-3 py-3"
                        style={{ boxShadow: "var(--explorer-bubble-shadow)" }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-[var(--stem)]">
                            <span
                              className="inline-flex shrink-0 items-center gap-1"
                              title="מאגר פנימי מאומת"
                            >
                              <IconVerified className="h-4 w-4 text-[#d4a017]" />
                              <span className="text-[10px] font-bold text-[var(--stem)]/90" aria-hidden>
                                🔎
                              </span>
                            </span>
                            <span>
                              {explorerHits
                                ? renderHighlighted(
                                    row.name,
                                    explorerHits.find((x) => x.item.id === row.id)?.ranges ?? []
                                  )
                                : row.name}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--cherry)]/75">{row.category}</p>
                          <p className="mt-1 text-sm leading-relaxed text-[var(--stem)]/95">
                            <span className="font-semibold">קלוריות</span>{" "}
                            {Math.round(row.calories)} (ל־100 גרם) ·{" "}
                            <span className="font-semibold">חלבון</span> {row.protein} ·{" "}
                            <span className="font-semibold">פחמימות</span> {row.carbs} ·{" "}
                            <span className="font-semibold">שומן</span> {row.fat}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            className="btn-icon-luxury min-w-[3.25rem] flex-col justify-center gap-0.5 py-2 transition-colors"
                            title="הוספה ליומן היום (100 גרם)"
                            aria-label="יומן — הוספה ליומן היום"
                            onClick={() => onExplorerJournal(row)}
                          >
                            <IconCaption label="יומן">
                              <IconPlusCircle className="h-5 w-5 text-[var(--stem)]" />
                            </IconCaption>
                          </button>
                          <button
                            type="button"
                            className={`btn-icon-luxury min-w-[3.25rem] flex-col justify-center gap-0.5 py-2 transition-colors ${
                              inCart
                                ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                                : ""
                            }`}
                            title="הוספה לרשימת הקניות"
                            aria-label="קניות — הוספה לרשימת קניות"
                            aria-pressed={inCart}
                            onClick={() => onExplorerCart(row)}
                          >
                            <IconCaption label="קניות">
                              <IconCart
                                filled={inCart}
                                className={`h-5 w-5 ${
                                  inCart ? "text-[var(--cherry)]" : "text-[var(--stem)]"
                                }`}
                              />
                            </IconCaption>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {offRows.length > 0 && (
              <>
                <h3 className="mb-2 text-sm font-extrabold text-[var(--stem)]">
                  Open Food Facts (עולמי)
                </h3>
                <ul className="space-y-2">
                  {(offHits ? offHits.map((h) => h.item) : offRows).map((row) => {
                    void explorerUiTick;
                    const inDict = isExplorerFoodInDictionary(row.id);
                    const inCart = cartLookup.has(row.id);
                    return (
                      <li
                        key={`off-${row.id}-${row.name}`}
                        className="flex flex-wrap items-start gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-b from-white to-[var(--welcome-gradient-to)] px-3 py-3"
                        style={{ boxShadow: "var(--explorer-bubble-shadow)" }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-[var(--stem)]">
                            <span className="text-[10px] font-bold text-[var(--stem)]/90" aria-hidden>
                              🌐
                            </span>
                            <span>
                              {offHits
                                ? renderHighlighted(
                                    row.name,
                                    offHits.find((x) => x.item.id === row.id)?.ranges ?? []
                                  )
                                : row.name}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--cherry)]/75">{row.category}</p>
                          <p className="mt-1 text-sm leading-relaxed text-[var(--stem)]/95">
                            <span className="font-semibold">קלוריות</span>{" "}
                            {Math.round(row.calories)} (ל־100 גרם) ·{" "}
                            <span className="font-semibold">חלבון</span> {row.protein} ·{" "}
                            <span className="font-semibold">פחמימות</span> {row.carbs} ·{" "}
                            <span className="font-semibold">שומן</span> {row.fat}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            className="btn-icon-luxury min-w-[3.25rem] flex-col justify-center gap-0.5 py-2 transition-colors"
                            title="הוספה ליומן היום (100 גרם)"
                            aria-label="יומן — הוספה ליומן היום"
                            onClick={() => onExplorerJournal(row)}
                          >
                            <IconCaption label="יומן">
                              <IconPlusCircle className="h-5 w-5 text-[var(--stem)]" />
                            </IconCaption>
                          </button>
                          <button
                            type="button"
                            className={`btn-icon-luxury min-w-[3.25rem] flex-col justify-center gap-0.5 py-2 transition-colors ${
                              inCart
                                ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                                : ""
                            }`}
                            title="הוספה לרשימת הקניות"
                            aria-label="קניות — הוספה לרשימת קניות"
                            aria-pressed={inCart}
                            onClick={() => onExplorerCart(row)}
                          >
                            <IconCaption label="קניות">
                              <IconCart
                                filled={inCart}
                                className={`h-5 w-5 ${
                                  inCart ? "text-[var(--cherry)]" : "text-[var(--stem)]"
                                }`}
                              />
                            </IconCaption>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {explorerRows.length > 0 && (
              <p className="mt-4 text-center">
                <Link
                  href={`/explorer?q=${encodeURIComponent(debouncedQ)}`}
                  className="text-sm font-semibold text-[var(--cherry)] underline-offset-2 hover:underline"
                >
                  {gf(
                    gender,
                    "פתיחה במגלה המלאה (מיון וקטגוריות)",
                    "פתיחה במגלה המלאה (מיון וקטגוריות)"
                  )}
                </Link>
              </p>
            )}
          </>
        )}
      </motion.section>

      <AnimatePresence>
        {shopToast && (
          <motion.div
            role="status"
            className="fixed bottom-24 left-1/2 z-[150] -translate-x-1/2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-5 py-3 text-center text-sm font-semibold text-[var(--cherry)] shadow-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            נוסף לרשימה!
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTarget && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeEdit();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              aria-labelledby={editTitleId}
              className="glass-panel w-full max-w-md space-y-4 p-5 shadow-2xl"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={editTitleId}
                  className="panel-title-cherry text-lg"
                >
                  עריכת פריט במילון
                </h2>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--cherry-muted)]"
                >
                  סגירה
                </button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                  שם
                </span>
                <input
                  type="text"
                  value={editFood}
                  onChange={(e) => setEditFood(e.target.value)}
                  className="input-luxury-dark w-full"
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="min-w-[6rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    כמות
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editQtyText}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setEditQtyText("");
                        return;
                      }
                      const cleaned = raw
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      const parts = cleaned.split(".");
                      setEditQtyText(
                        parts.length <= 1
                          ? parts[0]
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() =>
                      setEditQtyText((x) => {
                        const n = parseFloat(x.replace(",", "."));
                        if (!Number.isFinite(n)) return "1";
                        return String(parseQtyForUnit(x, editUnit));
                      })
                    }
                    className="input-luxury-dark w-full"
                  />
                </label>
                <label className="min-w-[8rem] flex-[2]">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    יחידה
                  </span>
                  <select
                    value={editUnit}
                    onChange={(e) => {
                      const u = e.target.value as FoodUnit;
                      setEditUnit(u);
                      setEditQtyText((q) =>
                        String(parseQtyForUnit(q, u))
                      );
                      if (u !== "יחידה") setEditGramsPerUnitText("");
                    }}
                    className="select-luxury w-full"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {editUnit === "יחידה" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    משקל יחידה (גרם, אופציונלי)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editGramsPerUnitText}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setEditGramsPerUnitText("");
                        return;
                      }
                      const cleaned = raw
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      const parts = cleaned.split(".");
                      setEditGramsPerUnitText(
                        parts.length <= 1
                          ? parts[0]
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() => {
                      const g = parseGramsPerUnitField(editGramsPerUnitText);
                      setEditGramsPerUnitText(
                        g != null ? String(g) : ""
                      );
                    }}
                    placeholder="למשל 120"
                    className="input-luxury-dark w-full"
                  />
                </label>
              )}
              {editTarget.caloriesPer100g != null && (
                <p className="text-xs text-[var(--text)]/75">
                  יש ערכי קלוריות ל־100 ג׳ — הקק״ל למנה יחושבו מחדש כשהכמות
                  בגרם או ביחידה עם משקל יחידה.
                </p>
              )}
              {editError && (
                <p className="text-sm font-semibold text-[#a94444]">
                  {editError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-stem flex-1 rounded-xl py-3 font-semibold"
                  onClick={saveDictionaryEdit}
                >
                  שמירה
                </button>
                <button
                  type="button"
                  className="btn-gold flex-1 rounded-xl py-3 font-semibold"
                  onClick={closeEdit}
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
