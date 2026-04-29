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
import { flushSync } from "react-dom";
import {
  type DictionaryItem,
  type FoodUnit,
  type LogEntry,
  type MealPreset,
  applyMealPresetToToday,
  isExplorerFoodInDictionary,
  getEntriesForDate,
  loadDictionary,
  loadMealPresets,
  loadProfile,
  patchDictionaryItemById,
  removeDictionaryItem,
  resolveJournalTargetDateKey,
  saveDayLogEntries,
  toggleExplorerFoodInDictionary,
} from "@/lib/storage";
import { addToShopping, loadShoppingFoodIds } from "@/lib/explorerStorage";
import {
  IconPencil,
  IconTrash,
  IconPlusCircle,
  IconVerified,
} from "@/components/Icons";
import {
  dictionaryEditFoodError,
  dictionaryIntroBody,
  dictionarySavedFilterPlaceholder,
  gf,
} from "@/lib/hebrewGenderUi";
import Link from "next/link";
import { rankedFuzzySearchByText, type MatchRange } from "@/lib/rankedSearch";
import { matchesAllQueryWords } from "@/lib/foodSearchRules";

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

function StampAction({
  label,
  tone,
  pressed,
  onClick,
  children,
}: {
  label: string;
  tone: "journal" | "shop" | "edit" | "delete";
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "journal"
      ? "stamp-journal"
      : tone === "shop"
        ? "stamp-shop"
        : tone === "edit"
          ? "stamp-edit"
          : "stamp-delete";
  return (
    <button
      type="button"
      className={`stamp-action ${toneCls} ${pressed ? "stamp-action-on" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={pressed}
      title={label}
      aria-label={label}
    >
      <span className="stamp-icon" aria-hidden>
        {children}
      </span>
      <span className="stamp-label">{label}</span>
    </button>
  );
}

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

function sumPresetTotals(preset: MealPreset): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  return preset.components.reduce(
    (acc, c) => ({
      kcal: acc.kcal + (Number.isFinite(c.calories) ? c.calories : 0),
      protein:
        acc.protein + (typeof c.proteinG === "number" ? c.proteinG : 0),
      carbs: acc.carbs + (typeof c.carbsG === "number" ? c.carbsG : 0),
      fat: acc.fat + (typeof c.fatG === "number" ? c.fatG : 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
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

function fmtMacroG(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
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
  const [shopTick, setShopTick] = useState(0);
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
  const [dictTab, setDictTab] = useState<"all" | "foods" | "meals">("all");
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const justAddedTimerRef = useRef<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelectMode, setExportSelectMode] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const isSearching = rawQ.trim().length >= 2;
  const [showSearchFab, setShowSearchFab] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  const filteredSaved = useMemo(() => {
    const t = rawQ.trim();
    if (t.length < 2) return sortSavedByQuery(saved, t);
    const strict = saved.filter((d) => matchesAllQueryWords(d.food, t));
    return sortSavedByQuery(strict, t);
  }, [saved, rawQ]);

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

  const visibleSaved = useMemo(() => {
    const base = savedHits ? savedHits.map((h) => h.item) : filteredSaved;
    const tabbed = base.filter((d) => {
      if (dictTab === "meals") return d.mealPresetId != null;
      if (dictTab === "foods") return d.mealPresetId == null;
      return true;
    });
    const sorted = [...tabbed].sort((a, b) =>
      normalizeTitleForIndex(a.food).localeCompare(
        normalizeTitleForIndex(b.food),
        "he"
      )
    );
    if (debouncedQ.length >= 2) return sorted;
    if (!activeLetter) return sorted;
    return sorted.filter((x) => firstHebLetter(x.food) === activeLetter);
  }, [savedHits, filteredSaved, dictTab, debouncedQ, activeLetter]);

  const exportItems = useMemo(() => {
    if (exportSelectMode && exportSelectedIds.size > 0) {
      const set = exportSelectedIds;
      return saved.filter((x) => set.has(x.id));
    }
    return visibleSaved;
  }, [exportSelectMode, exportSelectedIds, saved, visibleSaved]);

  const externalResultsTitle = "תוצאות חיפוש";

  function downloadTextFile(filename: string, mime: string, content: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function csvEscape(v: unknown): string {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function buildDictionaryCsv(items: DictionaryItem[]): string {
    const headers = [
      "id",
      "food",
      "quantity",
      "unit",
      "gramsPerUnit",
      "lastCalories",
      "caloriesPer100g",
      "proteinPer100g",
      "carbsPer100g",
      "fatPer100g",
      "barcode",
      "source",
      "mealPresetId",
      "mealName",
      "mealComponentsJson",
    ];
    const rows = items.map((d) => {
      const preset = d.mealPresetId ? presetMap.get(d.mealPresetId) : undefined;
      const mealName = preset?.name ?? "";
      const mealComponentsJson = preset
        ? JSON.stringify(preset.components)
        : "";
      const cells = [
        d.id,
        d.food,
        d.quantity,
        d.unit,
        d.gramsPerUnit ?? "",
        d.lastCalories ?? "",
        d.caloriesPer100g ?? "",
        d.proteinPer100g ?? "",
        d.carbsPer100g ?? "",
        d.fatPer100g ?? "",
        d.barcode ?? "",
        d.source ?? "",
        d.mealPresetId ?? "",
        mealName,
        mealComponentsJson,
      ];
      return cells.map(csvEscape).join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  }

  function exportJson() {
    const presetsUsed = new Map<string, MealPreset>();
    for (const d of exportItems) {
      if (!d.mealPresetId) continue;
      const p = presetMap.get(d.mealPresetId);
      if (p) presetsUsed.set(p.id, p);
    }
    const filename = `calorie-journal-dictionary-${new Date().toISOString().slice(0, 10)}.json`;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      scope: exportSelectMode && exportSelectedIds.size > 0 ? "selected" : "visible",
      filters: {
        tab: dictTab,
        letter: activeLetter,
        query: rawQ.trim(),
      },
      items: exportItems,
      mealPresets: Array.from(presetsUsed.values()),
    };
    downloadTextFile(
      filename,
      "application/json;charset=utf-8",
      JSON.stringify(payload, null, 2)
    );
  }

  function exportCsv() {
    const csv = buildDictionaryCsv(exportItems);
    const filename = `calorie-journal-dictionary-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(
      filename,
      "text/csv;charset=utf-8",
      csv
    );
  }

  function exportPdf() {
    const title =
      exportSelectMode && exportSelectedIds.size > 0
        ? "המילון שלי — נבחרים"
        : "המילון שלי — מסונן";
    const safe = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const rowsHtml = exportItems
      .map((d) => {
        const preset = d.mealPresetId ? presetMap.get(d.mealPresetId) : undefined;
        const mealBlock = preset
          ? `<div class="meal">
              <div class="meal-title">ארוחה: ${safe(preset.name)}</div>
              <ul class="meal-list">
                ${preset.components
                  .map(
                    (c) =>
                      `<li>${safe(c.food)} — ${c.quantity} ${safe(
                        c.unit
                      )} (${c.calories} קק״ל)</li>`
                  )
                  .join("")}
              </ul>
            </div>`
          : "";
        const macros =
          d.proteinPer100g != null ||
          d.carbsPer100g != null ||
          d.fatPer100g != null
            ? ` · ח ${d.proteinPer100g ?? ""} · פחם ${d.carbsPer100g ?? ""} · שומן ${
                d.fatPer100g ?? ""
              }`
            : "";
        const cals100 =
          d.caloriesPer100g != null ? `ל־100 גרם: ${d.caloriesPer100g} קק״ל` : "";
        const barcode = d.barcode ? ` · ברקוד ${safe(d.barcode)}` : "";
        const source = d.source ? ` · מקור: ${safe(d.source)}` : "";
        return `<div class="row">
          <div class="name">${safe(d.food)}</div>
          <div class="meta">כמות ברירת מחדל: ${d.quantity} ${safe(
          d.unit
        )}${d.gramsPerUnit ? ` · ${d.gramsPerUnit} גרם ליחידה` : ""}</div>
          <div class="meta">${safe(cals100)}${safe(macros)}${barcode}${source}</div>
          ${mealBlock}
        </div>`;
      })
      .join("");
    const html = `<!doctype html>
      <html dir="rtl" lang="he">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safe(title)}</title>
        <style>
          body{font-family:Calibri,Segoe UI,Arial,sans-serif; margin:24px; color:#111;}
          h1{margin:0 0 6px 0; font-size:20px;}
          .sub{font-size:12px; color:#444; margin-bottom:14px;}
          .row{border:1px solid #ddd; border-radius:10px; padding:12px 12px; margin:0 0 10px 0;}
          .name{font-weight:800; font-size:16px; margin-bottom:4px;}
          .meta{font-size:12px; color:#333; margin-top:2px; line-height:1.35;}
          .meal{margin-top:8px; padding-top:8px; border-top:1px dashed #ddd;}
          .meal-title{font-weight:800; font-size:12px; color:#222; margin-bottom:6px;}
          .meal-list{margin:0; padding:0 16px 0 0; font-size:12px; color:#333;}
        </style>
      </head>
      <body>
        <h1>${safe(title)}</h1>
        <div class="sub">נוצר בתאריך: ${safe(
          new Date().toLocaleString("he-IL")
        )} · פריטים: ${exportItems.length}</div>
        ${rowsHtml || `<div class="sub">אין פריטים לייצוא.</div>`}
        <script>
          setTimeout(() => { window.print(); }, 250);
        </script>
      </body>
      </html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

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
          const mapped = (offData.items ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            calories: r.calories,
            protein: r.protein,
            fat: r.fat,
            carbs: r.carbs,
            category: "Open Food Facts",
          }));
          setOffRows(mapped);
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

  useMemo(() => {
    // keep shopping ids cache fresh for other screens; this screen doesn't show shopping actions
    void shopTick;
    void explorerUiTick;
    return new Set(loadShoppingFoodIds());
  }, [shopTick, explorerUiTick]);

  useEffect(() => {
    return () => {
      if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setShowSearchFab(window.scrollY > 520);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function flashAdded(id: string) {
    setJustAddedId(id);
    if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
    justAddedTimerRef.current = window.setTimeout(() => setJustAddedId(null), 900);
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
    flashAdded(row.id);
  }

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
    if (added) {
      // re-use the existing toast UX (no dedicated toast component)
      setJustAddedId(`shop:${d.id}`);
      if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
      justAddedTimerRef.current = window.setTimeout(() => setJustAddedId(null), 900);
    }
  }

  function onSavedJournal(d: DictionaryItem) {
    const dateKey = resolveJournalTargetDateKey({ allowFuture: true });
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

    let calories: number;
    let proteinG: number | undefined;
    let carbsG: number | undefined;
    let fatG: number | undefined;

    if (k100 != null && totalG != null && totalG > 0) {
      const factor = totalG / 100;
      calories = Math.max(1, Math.round(k100 * factor));
      if (p100 != null) proteinG = Math.round(p100 * factor * 10) / 10;
      if (c100 != null) carbsG = Math.round(c100 * factor * 10) / 10;
      if (f100 != null) fatG = Math.round(f100 * factor * 10) / 10;
    } else if (d.lastCalories != null && Number.isFinite(d.lastCalories) && d.lastCalories > 0) {
      calories = Math.max(1, Math.round(d.lastCalories));
    } else if (k100 != null) {
      calories = Math.max(1, Math.round(k100));
      if (p100 != null) proteinG = Math.round(p100 * 10) / 10;
      if (c100 != null) carbsG = Math.round(c100 * 10) / 10;
      if (f100 != null) fatG = Math.round(f100 * 10) / 10;
    } else {
      calories = 1;
    }

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      food: d.food,
      calories,
      quantity: d.quantity,
      unit: d.unit,
      createdAt: new Date().toISOString(),
      verified: false,
      ...(proteinG != null ? { proteinG } : {}),
      ...(carbsG != null ? { carbsG } : {}),
      ...(fatG != null ? { fatG } : {}),
    };
    saveDayLogEntries(dateKey, [entry, ...existing]);
    setJustAddedId(`journal:${d.id}`);
    if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
    justAddedTimerRef.current = window.setTimeout(() => setJustAddedId(null), 900);
  }

  function applyPreset(preset: MealPreset) {
    applyMealPresetToToday(preset);
    setJustAddedId(`journal:meal:${preset.id}`);
    if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
    justAddedTimerRef.current = window.setTimeout(() => setJustAddedId(null), 900);
  }

  // Dictionary screen is focused on saving foods; no journal/shopping actions here.

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
    if (editTarget.mealPresetId) {
      const next = patchDictionaryItemById(editTarget.id, { food: name });
      if (next) {
        setSaved(next);
        closeEdit();
      }
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
      <motion.h1
        className="heading-page mb-6 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="inline-flex items-center justify-center gap-2">
          <span>המילון האישי שלי</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--border-cherry-soft)] bg-white text-base font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
            aria-label="הסבר"
            title="הסבר"
            onClick={() => setHelpOpen((x) => !x)}
          >
            ?
          </button>
        </span>
      </motion.h1>

      {helpOpen ? (
        <motion.div
          className="mb-5 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-3 text-right shadow-[0_8px_24px_var(--panel-shadow-soft)]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm leading-relaxed text-[var(--text)]/85">
            {dictionaryIntroBody(gender)}
          </p>
        </motion.div>
      ) : null}

      <div className="sticky top-0 z-40 -mx-4 mb-5 border-b border-[var(--border-cherry-soft)]/70 bg-white/90 px-4 pb-4 pt-3 backdrop-blur">
        <label className="block">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={rawQ}
              onChange={(e) => setRawQ(e.target.value)}
              placeholder={dictionarySavedFilterPlaceholder(gender)}
              className="input-luxury-search w-full pe-14"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {rawQ.trim() ? (
              <button
                type="button"
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                onClick={() => {
                  setRawQ("");
                  setOpenSavedId(null);
                  setActiveLetter(null);
                  setDictTab("all");
                  queueMicrotask(() => searchInputRef.current?.focus());
                }}
                aria-label="ניקוי חיפוש"
                title="ניקוי חיפוש"
              >
                ×
              </button>
            ) : null}
          </div>
        </label>
      </div>

      {showSearchFab ? (
        <button
          type="button"
          className="fixed bottom-24 end-3 z-50 grid h-12 w-12 place-items-center rounded-full border-2 border-[var(--border-cherry-soft)] bg-white text-lg font-extrabold text-[var(--stem)] shadow-brand-cta transition hover:bg-[var(--cherry-muted)]"
          onClick={() => {
            setOpenSavedId(null);
            setExportOpen(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
            setTimeout(() => searchInputRef.current?.focus(), 250);
          }}
          aria-label="חיפוש חדש"
          title="חיפוש חדש"
        >
          🔎
        </button>
      ) : null}

      {isSearching && (
        <motion.section
          className="glass-panel mt-4 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
        >
          <h2 className="panel-title-cherry mb-1 text-lg">{externalResultsTitle}</h2>
          {debouncedQ.length < 2 ? null : extSearchLoading ? (
            <p className="text-center text-sm text-[var(--cherry)]/80">
              {gf(gender, "טוען תוצאות…", "טוען תוצאות…")}
            </p>
          ) : explorerRows.length === 0 && offRows.length === 0 ? (
            <p className="text-sm text-[var(--text)]/85">
              {gf(gender, "לא נמצאו פריטים לחיפוש הזה.", "לא נמצאו פריטים לחיפוש הזה.")}
            </p>
          ) : (
            <>
              {explorerRows.length > 0 && (
                <>
                  <h3 className="mb-2 text-sm font-extrabold text-[var(--stem)]">
                    מאגר אינטליגנציה קלורית
                  </h3>
                  <ul className="mb-5 space-y-2">
                    {(explorerHits ? explorerHits.map((h) => h.item) : explorerRows).map((row) => {
                      void explorerUiTick;
                      const inDict = isExplorerFoodInDictionary(row.id);
                      return (
                        <li
                          key={`ex-${row.id}-${row.name}`}
                          className="flex flex-wrap items-start gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-b from-white to-[var(--welcome-gradient-to)] px-3 py-3"
                          style={{ boxShadow: "var(--explorer-bubble-shadow)" }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-[var(--cherry)]">
                              <span
                                className="inline-flex shrink-0 items-center gap-1"
                                title="מאגר אינטליגנציה קלורית מאומת"
                              >
                                <IconVerified className="h-4 w-4 text-[#d4a017]" />
                                <span
                                  className="text-[10px] font-bold text-[var(--stem)]/90"
                                  aria-hidden
                                >
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
                          <div className="flex shrink-0">
                            <button
                              type="button"
                              className={`btn-icon-luxury min-w-[3.25rem] flex-col justify-center gap-0.5 py-2 transition-colors ${
                                inDict || justAddedId === row.id
                                  ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                                  : ""
                              }`}
                              title={inDict ? "כבר במילון" : "הוספה למילון"}
                              aria-label={inDict ? "כבר במילון" : "הוספה למילון"}
                              aria-pressed={inDict || justAddedId === row.id}
                              onClick={() => onExplorerDictionary(row)}
                            >
                              <span className="inline-flex flex-col items-center">
                                {inDict || justAddedId === row.id ? (
                                  <span
                                    className="text-xl font-extrabold text-[var(--stem)]"
                                    aria-hidden
                                  >
                                    ✓
                                  </span>
                                ) : (
                                  <IconPlusCircle className="h-7 w-7 text-[var(--stem)]" />
                                )}
                              </span>
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
                    Open Food Facts
                  </h3>
                  <ul className="space-y-2">
                    {(offHits ? offHits.map((h) => h.item) : offRows).map((row) => {
                      void explorerUiTick;
                      const inDict = isExplorerFoodInDictionary(row.id);
                      return (
                        <li
                          key={`off-${row.id}-${row.name}`}
                          className="flex flex-wrap items-start gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-b from-white to-[var(--welcome-gradient-to)] px-3 py-3"
                          style={{ boxShadow: "var(--explorer-bubble-shadow)" }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-[var(--cherry)]">
                              <span
                                className="text-[10px] font-bold text-[var(--stem)]/90"
                                aria-hidden
                              >
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
                          <div className="flex shrink-0">
                            <button
                              type="button"
                              className={`btn-icon-luxury min-w-[3.25rem] flex-col justify-center gap-0.5 py-2 transition-colors ${
                                inDict || justAddedId === row.id
                                  ? "bg-[var(--cherry-muted)] ring-2 ring-[var(--border-cherry-soft)]"
                                  : ""
                              }`}
                              title={inDict ? "כבר במילון" : "הוספה למילון"}
                              aria-label={inDict ? "כבר במילון" : "הוספה למילון"}
                              aria-pressed={inDict || justAddedId === row.id}
                              onClick={() => onExplorerDictionary(row)}
                            >
                              <span className="inline-flex flex-col items-center">
                                {inDict || justAddedId === row.id ? (
                                  <span
                                    className="text-xl font-extrabold text-[var(--stem)]"
                                    aria-hidden
                                  >
                                    ✓
                                  </span>
                                ) : (
                                  <IconPlusCircle className="h-7 w-7 text-[var(--stem)]" />
                                )}
                              </span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </motion.section>
      )}

      <motion.section
        className={`glass-panel p-4 ${isSearching ? "mt-4" : ""}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="panel-title-cherry text-xl">המילון שלי</h2>
          <div className="flex w-[8.75rem] flex-col gap-1.5">
            <Link
              href="/explorer"
              className="w-full rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-2.5 py-1 text-center text-[11px] font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
            >
              גלה מזונות
            </Link>
            <button
              type="button"
              className={`w-full rounded-lg border-2 px-2.5 py-1 text-center text-[11px] font-extrabold leading-tight shadow-sm transition ${
                exportSelectMode
                  ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                  : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85 hover:bg-[var(--cherry-muted)]"
              }`}
              onClick={() => {
                setExportSelectMode((x) => !x);
                setExportSelectedIds(new Set());
                setOpenSavedId(null);
              }}
              aria-pressed={exportSelectMode}
            >
              {exportSelectMode ? "סיום בחירה" : "בחירה לייצוא"}
            </button>
            <button
              type="button"
              className="w-full rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-2.5 py-1 text-center text-[11px] font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={() => setExportOpen(true)}
            >
              ייצוא
            </button>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "הכל"],
                ["foods", "מוצרים"],
                ["meals", "ארוחות"],
              ] as const
            ).map(([id, label]) => {
              const on = dictTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition-colors ${
                    on
                      ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                      : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85 hover:bg-[var(--cherry-muted)]"
                  }`}
                  onClick={() => setDictTab(id)}
                  aria-pressed={on}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {activeLetter ? (
            <button
              type="button"
              className="rounded-lg border border-[var(--border-cherry-soft)] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[var(--cherry)] shadow-sm"
              onClick={() => setActiveLetter(null)}
            >
              ניקוי אות
            </button>
          ) : null}
        </div>
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-[var(--stem)]/70">
              א-ת (לחצי על אות לסינון)
            </p>
          </div>
          <div className="mt-2 grid grid-cols-11 gap-1">
            {HEB_LETTERS.map((l) => {
              const on = activeLetter === l;
              return (
                <button
                  key={l}
                  type="button"
                  className={`rounded-lg border-2 py-2 text-xs font-extrabold shadow-sm transition ${
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
                    "המילון האישי עדיין ריק — בדקי למטה במאגר אינטליגנציה קלורית, או שמרי מזון מהיומן/ממגלה המזונות.",
                    "המילון האישי עדיין ריק — בדוק למטה במאגר אינטליגנציה קלורית, או שמור מזון מהיומן/ממגלה המזונות."
                  )
              : rawQ.trim().length >= 2
                ? gf(
                    gender,
                    "אין התאמה במילון האישי לחיפוש הזה — בדקי למטה במאגר אינטליגנציה קלורית.",
                    "אין התאמה במילון האישי לחיפוש הזה — בדוק למטה במאגר אינטליגנציה קלורית."
                  )
                : gf(
                    gender,
                    "הקלידי לפחות 2 אותיות כדי לסנן את הרשימה.",
                    "הקלד לפחות 2 אותיות כדי לסנן את הרשימה."
                  )}
          </p>
        ) : (
          <ul className="notebook-list space-y-2">
            {visibleSaved.map((d) => {
              const preset =
                d.mealPresetId != null
                  ? presetMap.get(d.mealPresetId)
                  : undefined;
              const isMeal = Boolean(d.mealPresetId && preset);
              const isOpen = openSavedId === d.id;
              const isSelected = exportSelectedIds.has(d.id);
              return (
                <motion.li key={d.id} layout className="notebook-row">
                  <div className="flex items-start justify-between gap-3">
                    {exportSelectMode ? (
                      <button
                        type="button"
                        className="mt-1 shrink-0 rounded-md border-2 border-[var(--border-cherry-soft)] bg-white p-1 shadow-sm"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          flushSync(() => {
                            setExportSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.id)) next.delete(d.id);
                              else next.add(d.id);
                              return next;
                            });
                          });
                        }}
                        aria-label="בחירת פריט לייצוא"
                        title="בחירת פריט לייצוא"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--cherry)]"
                          checked={isSelected}
                          readOnly
                          aria-hidden
                        />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-right"
                      onClick={() => setOpenSavedId((x) => (x === d.id ? null : d.id))}
                      aria-expanded={isOpen}
                    >
                      <span className="text-xs" aria-hidden>
                        🍒
                      </span>
                      <span className="min-w-0 flex-1 break-words text-base font-extrabold leading-snug text-[var(--cherry)]">
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
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        className="rounded-md border border-[var(--border-cherry-soft)] bg-white p-1.5 text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSaved(removeDictionaryItem(d.id));
                        }}
                        aria-label="מחיקה — הסרה מהמילון"
                        title="מחיקה"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                      <div className="shrink-0 text-xs font-bold text-[var(--stem)]/55">
                        {isOpen ? "▲" : "▼"}
                      </div>
                    </div>
                  </div>

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
                            </p>
                          )}

                          {isMeal && preset && (
                            <>
                              <ul className="space-y-1 text-sm text-[var(--text)]/90">
                                {preset.components.map((c, i) => (
                                  <li key={`${d.id}-c-${i}`}>
                                    {c.food} — {c.quantity} {c.unit} ({c.calories}{" "}
                                    קק״ל)
                                    <span className="text-[var(--stem)]/75">
                                      {" "}
                                      · ח {fmtMacroG(c.proteinG)} · פחם{" "}
                                      {fmtMacroG(c.carbsG)} · שומן {fmtMacroG(c.fatG)}{" "}
                                      ג׳
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {(() => {
                                const s = sumPresetTotals(preset);
                                return (
                                  <p className="text-sm font-extrabold text-[var(--stem)]">
                                    סה״כ ארוחה: {Math.round(s.kcal)} קק״ל · ח{" "}
                                    {s.protein.toFixed(1)} · פחם {s.carbs.toFixed(1)} ·
                                    שומן {s.fat.toFixed(1)} ג׳
                                  </p>
                                );
                              })()}
                            </>
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
                            {!isMeal ? (
                              <>
                                <StampAction
                                  label="ליומן"
                                  tone="journal"
                                  pressed={justAddedId === `journal:${d.id}`}
                                  onClick={() => onSavedJournal(d)}
                                >
                                  {justAddedId === `journal:${d.id}` ? (
                                    <span className="text-[12px] font-extrabold">✓</span>
                                  ) : (
                                    <IconPlusCircle className="h-4 w-4" />
                                  )}
                                </StampAction>
                                <StampAction
                                  label="לקניות"
                                  tone="shop"
                                  pressed={justAddedId === `shop:${d.id}`}
                                  onClick={() => onCartDictionaryItem(d)}
                                >
                                  {justAddedId === `shop:${d.id}` ? (
                                    <span className="text-[12px] font-extrabold">✓</span>
                                  ) : (
                                    <IconPlusCircle className="h-4 w-4" />
                                  )}
                                </StampAction>
                              </>
                            ) : preset ? (
                              <StampAction
                                label="ליומן"
                                tone="journal"
                                pressed={justAddedId === `journal:meal:${preset.id}`}
                                onClick={() => applyPreset(preset)}
                              >
                                {justAddedId === `journal:meal:${preset.id}` ? (
                                  <span className="text-[12px] font-extrabold">✓</span>
                                ) : (
                                  <IconPlusCircle className="h-4 w-4" />
                                )}
                              </StampAction>
                            ) : null}

                            <StampAction
                              label="עריכה"
                              tone="edit"
                              onClick={() => openEdit(d)}
                            >
                              <IconPencil className="h-4 w-4" />
                            </StampAction>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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

      <AnimatePresence>
        {exportOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExportOpen(false)}
          >
            <motion.div
              className="glass-panel w-full max-w-md p-4"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h3 className="panel-title-cherry text-base">ייצוא מילון</h3>
                  <p className="mt-1 text-xs text-[var(--stem)]/70">
                    {exportSelectMode && exportSelectedIds.size > 0
                      ? `נבחרו ${exportSelectedIds.size} פריטים`
                      : `ייצוא של הרשימה המסוננת (${exportItems.length})`}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => setExportOpen(false)}
                  aria-label="סגירה"
                  title="סגירה"
                >
                  ×
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => {
                    exportPdf();
                    setExportOpen(false);
                  }}
                >
                  PDF (להדפסה/שליחה)
                </button>
                <button
                  type="button"
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => {
                    exportCsv();
                    setExportOpen(false);
                  }}
                >
                  CSV (אקסל / Sheets)
                </button>
                <button
                  type="button"
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => {
                    exportJson();
                    setExportOpen(false);
                  }}
                >
                  JSON (גיבוי מלא)
                </button>
              </div>

              <p className="mt-3 text-[11px] text-[var(--text)]/70">
                טיפ: אפשר לסנן קודם עם טאב/אות/חיפוש ואז לייצא (אופציה A). אם מפעילים “בחירת פריטים”
                ומסמנים—הייצוא יהיה רק של הנבחרים (אופציה B).
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* (Removed) External results card below. Results appear above while searching. */}

      {/* No shopping toast in Dictionary screen */}

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
                  {editTarget.mealPresetId
                    ? "עריכת ארוחה במילון"
                    : "עריכת פריט במילון"}
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
              {editTarget.mealPresetId ? (
                <p className="text-xs font-medium leading-relaxed text-[var(--stem)]/75">
                  {gf(
                    gender,
                    "עריכת שם הארוחה בלבד. רכיבי הארוחה נשארים כפי ששמרת מהיומן.",
                    "עריכת שם הארוחה בלבד. רכיבי הארוחה נשארים כפי ששמרת מהיומן."
                  )}
                </p>
              ) : (
                <>
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
                </>
              )}
              {editTarget.caloriesPer100g != null && !editTarget.mealPresetId && (
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
