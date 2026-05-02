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
  IconTrash,
  IconPlusCircle,
  IconVerified,
} from "@/components/Icons";
import {
  dictionaryIntroBody,
  dictionarySavedFilterPlaceholder,
  gf,
} from "@/lib/hebrewGenderUi";
import { useDocumentScrollOnlyIfOverflowing } from "@/lib/useDocumentScrollOnlyIfOverflowing";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Pencil,
  PlusCircle,
  ShoppingCart,
} from "lucide-react";
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
  brand?: string;
};

/** כפתורי הפעולה בתחתית כרטיס מוצר נפתח במילון — עיצוב אחיד בלבד */
function DictionaryExpandedTripleAction({
  label,
  pressed,
  onClick,
  icon,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-[20px] border border-[#B5173A] bg-transparent px-3 py-2 text-sm font-extrabold text-[#B5173A] transition hover:bg-[#B5173A]/[0.07] active:opacity-90 ${
        pressed ? "bg-[#B5173A]/[0.08]" : ""
      }`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={pressed}
      title={label}
      aria-label={label}
    >
      <span className="shrink-0 text-[#B5173A]" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
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

function explicitShoppingCategory(d: DictionaryItem): string | null {
  const t = d.foodCategory?.trim();
  return t || null;
}

async function resolveShoppingCategoryForDictionaryItem(
  d: DictionaryItem
): Promise<string> {
  const explicit = explicitShoppingCategory(d);
  if (explicit) return explicit;
  try {
    const res = await fetch(
      `/api/food-category-lookup?q=${encodeURIComponent(d.food)}`
    );
    if (res.ok) {
      const data = (await res.json()) as { category?: string | null };
      const cat = data.category?.trim();
      if (cat) return cat;
    }
  } catch {
    /* ignore */
  }
  return "מילון אישי";
}

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
        acc.protein +
        (Number.isFinite(c.proteinG) ? (c.proteinG ?? 0) : 0),
      carbs:
        acc.carbs + (Number.isFinite(c.carbsG) ? (c.carbsG ?? 0) : 0),
      fat: acc.fat + (Number.isFinite(c.fatG) ? (c.fatG ?? 0) : 0),
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

/** כמות בשדה במודאלים (יומן / עריכת כמות במילון) — 0 נשאר 0; מעל 0 — חוקי תחום כמו בשמירת מילון */
function parseQtyAllowZero(text: string, unit: FoodUnit): number {
  const n = parseFloat(text.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
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

function servingScaleRatioFromDictionaryDefault(
  d: DictionaryItem,
  qty: number,
  unit: FoodUnit,
  gramsPerUnitResolved: number | null
): number | null {
  const newG = servingTotalGrams(qty, unit, gramsPerUnitResolved);
  const baseG = servingTotalGrams(
    d.quantity,
    d.unit,
    d.gramsPerUnit != null &&
      Number.isFinite(d.gramsPerUnit) &&
      d.gramsPerUnit > 0
      ? d.gramsPerUnit
      : null
  );
  if (newG != null && baseG != null && baseG > 0) {
    return newG / baseG;
  }
  if (unit !== d.unit) return null;
  if (unit === "יחידה") {
    const gNew =
      gramsPerUnitResolved != null &&
      Number.isFinite(gramsPerUnitResolved) &&
      gramsPerUnitResolved > 0
        ? gramsPerUnitResolved
        : null;
    const gBase =
      d.gramsPerUnit != null &&
      Number.isFinite(d.gramsPerUnit) &&
      d.gramsPerUnit > 0
        ? d.gramsPerUnit
        : null;
    if (gNew != null && gBase != null && d.quantity > 0) {
      const ng = qty * gNew;
      const bg = d.quantity * gBase;
      if (bg > 0) return ng / bg;
    }
    return null;
  }
  if (d.quantity > 0) return qty / d.quantity;
  return null;
}

/** מנה ליומן לפי פריט מילון + כמות/יחידה (בלי לעדכן את המילון) */
function buildLogEntryFromDictionaryServing(
  d: DictionaryItem,
  qty: number,
  unit: FoodUnit,
  gramsPerUnitResolved: number | null,
  mealPreset?: MealPreset | null
): LogEntry {
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      food: d.food,
      calories: 0,
      quantity: 0,
      unit,
      createdAt: new Date().toISOString(),
      verified: false,
    };
  }

  /** ארוחה שמורה: סיכום מהרכיבים (לא לפי 100 ג׳) — כמו applyMealPresetToToday */
  let resolvedMealPreset: MealPreset | null = null;
  if (d.mealPresetId) {
    if (mealPreset?.id === d.mealPresetId) {
      resolvedMealPreset = mealPreset;
    } else {
      resolvedMealPreset =
        loadMealPresets().find((p) => p.id === d.mealPresetId) ?? null;
    }
  }
  if (resolvedMealPreset) {
    const totals = sumPresetTotals(resolvedMealPreset);
    let scaleR = servingScaleRatioFromDictionaryDefault(
      d,
      qty,
      unit,
      gramsPerUnitResolved
    );
    if (scaleR == null && d.quantity > 0) {
      scaleR = qty / d.quantity;
    }
    if (scaleR == null || !Number.isFinite(scaleR)) scaleR = 1;

    const calories = Math.max(1, Math.round(totals.kcal * scaleR));
    const proteinG =
      totals.protein > 0
        ? Math.round(totals.protein * scaleR * 10) / 10
        : undefined;
    const carbsG =
      totals.carbs > 0
        ? Math.round(totals.carbs * scaleR * 10) / 10
        : undefined;
    const fatG =
      totals.fat > 0
        ? Math.round(totals.fat * scaleR * 10) / 10
        : undefined;

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      food: d.food,
      calories,
      quantity: qty,
      unit,
      createdAt: new Date().toISOString(),
      verified: false,
      ...(proteinG != null ? { proteinG } : {}),
      ...(carbsG != null ? { carbsG } : {}),
      ...(fatG != null ? { fatG } : {}),
      aiBreakdownJson: JSON.stringify({
        type: "meal-preset",
        presetId: resolvedMealPreset.id,
        name: resolvedMealPreset.name,
        components: resolvedMealPreset.components,
      }),
    };
  }

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

  const totalG = servingTotalGrams(qty, unit, gramsPerUnitResolved);
  const scaleR = servingScaleRatioFromDictionaryDefault(
    d,
    qty,
    unit,
    gramsPerUnitResolved
  );

  let calories: number;
  let proteinG: number | undefined;
  let carbsG: number | undefined;
  let fatG: number | undefined;

  /** שורת ארוחה במילון אינה „ל־100 ג׳” — בלי preset זה נשארים ב־last* */
  const skipPer100BecauseMealRow = Boolean(d.mealPresetId);

  if (
    !skipPer100BecauseMealRow &&
    k100 != null &&
    totalG != null &&
    totalG > 0
  ) {
    const factor = totalG / 100;
    calories = Math.max(0, Math.round(k100 * factor));
    if (p100 != null) proteinG = Math.round(p100 * factor * 10) / 10;
    if (c100 != null) carbsG = Math.round(c100 * factor * 10) / 10;
    if (f100 != null) fatG = Math.round(f100 * factor * 10) / 10;
  } else if (
    scaleR != null &&
    d.lastCalories != null &&
    Number.isFinite(d.lastCalories) &&
    d.lastCalories > 0
  ) {
    calories = Math.max(0, Math.round(d.lastCalories * scaleR));
    if (d.lastProteinG != null && Number.isFinite(d.lastProteinG)) {
      proteinG = Math.round(d.lastProteinG * scaleR * 10) / 10;
    }
    if (d.lastCarbsG != null && Number.isFinite(d.lastCarbsG)) {
      carbsG = Math.round(d.lastCarbsG * scaleR * 10) / 10;
    }
    if (d.lastFatG != null && Number.isFinite(d.lastFatG)) {
      fatG = Math.round(d.lastFatG * scaleR * 10) / 10;
    }
  } else if (
    d.lastCalories != null &&
    Number.isFinite(d.lastCalories) &&
    d.lastCalories > 0
  ) {
    calories = Math.max(0, Math.round(d.lastCalories));
    if (d.lastProteinG != null && Number.isFinite(d.lastProteinG)) {
      proteinG = Math.round(d.lastProteinG * 10) / 10;
    }
    if (d.lastCarbsG != null && Number.isFinite(d.lastCarbsG)) {
      carbsG = Math.round(d.lastCarbsG * 10) / 10;
    }
    if (d.lastFatG != null && Number.isFinite(d.lastFatG)) {
      fatG = Math.round(d.lastFatG * 10) / 10;
    }
  } else if (k100 != null && !skipPer100BecauseMealRow) {
    calories = Math.max(0, Math.round(k100));
    if (p100 != null) proteinG = Math.round(p100 * 10) / 10;
    if (c100 != null) carbsG = Math.round(c100 * 10) / 10;
    if (f100 != null) fatG = Math.round(f100 * 10) / 10;
  } else {
    calories = 0;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    food: d.food,
    calories,
    quantity: qty,
    unit,
    createdAt: new Date().toISOString(),
    verified: false,
    ...(proteinG != null ? { proteinG } : {}),
    ...(carbsG != null ? { carbsG } : {}),
    ...(fatG != null ? { fatG } : {}),
  };
}

function servingTotalGrams(
  qty: number,
  unit: FoodUnit,
  gramsPerUnit: number | null
): number | null {
  if (unit === "גרם") {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    return clampGramQty(qty);
  }
  if (unit === "יחידה" && gramsPerUnit != null && gramsPerUnit > 0) {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    return clampGramQty(qty * gramsPerUnit);
  }
  return null;
}

function fmtMacroG(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

/** מאקרו בכרטיס מוצר נפתח במילון — שם + מספר באותו צבע */
const DICT_CARD_MACRO_P = "font-semibold text-[#F5C518]";
const DICT_CARD_MACRO_C = "font-semibold text-[#3B82F6]";
const DICT_CARD_MACRO_F = "font-semibold text-[#22C55E]";

/** נשמר מהיומן (או רשומה ישנה בלי source) — מציגים רק את המנה שנרשמה */
function isDictionaryFromJournal(d: DictionaryItem): boolean {
  return d.source === "journal" || d.source == null;
}

/** למנה של 100 ג׳ שקק״ל שלה תואם לל־100 ג׳ — לא מציגים שורת למנה כפולה */
function dictionaryPortionRedundantWithPer100(d: DictionaryItem): boolean {
  if (d.unit !== "גרם") return false;
  if (Math.abs(d.quantity - 100) > 1e-6) return false;
  if (
    d.caloriesPer100g == null ||
    !Number.isFinite(d.caloriesPer100g) ||
    d.lastCalories == null ||
    !Number.isFinite(d.lastCalories)
  ) {
    return false;
  }
  return Math.round(d.lastCalories) === Math.round(d.caloriesPer100g);
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
    out.push(
      <span
        key={`b-${start}`}
        className="rounded-sm bg-[var(--cherry-muted)]/90 px-0.5 font-normal"
      >
        {text.slice(start, end + 1)}
      </span>
    );
    at = end + 1;
  }
  if (at < text.length) out.push(<span key={`t-${at}-end`}>{text.slice(at)}</span>);
  return <>{out}</>;
}

export default function DictionaryPage() {
  useDocumentScrollOnlyIfOverflowing();
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
  const [quantityEditTarget, setQuantityEditTarget] =
    useState<DictionaryItem | null>(null);
  const [editQtyText, setEditQtyText] = useState("1");
  const [editUnit, setEditUnit] = useState<FoodUnit>("גרם");
  const [editGramsPerUnitText, setEditGramsPerUnitText] = useState("");
  const quantityEditTitleId = useId();
  const journalAddTitleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsAnchorRef = useRef<HTMLDivElement>(null);
  const wasSearchingRef = useRef(false);
  const [journalAddTarget, setJournalAddTarget] = useState<DictionaryItem | null>(
    null
  );
  const [journalQtyText, setJournalQtyText] = useState("1");
  const [journalUnit, setJournalUnit] = useState<FoodUnit>("גרם");
  const [journalGPerUText, setJournalGPerUText] = useState("");
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
  /** מקלדת א–ת מקופלת עד לחיצה על המשפט המסביר */
  const [hebrewLetterPickerOpen, setHebrewLetterPickerOpen] = useState(false);
  /** גלה מזונות / בחירה לייצוא / ייצוא — מקופלים מאחורי «עוד» */
  const [dictionaryMoreActionsOpen, setDictionaryMoreActionsOpen] =
    useState(false);
  const [dictItemNameEditId, setDictItemNameEditId] = useState<string | null>(
    null
  );
  const [dictItemNameDraft, setDictItemNameDraft] = useState("");
  const dictItemNameInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const openHelp = () => setHelpOpen(true);
    window.addEventListener("cj-dictionary-help", openHelp);
    return () => window.removeEventListener("cj-dictionary-help", openHelp);
  }, []);

  useEffect(() => {
    if (!dictItemNameEditId) return;
    const t = window.setTimeout(
      () => dictItemNameInputRef.current?.focus(),
      50
    );
    return () => window.clearTimeout(t);
  }, [dictItemNameEditId]);

  /** סגירת כרטיס / מעבר לפריט אחר — יוצאים מעריכת שם (לא מתנגש עם פתיחה) */
  useEffect(() => {
    if (!dictItemNameEditId) return;
    if (openSavedId !== dictItemNameEditId) {
      setDictItemNameEditId(null);
      setDictItemNameDraft("");
    }
  }, [openSavedId, dictItemNameEditId]);

  function cancelDictItemNameEdit() {
    setDictItemNameEditId(null);
    setDictItemNameDraft("");
  }

  function saveDictItemNameEdit() {
    if (!dictItemNameEditId) return;
    const name = dictItemNameDraft.trim();
    if (!name) return;
    if (!patchDictionaryItemById(dictItemNameEditId, { food: name })) {
      cancelDictItemNameEdit();
      return;
    }
    refresh();
    cancelDictItemNameEdit();
  }

  /** אחרי גלילה במסך — כניסה לחיפוש לא מציגה את כותרת תוצאות החיפוש; מיישרים לתחילת הבלוק */
  useEffect(() => {
    if (!isSearching) {
      wasSearchingRef.current = false;
      return;
    }
    const justStarted = !wasSearchingRef.current;
    wasSearchingRef.current = true;
    if (!justStarted) return;
    const tid = window.setTimeout(() => {
      searchResultsAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(tid);
  }, [isSearching]);

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

  const journalAddPreview = useMemo(() => {
    if (!journalAddTarget) return null;
    const d = journalAddTarget;
    const qty = parseQtyAllowZero(
      journalQtyText.trim() === "" ? "1" : journalQtyText,
      journalUnit
    );
    let gResolved: number | null = null;
    if (journalUnit === "יחידה") {
      const fromField = parseGramsPerUnitField(journalGPerUText);
      gResolved =
        fromField != null && fromField > 0
          ? fromField
          : d.gramsPerUnit != null && d.gramsPerUnit > 0
            ? d.gramsPerUnit
            : null;
    }
    return buildLogEntryFromDictionaryServing(
      d,
      qty,
      journalUnit,
      gResolved,
      d.mealPresetId ? presetMap.get(d.mealPresetId) ?? null : null
    );
  }, [journalAddTarget, journalQtyText, journalUnit, journalGPerUText, presetMap]);

  const journalModalParsedQty = useMemo(() => {
    if (!journalAddTarget) return 1;
    return parseQtyAllowZero(
      journalQtyText.trim() === "" ? "1" : journalQtyText,
      journalUnit
    );
  }, [journalAddTarget, journalQtyText, journalUnit]);

  const quantityEditParsedQty = useMemo(() => {
    if (!quantityEditTarget) return 1;
    return parseQtyAllowZero(
      editQtyText.trim() === "" ? "1" : editQtyText,
      editUnit
    );
  }, [quantityEditTarget, editQtyText, editUnit]);

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
            ? ` · חלבון ${d.proteinPer100g ?? ""} ג׳ · פחמימות ${
                d.carbsPer100g ?? ""
              } ג׳ · שומן ${d.fatPer100g ?? ""} ג׳`
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
            items?: ExplorerFoodRow[];
          };
          setOffRows(offData.items ?? []);
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
      category: row.category,
      brand: row.brand,
    });
    setExplorerUiTick((x) => x + 1);
    refresh();
    flashAdded(row.id);
  }

  async function onCartDictionaryItem(d: DictionaryItem) {
    const k100 =
      d.caloriesPer100g != null && Number.isFinite(d.caloriesPer100g)
        ? Math.round(d.caloriesPer100g)
        : 0;
    const category = await resolveShoppingCategoryForDictionaryItem(d);
    const added = addToShopping({
      foodId: `dictionary:${d.id}`,
      name: d.food.trim(),
      category,
      calories: k100,
      brand: d.brand?.trim() || undefined,
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
    const gPerU =
      d.gramsPerUnit != null && Number.isFinite(d.gramsPerUnit) && d.gramsPerUnit > 0
        ? d.gramsPerUnit
        : null;
    const entry = buildLogEntryFromDictionaryServing(
      d,
      d.quantity,
      d.unit,
      gPerU,
      d.mealPresetId ? presetMap.get(d.mealPresetId) ?? null : null
    );
    const dateKey = resolveJournalTargetDateKey({ allowFuture: true });
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    setJustAddedId(`journal:${d.id}`);
    if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
    justAddedTimerRef.current = window.setTimeout(() => setJustAddedId(null), 900);
  }

  function openJournalAddModal(d: DictionaryItem) {
    setJournalAddTarget(d);
    setJournalQtyText(String(d.quantity));
    setJournalUnit(d.unit);
    setJournalGPerUText(
      d.gramsPerUnit != null && d.gramsPerUnit > 0 ? String(d.gramsPerUnit) : ""
    );
  }

  function closeJournalAddModal() {
    setJournalAddTarget(null);
  }

  function confirmJournalAdd() {
    if (!journalAddTarget) return;
    const d = journalAddTarget;
    const qty = parseQtyAllowZero(
      journalQtyText.trim() === "" ? "1" : journalQtyText,
      journalUnit
    );
    if (qty <= 0) return;
    let gResolved: number | null = null;
    if (journalUnit === "יחידה") {
      const fromField = parseGramsPerUnitField(journalGPerUText);
      gResolved =
        fromField != null && fromField > 0
          ? fromField
          : d.gramsPerUnit != null && d.gramsPerUnit > 0
            ? d.gramsPerUnit
            : null;
    }
    const entry = buildLogEntryFromDictionaryServing(
      d,
      qty,
      journalUnit,
      gResolved,
      d.mealPresetId ? presetMap.get(d.mealPresetId) ?? null : null
    );
    const dateKey = resolveJournalTargetDateKey({ allowFuture: true });
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    setJustAddedId(`journal:${d.id}`);
    if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
    justAddedTimerRef.current = window.setTimeout(() => setJustAddedId(null), 900);
    closeJournalAddModal();
  }

  function openQuantityEdit(d: DictionaryItem) {
    setQuantityEditTarget(d);
    setEditQtyText(String(d.quantity));
    setEditUnit(d.unit);
    setEditGramsPerUnitText(
      d.gramsPerUnit != null && d.gramsPerUnit > 0 ? String(d.gramsPerUnit) : ""
    );
  }

  function closeQuantityEdit() {
    setQuantityEditTarget(null);
  }

  function saveQuantityEdit() {
    if (!quantityEditTarget) return;
    const prev = quantityEditTarget;
    const qty = parseQtyAllowZero(
      editQtyText.trim() === "" ? "1" : editQtyText,
      editUnit
    );
    if (qty <= 0) return;
    const gPerU = parseGramsPerUnitField(editGramsPerUnitText);
    const totalG = servingTotalGrams(qty, editUnit, gPerU);

    const patch: Parameters<typeof patchDictionaryItemById>[1] = {
      quantity: qty,
      unit: editUnit,
    };

    const c100 = prev.caloriesPer100g;
    const p100 = prev.proteinPer100g;
    const carb100 = prev.carbsPer100g;
    const f100 = prev.fatPer100g;

    if (
      c100 != null &&
      Number.isFinite(c100) &&
      totalG != null &&
      totalG > 0
    ) {
      patch.lastCalories = Math.max(0, Math.round(c100 * (totalG / 100)));
      if (p100 != null && Number.isFinite(p100)) {
        patch.lastProteinG = Math.round(((p100 * totalG) / 100) * 10) / 10;
      }
      if (carb100 != null && Number.isFinite(carb100)) {
        patch.lastCarbsG = Math.round(((carb100 * totalG) / 100) * 10) / 10;
      }
      if (f100 != null && Number.isFinite(f100)) {
        patch.lastFatG = Math.round(((f100 * totalG) / 100) * 10) / 10;
      }
    } else {
      const scaleR = servingScaleRatioFromDictionaryDefault(
        prev,
        qty,
        editUnit,
        gPerU
      );
      if (
        scaleR != null &&
        prev.lastCalories != null &&
        Number.isFinite(prev.lastCalories) &&
        prev.lastCalories > 0
      ) {
        patch.lastCalories = Math.max(
          0,
          Math.round(prev.lastCalories * scaleR)
        );
        if (prev.lastProteinG != null && Number.isFinite(prev.lastProteinG)) {
          patch.lastProteinG =
            Math.round(prev.lastProteinG * scaleR * 10) / 10;
        }
        if (prev.lastCarbsG != null && Number.isFinite(prev.lastCarbsG)) {
          patch.lastCarbsG =
            Math.round(prev.lastCarbsG * scaleR * 10) / 10;
        }
        if (prev.lastFatG != null && Number.isFinite(prev.lastFatG)) {
          patch.lastFatG = Math.round(prev.lastFatG * scaleR * 10) / 10;
        }
      }
    }

    if (editUnit === "יחידה") {
      patch.gramsPerUnit = gPerU ?? undefined;
    }

    const next = patchDictionaryItemById(prev.id, patch);
    if (next) {
      setSaved(next);
      closeQuantityEdit();
    }
  }

  return (
    <div
      className={`mx-auto max-w-lg px-3 pb-28 pt-0 ${fontFood}`}
      dir="rtl"
    >
      <div className="sticky top-0 z-50 mb-4 rounded-b-xl border-b border-[var(--border-cherry-soft)]/80 bg-white px-2.5 py-2.5 shadow-[0_1px_0_rgba(155,27,48,0.05)] sm:px-3 sm:py-3">
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

      <AnimatePresence>
        {helpOpen && (
          <motion.div
            className="fixed inset-0 z-[600] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setHelpOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-2xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-extrabold tracking-tight text-[var(--cherry)]">
                  המילון האישי
                </h2>
                <button
                  type="button"
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => setHelpOpen(false)}
                >
                  סגירה
                </button>
              </div>
              <p className="mt-2 text-base leading-relaxed text-[var(--stem)]/85">
                {dictionaryIntroBody(gender)}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
        <div
          ref={searchResultsAnchorRef}
          className="scroll-mt-[calc(env(safe-area-inset-top,0px)+7.5rem)]"
        >
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
        </div>
      )}

      <motion.section
        className={isSearching ? "mt-4" : "mt-1"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-4 border-t border-[var(--border-cherry-soft)]/60 pt-3">
          {/* שורה 1: א–ת + טאבים + עוד; שורה 2: ניקוי אות (רוחב מלא); מתחת — פעולות נוספות */}
          <div className="overflow-hidden rounded-xl border-2 border-[var(--border-cherry-soft)]/70 bg-white/80 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2.5 py-2 sm:gap-2 sm:px-3 sm:py-2.5">
              <button
                type="button"
                id="dictionary-letter-filter-toggle"
                className="flex max-w-full items-center gap-1.5 rounded-lg py-0.5 text-start transition hover:bg-[var(--cherry-muted)]/45 sm:gap-2"
                aria-expanded={hebrewLetterPickerOpen}
                aria-controls="dictionary-letter-filter-grid"
                onClick={() => setHebrewLetterPickerOpen((o) => !o)}
              >
                <span className="text-sm font-extrabold leading-snug text-[var(--stem)] sm:text-base">
                  {gf(
                    gender,
                    "א-ת — לחצי על אות לסינון",
                    "א-ת — לחץ על אות לסינון"
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[var(--cherry)] transition-transform duration-200 sm:h-5 sm:w-5 ${
                    hebrewLetterPickerOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                      className={`rounded-lg border-2 px-2.5 py-1.5 text-xs font-extrabold shadow-sm transition-colors hover:bg-[var(--cherry-muted)] sm:px-3 sm:py-2 sm:text-sm ${
                        on
                          ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                          : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85"
                      }`}
                      onClick={() => setDictTab(id)}
                      aria-pressed={on}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                id="dictionary-more-actions-toggle"
                className="ms-auto flex shrink-0 items-center gap-1 rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-2.5 py-1.5 text-xs font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm"
                aria-expanded={dictionaryMoreActionsOpen}
                aria-controls="dictionary-more-actions"
                onClick={() => setDictionaryMoreActionsOpen((o) => !o)}
              >
                {gf(gender, "עוד", "עוד")}
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 sm:h-4 sm:w-4 ${
                    dictionaryMoreActionsOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden
                />
              </button>
            </div>
            {activeLetter ? (
              <div className="border-t border-[var(--border-cherry-soft)]/50 px-2.5 pb-2 pt-1.5 sm:px-3 sm:pb-2.5 sm:pt-2">
                <button
                  type="button"
                  className="flex min-h-[2.75rem] w-full items-center justify-center rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => setActiveLetter(null)}
                >
                  ניקוי אות
                </button>
              </div>
            ) : null}
            {dictionaryMoreActionsOpen ? (
              <div
                id="dictionary-more-actions"
                className="flex flex-col gap-2 border-t border-[var(--border-cherry-soft)]/60 bg-[var(--cherry-muted)]/20 px-2.5 py-2.5 sm:flex-row sm:px-3"
              >
                <Link
                  href="/explorer"
                  className="flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-2 py-2.5 text-center text-xs font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] sm:px-3 sm:text-sm"
                >
                  גלה מזונות
                </Link>
                <button
                  type="button"
                  className={`flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center rounded-xl border-2 px-2 py-2.5 text-center text-xs font-extrabold leading-snug shadow-sm transition sm:px-3 sm:text-sm ${
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
                  className="flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-2 py-2.5 text-center text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] sm:px-3 sm:text-sm"
                  onClick={() => setExportOpen(true)}
                >
                  ייצוא
                </button>
              </div>
            ) : null}
          </div>
          {hebrewLetterPickerOpen ? (
            <div
              id="dictionary-letter-filter-grid"
              className="mt-2 grid w-full grid-cols-11 gap-1"
              role="group"
              aria-label={gf(
                gender,
                "בחירת אות לסינון המילון",
                "בחירת אות לסינון המילון"
              )}
            >
              {HEB_LETTERS.map((l) => {
                const on = activeLetter === l;
                return (
                  <button
                    key={l}
                    type="button"
                    className={`min-h-[2.5rem] rounded-lg border py-1.5 text-sm font-extrabold shadow-sm transition sm:text-base ${
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
          <ul className="notebook-list -mx-3 space-y-2">
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
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-right">
                      <span className="text-xs" aria-hidden>
                        🍒
                      </span>
                      {dictItemNameEditId === d.id && isOpen ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            ref={dictItemNameInputRef}
                            type="text"
                            value={dictItemNameDraft}
                            onChange={(e) =>
                              setDictItemNameDraft(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") cancelDictItemNameEdit();
                              if (e.key === "Enter") saveDictItemNameEdit();
                            }}
                            className="min-w-0 flex-1 rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-2.5 py-1.5 text-base font-normal text-[var(--cherry)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--stem)]/25"
                            dir="rtl"
                            aria-label={gf(
                              gender,
                              "שם הפריט במילון",
                              "שם הפריט במילון"
                            )}
                          />
                          <div className="flex shrink-0 items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                saveDictItemNameEdit();
                              }}
                            >
                              {gf(gender, "שמור", "שמור")}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--text)]/80 shadow-sm transition hover:bg-[var(--cherry-muted)]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelDictItemNameEdit();
                              }}
                            >
                              {gf(gender, "ביטול", "ביטול")}
                            </button>
                          </div>
                        </div>
                      ) : !isOpen ? (
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-right"
                          onClick={() =>
                            setOpenSavedId((x) => (x === d.id ? null : d.id))
                          }
                          aria-expanded={false}
                          title={gf(
                            gender,
                            "פתיחת פרטי הפריט",
                            "פתיחת פרטי הפריט"
                          )}
                        >
                          <span className="flex min-w-0 items-center justify-end gap-1.5">
                            <span className="min-w-0 flex-1 break-words text-base font-normal leading-snug text-[var(--cherry)]">
                              {savedHits
                                ? renderHighlighted(
                                    d.food,
                                    savedHits.find((x) => x.item.id === d.id)
                                      ?.ranges ?? []
                                  )
                                : d.food}
                            </span>
                            <span
                              className="shrink-0 text-xs font-normal text-[var(--stem)]/55"
                              aria-hidden
                            >
                              ▼
                            </span>
                          </span>
                        </button>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <button
                            type="button"
                            className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-right transition hover:bg-[var(--cherry-muted)]/45"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDictItemNameEditId(d.id);
                              setDictItemNameDraft(d.food);
                            }}
                            title={gf(
                              gender,
                              "לחצי לעריכת השם (כרטיס פתוח)",
                              "לחץ לעריכת השם (כרטיס פתוח)"
                            )}
                            aria-label={gf(
                              gender,
                              "עריכת שם הפריט",
                              "עריכת שם הפריט"
                            )}
                          >
                            <span className="block min-w-0 break-words text-base font-normal leading-snug text-[var(--cherry)]">
                              {savedHits
                                ? renderHighlighted(
                                    d.food,
                                    savedHits.find((x) => x.item.id === d.id)
                                      ?.ranges ?? []
                                  )
                                : d.food}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded-md p-1 text-xs font-normal text-[var(--stem)]/55 transition hover:bg-[var(--cherry-muted)]/40"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenSavedId((x) =>
                                x === d.id ? null : x
                              );
                            }}
                            aria-expanded={true}
                            aria-label={gf(
                              gender,
                              "סגירת פרטי הפריט",
                              "סגירת פרטי הפריט"
                            )}
                            title={gf(gender, "סגירה", "סגירה")}
                          >
                            <span aria-hidden>▲</span>
                          </button>
                        </div>
                      )}
                      {isMeal && (
                        <span className="shrink-0 rounded-md bg-[var(--cherry-muted)] px-2 py-0.5 text-xs font-normal text-[var(--cherry)]">
                          ארוחה
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {!exportSelectMode &&
                      (!d.mealPresetId || preset != null) ? (
                        <button
                          type="button"
                          className="rounded-md border border-[var(--border-cherry-soft)] bg-white p-1.5 text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSavedJournal(d);
                          }}
                          aria-label="הוספה מהירה ליומן לפי ברירת המחדל במילון"
                          title="הוספה מהירה ליומן"
                        >
                          <span
                            className={`grid h-4 w-4 place-items-center text-[15px] font-normal leading-none ${
                              justAddedId === `journal:${d.id}`
                                ? "text-[var(--stem)]"
                                : "text-[var(--cherry)]"
                            }`}
                            aria-hidden
                          >
                            ✓
                          </span>
                        </button>
                      ) : null}
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
                          {isMeal && preset && (
                            <>
                              <ul className="space-y-1 text-sm text-[var(--text)]/90">
                                {preset.components.map((c, i) => (
                                  <li key={`${d.id}-c-${i}`}>
                                    <span className="font-bold text-neutral-900">
                                      מנה
                                    </span>
                                    {" · "}
                                    <span className="bidi-isolate-rtl inline-block font-semibold text-[var(--cherry)]">
                                      {c.food}
                                    </span>
                                    {" — "}
                                    <span className="bidi-isolate-rtl inline-block font-bold text-neutral-900">
                                      {c.quantity} {c.unit}
                                    </span>
                                    {" ("}
                                    <span className="bidi-isolate-rtl inline-block font-bold text-neutral-900">
                                      {Math.round(c.calories)} קק״ל
                                    </span>
                                    {")"}
                                    <span className="text-[var(--stem)]/75">
                                      <span className={DICT_CARD_MACRO_P}>
                                        {" "}
                                        · חלבון {fmtMacroG(c.proteinG)} ג׳
                                      </span>
                                      <span className={DICT_CARD_MACRO_C}>
                                        {" "}
                                        · פחמימות {fmtMacroG(c.carbsG)} ג׳
                                      </span>
                                      <span className={DICT_CARD_MACRO_F}>
                                        {" "}
                                        · שומן {fmtMacroG(c.fatG)} ג׳
                                      </span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {(() => {
                                const s = sumPresetTotals(preset);
                                return (
                                  <p className="text-sm font-normal">
                                    <span className="font-semibold text-[var(--cherry)]">
                                      סה״כ ארוחה:
                                    </span>{" "}
                                    <span className="bidi-isolate-rtl inline-block font-bold text-neutral-900">
                                      {Math.round(s.kcal)} קק״ל
                                    </span>
                                    <span className={DICT_CARD_MACRO_P}>
                                      {" "}
                                      · ח {s.protein.toFixed(1)}
                                    </span>
                                    <span className={DICT_CARD_MACRO_C}>
                                      {" "}
                                      · פחם {s.carbs.toFixed(1)}
                                    </span>
                                    <span className={DICT_CARD_MACRO_F}>
                                      {" "}
                                      · שומן {s.fat.toFixed(1)} ג׳
                                    </span>
                                  </p>
                                );
                              })()}
                            </>
                          )}

                          {!isMeal &&
                            (() => {
                              const fromJournal = isDictionaryFromJournal(d);
                              const hasK100 =
                                d.caloriesPer100g != null &&
                                Number.isFinite(d.caloriesPer100g);
                              const showPer100 = hasK100 && !fromJournal;
                              const redundant =
                                dictionaryPortionRedundantWithPer100(d);
                              const hasPortion =
                                d.lastCalories != null ||
                                d.lastProteinG != null ||
                                d.lastCarbsG != null ||
                                d.lastFatG != null;
                              const showPortionLine =
                                hasPortion && (fromJournal || !redundant);

                              return (
                                <>
                                  {showPer100 && (
                                    <p className="text-xs text-[var(--text)]/70">
                                      <span className="bidi-isolate-rtl inline-block font-bold text-neutral-900">
                                        ל־100 גרם:{" "}
                                        {Math.round(d.caloriesPer100g!)} קק״ל
                                      </span>
                                      {d.proteinPer100g != null &&
                                        d.carbsPer100g != null &&
                                        d.fatPer100g != null && (
                                          <>
                                            <span className={DICT_CARD_MACRO_P}>
                                              {" "}
                                              · חלבון {d.proteinPer100g.toFixed(1)}{" "}
                                              ג׳
                                            </span>
                                            <span className={DICT_CARD_MACRO_C}>
                                              {" "}
                                              · פחמימות{" "}
                                              {d.carbsPer100g.toFixed(1)} ג׳
                                            </span>
                                            <span className={DICT_CARD_MACRO_F}>
                                              {" "}
                                              · שומן {d.fatPer100g.toFixed(1)} ג׳
                                            </span>
                                          </>
                                        )}
                                      {d.barcode ? ` · ברקוד ${d.barcode}` : ""}
                                    </p>
                                  )}
                                  {showPortionLine && (
                                    <p className="text-xs font-normal text-[var(--stem)]/85">
                                      {fromJournal ? "מנה" : "למנה"} (
                                      <span className="bidi-isolate-rtl inline-block font-bold text-neutral-900">
                                        {d.quantity} {d.unit}
                                        {d.unit === "יחידה" &&
                                        d.gramsPerUnit != null &&
                                        d.gramsPerUnit > 0
                                          ? ` · ${d.gramsPerUnit} ג׳ ליחידה`
                                          : ""}
                                      </span>
                                      ):{" "}
                                      <span className="bidi-isolate-rtl inline-block font-bold text-neutral-900">
                                        {d.lastCalories != null
                                          ? `${Math.round(d.lastCalories)} קק״ל`
                                          : "—"}
                                      </span>
                                      {d.lastProteinG != null ||
                                      d.lastCarbsG != null ||
                                      d.lastFatG != null ? (
                                        <>
                                          <span className={DICT_CARD_MACRO_P}>
                                            {" "}
                                            · חלבון {fmtMacroG(d.lastProteinG)} ג׳
                                          </span>
                                          <span className={DICT_CARD_MACRO_C}>
                                            {" "}
                                            · פחמימות {fmtMacroG(d.lastCarbsG)} ג׳
                                          </span>
                                          <span className={DICT_CARD_MACRO_F}>
                                            {" "}
                                            · שומן {fmtMacroG(d.lastFatG)} ג׳
                                          </span>
                                        </>
                                      ) : null}
                                    </p>
                                  )}
                                </>
                              );
                            })()}

                          <div className="mt-2 flex w-full max-w-full flex-wrap items-center justify-center gap-2 border-t border-[var(--border-cherry-soft)]/60 bg-gradient-to-b from-[var(--cherry-muted)]/35 to-transparent px-1 py-2.5 sm:gap-3">
                            {isMeal && preset ? (
                              <>
                                <DictionaryExpandedTripleAction
                                  label={gf(
                                    gender,
                                    "עריכת כמות במילון",
                                    "עריכת כמות במילון"
                                  )}
                                  onClick={() => openQuantityEdit(d)}
                                  icon={
                                    <Pencil
                                      size={16}
                                      strokeWidth={2}
                                      className="text-[#B5173A]"
                                      aria-hidden
                                    />
                                  }
                                />
                                <DictionaryExpandedTripleAction
                                  label={gf(gender, "הוספה ליומן", "הוספה ליומן")}
                                  pressed={justAddedId === `journal:${d.id}`}
                                  onClick={() => openJournalAddModal(d)}
                                  icon={
                                    justAddedId === `journal:${d.id}` ? (
                                      <Check
                                        size={16}
                                        strokeWidth={2}
                                        className="text-[#B5173A]"
                                        aria-hidden
                                      />
                                    ) : (
                                      <PlusCircle
                                        size={16}
                                        strokeWidth={2}
                                        className="text-[#B5173A]"
                                        aria-hidden
                                      />
                                    )
                                  }
                                />
                              </>
                            ) : !d.mealPresetId ? (
                              <>
                                <DictionaryExpandedTripleAction
                                  label={gf(
                                    gender,
                                    "עריכת כמות במילון",
                                    "עריכת כמות במילון"
                                  )}
                                  onClick={() => openQuantityEdit(d)}
                                  icon={
                                    <Pencil
                                      size={16}
                                      strokeWidth={2}
                                      className="text-[#B5173A]"
                                      aria-hidden
                                    />
                                  }
                                />
                                <DictionaryExpandedTripleAction
                                  label={gf(gender, "הוספה ליומן", "הוספה ליומן")}
                                  onClick={() => openJournalAddModal(d)}
                                  icon={
                                    <PlusCircle
                                      size={16}
                                      strokeWidth={2}
                                      className="text-[#B5173A]"
                                      aria-hidden
                                    />
                                  }
                                />
                                <DictionaryExpandedTripleAction
                                  label="לקניות"
                                  pressed={justAddedId === `shop:${d.id}`}
                                  onClick={() => onCartDictionaryItem(d)}
                                  icon={
                                    justAddedId === `shop:${d.id}` ? (
                                      <Check
                                        size={16}
                                        strokeWidth={2}
                                        className="text-[#B5173A]"
                                        aria-hidden
                                      />
                                    ) : (
                                      <ShoppingCart
                                        size={16}
                                        strokeWidth={2}
                                        className="text-[#B5173A]"
                                        aria-hidden
                                      />
                                    )
                                  }
                                />
                              </>
                            ) : null}
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
        {journalAddTarget && (
          <motion.div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeJournalAddModal();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              aria-labelledby={journalAddTitleId}
              className="glass-panel w-full max-w-md space-y-4 p-5 shadow-2xl"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={journalAddTitleId}
                  className="panel-title-cherry text-lg"
                >
                  {gf(gender, "הוספה ליומן", "הוספה ליומן")}
                </h2>
                <button
                  type="button"
                  onClick={closeJournalAddModal}
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--cherry-muted)]"
                >
                  סגירה
                </button>
              </div>
              <p className="text-sm font-semibold text-[var(--stem)]">
                <span className="bidi-isolate-rtl">{journalAddTarget.food}</span>
              </p>
              <p className="text-xs leading-relaxed text-[var(--stem)]/75">
                {gf(
                  gender,
                  "הכמות כאן רק לרישום ביומן — המילון לא משתנה. לעדכון ברירת המחדל במילון השתמשי ב״עריכת כמות במילון״.",
                  "הכמות כאן רק לרישום ביומן — המילון לא משתנה. לעדכון ברירת המחדל במילון השתמש ב״עריכת כמות במילון״."
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="min-w-[6rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    {gf(gender, "כמות", "כמות")}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={journalQtyText}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setJournalQtyText("");
                        return;
                      }
                      const cleaned = raw
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      const parts = cleaned.split(".");
                      setJournalQtyText(
                        parts.length <= 1
                          ? parts[0]!
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() =>
                      setJournalQtyText((x) => {
                        const n = parseFloat(x.replace(",", "."));
                        if (!Number.isFinite(n)) return "1";
                        if (n <= 0) return "0";
                        return String(parseQtyForUnit(x, journalUnit));
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
                    value={journalUnit}
                    onChange={(e) => {
                      const u = e.target.value as FoodUnit;
                      setJournalUnit(u);
                      setJournalQtyText((q) => {
                        const raw = q.trim() === "" ? "1" : q;
                        if (parseQtyAllowZero(raw, u) === 0) return "0";
                        return String(parseQtyForUnit(raw, u));
                      });
                      if (u !== "יחידה") setJournalGPerUText("");
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
              {journalUnit === "יחידה" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    {gf(
                      gender,
                      "משקל יחידה (גרם)",
                      "משקל יחידה (גרם)"
                    )}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={journalGPerUText}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setJournalGPerUText("");
                        return;
                      }
                      const cleaned = raw
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      const parts = cleaned.split(".");
                      setJournalGPerUText(
                        parts.length <= 1
                          ? parts[0]!
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() => {
                      const g = parseGramsPerUnitField(journalGPerUText);
                      setJournalGPerUText(g != null ? String(g) : "");
                    }}
                    placeholder={gf(gender, "כמו במילון", "כמו במילון")}
                    className="input-luxury-dark w-full"
                  />
                </label>
              )}
              {journalModalParsedQty <= 0 ? (
                <p className="text-center text-sm font-semibold text-[#a94444]">
                  {gf(
                    gender,
                    "כמות חייבת להיות גדולה מ־0 כדי להוסיף ליומן.",
                    "כמות חייבת להיות גדולה מ־0 כדי להוסיף ליומן."
                  )}
                </p>
              ) : journalAddPreview ? (
                <p className="text-center text-base font-extrabold text-[var(--cherry)]">
                  {gf(gender, "סיכום למנה:", "סיכום למנה:")}{" "}
                  {journalAddPreview.calories.toLocaleString("he-IL")} קק״ל
                  {journalAddPreview.proteinG != null &&
                  journalAddPreview.carbsG != null &&
                  journalAddPreview.fatG != null ? (
                    <span className="mt-1 block text-sm font-semibold text-[var(--stem)]">
                      · חלבון {journalAddPreview.proteinG} ג׳ · פחמימות{" "}
                      {journalAddPreview.carbsG} ג׳ · שומן {journalAddPreview.fatG}{" "}
                      ג׳
                    </span>
                  ) : null}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-stem flex-1 rounded-xl py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={confirmJournalAdd}
                  disabled={journalModalParsedQty <= 0}
                >
                  {gf(gender, "הוסיפי ליומן", "הוסף ליומן")}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white py-3 font-semibold text-[var(--text)]"
                  onClick={closeJournalAddModal}
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {quantityEditTarget && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeQuantityEdit();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              aria-labelledby={quantityEditTitleId}
              className="glass-panel w-full max-w-md space-y-4 p-5 shadow-2xl"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={quantityEditTitleId}
                  className="panel-title-cherry text-lg"
                >
                  {gf(gender, "עריכת כמות במילון", "עריכת כמות במילון")}
                </h2>
                <button
                  type="button"
                  onClick={closeQuantityEdit}
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--cherry-muted)]"
                >
                  סגירה
                </button>
              </div>
              <p className="text-sm font-semibold text-[var(--stem)]">
                <span className="bidi-isolate-rtl">{quantityEditTarget.food}</span>
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="min-w-[6rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    {gf(gender, "כמות", "כמות")}
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
                          ? parts[0]!
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() =>
                      setEditQtyText((x) => {
                        const n = parseFloat(x.replace(",", "."));
                        if (!Number.isFinite(n)) return "1";
                        if (n <= 0) return "0";
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
                      setEditQtyText((q) => {
                        const raw = q.trim() === "" ? "1" : q;
                        if (parseQtyAllowZero(raw, u) === 0) return "0";
                        return String(parseQtyForUnit(raw, u));
                      });
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
                          ? parts[0]!
                          : `${parts[0]}.${parts.slice(1).join("")}`
                      );
                    }}
                    onBlur={() => {
                      const g = parseGramsPerUnitField(editGramsPerUnitText);
                      setEditGramsPerUnitText(g != null ? String(g) : "");
                    }}
                    placeholder="למשל 120"
                    className="input-luxury-dark w-full"
                  />
                </label>
              )}
              {quantityEditParsedQty <= 0 ? (
                <p className="text-center text-sm font-semibold text-[#a94444]">
                  {gf(
                    gender,
                    "כמות חייבת להיות גדולה מ־0.",
                    "כמות חייבת להיות גדולה מ־0."
                  )}
                </p>
              ) : null}
              {quantityEditTarget.caloriesPer100g != null &&
              quantityEditParsedQty > 0 ? (
                <p className="text-xs text-[var(--text)]/75">
                  יש ערכי תזונה ל־100 ג׳ — הקק״ל והמאקרו למנה יעודכנו לפי הכמות
                  בגרם או ליחידה עם משקל יחידה.
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-stem flex-1 rounded-xl py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={saveQuantityEdit}
                  disabled={quantityEditParsedQty <= 0}
                >
                  שמירה
                </button>
                <button
                  type="button"
                  className="btn-gold flex-1 rounded-xl py-3 font-semibold"
                  onClick={closeQuantityEdit}
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
