"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  type DictionaryItem,
  type FoodUnit,
  type MealPreset,
  isExplorerFoodInDictionary,
  loadDictionary,
  loadMealPresets,
  loadProfile,
  patchDictionaryItemById,
  removeDictionaryItem,
  toggleExplorerFoodInDictionary,
} from "@/lib/storage";
import { addToShopping, loadShoppingFoodIds } from "@/lib/explorerStorage";
import { IconPlusCircle, IconVerified } from "@/components/Icons";
import {
  dictionaryIntroBody,
  dictionarySavedFilterPlaceholder,
  gf,
} from "@/lib/hebrewGenderUi";
import { useDocumentScrollOnlyIfOverflowing } from "@/lib/useDocumentScrollOnlyIfOverflowing";
import Link from "next/link";
import { ChevronDown, Circle, Droplet, MoreVertical, Zap } from "lucide-react";
import { rankedFuzzySearchByText, type MatchRange } from "@/lib/rankedSearch";
import {
  firstWordStrongPrefixMatch,
  matchesAllQueryWords,
} from "@/lib/foodSearchRules";
import { truncateDisplayFoodLabel } from "@/lib/displayFoodLabel";

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

const DICT_LONG_PRESS_MS = 520;
const DICT_LONG_PRESS_CANCEL_DIST2 = 100;

type DictLetterGroup = { key: string; label: string; items: DictionaryItem[] };

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

type DictDominantMacro = "protein" | "carbs" | "fat" | "neutral";

function dictMacroGramsForDominance(
  d: DictionaryItem,
  preset: MealPreset | undefined
): { p: number; c: number; f: number } {
  if (preset?.components?.length) {
    let p = 0;
    let c = 0;
    let f = 0;
    for (const x of preset.components) {
      p += Number.isFinite(x.proteinG) ? Math.max(0, x.proteinG ?? 0) : 0;
      c += Number.isFinite(x.carbsG) ? Math.max(0, x.carbsG ?? 0) : 0;
      f += Number.isFinite(x.fatG) ? Math.max(0, x.fatG ?? 0) : 0;
    }
    return { p, c, f };
  }
  const lp =
    d.lastProteinG != null && Number.isFinite(d.lastProteinG)
      ? Math.max(0, d.lastProteinG)
      : 0;
  const lc =
    d.lastCarbsG != null && Number.isFinite(d.lastCarbsG)
      ? Math.max(0, d.lastCarbsG)
      : 0;
  const lf =
    d.lastFatG != null && Number.isFinite(d.lastFatG)
      ? Math.max(0, d.lastFatG)
      : 0;
  if (lp + lc + lf > 1e-6) {
    return { p: lp, c: lc, f: lf };
  }
  return {
    p:
      d.proteinPer100g != null && Number.isFinite(d.proteinPer100g)
        ? Math.max(0, d.proteinPer100g)
        : 0,
    c:
      d.carbsPer100g != null && Number.isFinite(d.carbsPer100g)
        ? Math.max(0, d.carbsPer100g)
        : 0,
    f:
      d.fatPer100g != null && Number.isFinite(d.fatPer100g)
        ? Math.max(0, d.fatPer100g)
        : 0,
  };
}

function dominantDictMacro(
  d: DictionaryItem,
  preset: MealPreset | undefined
): DictDominantMacro {
  const { p, c, f } = dictMacroGramsForDominance(d, preset);
  const t = p + c + f;
  if (t < 1e-6) return "neutral";
  const m = Math.max(p, c, f);
  const tol = 1e-6;
  const atMax = [p, c, f].filter((x) => Math.abs(x - m) <= tol).length;
  if (atMax !== 1) return "neutral";
  if (p === m) return "protein";
  if (c === m) return "carbs";
  return "fat";
}

/** חלבון — נתיבי Twemoji 💪 (U+1F4AA), CC-BY 4.0; צבע/זוהר מ־DictDominantMacroGlyph */
function DictMacroProteinLensIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M15.977 9.36h3.789c.114-.191.147-.439.058-.673l-3.846-4.705V9.36z" />
      <path d="M12.804 22.277c-.057-.349-.124-.679-.206-.973-.62-2.223-1.14-3.164-.918-5.494.29-1.584.273-4.763 4.483-4.268 1.112.131 2.843.927 3.834.91.567-.01.98-1.157 1.017-1.539.051-.526-.865-1.42-1.248-1.554-.383-.134-2.012-.631-2.681-.824-1.039-.301-.985-1.705-1.051-2.205-.031-.235.084-.467.294-.591.21-.124.375-.008.579.125l.885.648c.497.426-.874 1.24-.503 1.376 0 0 1.755.659 2.507.796.412.075 1.834-1.529 1.917-2.47.065-.74-3.398-4.083-5.867-5.381-.868-.456-1.377-.721-1.949-.694-.683.032-.898.302-1.748 1.03C8.302 4.46 4.568 11.577 4.02 13.152c-2.246 6.461-2.597 9.865-2.677 11.788-.049.59-.076 1.177-.076 1.758.065 0-1 5 0 6s5.326 1 5.326 1c10 3.989 28.57 2.948 28.57-7.233 0-12.172-18.813-10.557-22.359-4.188z" />
      <path d="M20.63 32.078c-3.16-.332-5.628-1.881-5.767-1.97-.465-.297-.601-.913-.305-1.379s.913-.603 1.38-.308c.04.025 4.003 2.492 7.846 1.467 2.125-.566 3.867-2.115 5.177-4.601.258-.49.866-.676 1.351-.419.488.257.676.862.419 1.351-1.585 3.006-3.754 4.893-6.447 5.606-1.257.332-2.502.374-3.654.253z" />
    </svg>
  );
}

function DictDominantMacroGlyph({ kind }: { kind: DictDominantMacro }) {
  const base = "h-[18px] w-[18px] shrink-0";
  if (kind === "carbs") {
    return (
      <Zap
        className={`${base} text-[#2563EB] drop-shadow-[0_0_6px_rgba(37,99,235,0.55)]`}
        strokeWidth={2.35}
        aria-hidden
      />
    );
  }
  if (kind === "fat") {
    return (
      <Droplet
        className={`${base} text-[#16A34A] drop-shadow-[0_0_6px_rgba(22,163,74,0.5)]`}
        strokeWidth={2.35}
        aria-hidden
      />
    );
  }
  if (kind === "protein") {
    return (
      <DictMacroProteinLensIcon
        className={`${base} text-[#CA8A04] drop-shadow-[0_0_6px_rgba(202,138,4,0.55)]`}
      />
    );
  }
  return (
    <Circle
      className={`${base} text-neutral-400/90`}
      strokeWidth={2}
      aria-hidden
    />
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
  const pStrong: DictionaryItem[] = [];
  const pWeak: DictionaryItem[] = [];
  const c: DictionaryItem[] = [];
  for (const d of items) {
    const f = d.food.toLowerCase();
    if (f.startsWith(q)) {
      if (firstWordStrongPrefixMatch(d.food, query)) pStrong.push(d);
      else pWeak.push(d);
    } else if (f.includes(q)) {
      c.push(d);
    }
  }
  return [...pStrong, ...pWeak, ...c];
}

function renderHighlighted(text: string, ranges: MatchRange[]) {
  if (!ranges || ranges.length < 1) return text;
  const out: ReactNode[] = [];
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsAnchorRef = useRef<HTMLDivElement>(null);
  const wasSearchingRef = useRef(false);
  const [dictProductEditNameDraft, setDictProductEditNameDraft] =
    useState("");
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
  const dictLongPressRef = useRef<{
    timer: number | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    itemId: string | null;
  }>({
    timer: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    itemId: null,
  });
  const [dictionaryActionItem, setDictionaryActionItem] =
    useState<DictionaryItem | null>(null);
  const [dictRowMenuOpenId, setDictRowMenuOpenId] = useState<string | null>(
    null
  );

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
    if (debouncedQ.trim().length >= 2) {
      return tabbed;
    }
    const sorted = [...tabbed].sort((a, b) =>
      normalizeTitleForIndex(a.food).localeCompare(
        normalizeTitleForIndex(b.food),
        "he"
      )
    );
    if (!activeLetter) return sorted;
    return sorted.filter((x) => firstHebLetter(x.food) === activeLetter);
  }, [savedHits, filteredSaved, dictTab, debouncedQ, activeLetter]);

  const visibleSavedGrouped = useMemo((): DictLetterGroup[] => {
    if (visibleSaved.length === 0) return [];
    if (debouncedQ.length >= 2) {
      return [{ key: "__search__", label: "", items: visibleSaved }];
    }
    if (activeLetter) {
      return [{ key: activeLetter, label: activeLetter, items: visibleSaved }];
    }
    return [{ key: "__flat__", label: "", items: visibleSaved }];
  }, [visibleSaved, debouncedQ, activeLetter]);

  const exportItems = useMemo(() => {
    if (exportSelectMode && exportSelectedIds.size > 0) {
      const set = exportSelectedIds;
      return saved.filter((x) => set.has(x.id));
    }
    return visibleSaved;
  }, [exportSelectMode, exportSelectedIds, saved, visibleSaved]);

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

  useEffect(() => {
    return () => {
      clearDictLongPressTimer();
    };
  }, []);

  useEffect(() => {
    if (!dictRowMenuOpenId) return;
    function onDown(ev: Event) {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-dict-row-menu]")) return;
      setDictRowMenuOpenId(null);
    }
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [dictRowMenuOpenId]);

  function flashAdded(id: string) {
    setJustAddedId(id);
    if (justAddedTimerRef.current) window.clearTimeout(justAddedTimerRef.current);
    justAddedTimerRef.current = window.setTimeout(() => setJustAddedId(null), 900);
  }

  function renderDictListFoodTitle(d: DictionaryItem): ReactNode {
    const full = d.food.trim();
    const short = truncateDisplayFoodLabel(full);
    const useHighlight =
      savedHits != null && debouncedQ.length >= 2 && short === full;
    if (useHighlight) {
      const ranges =
        savedHits!.find((x) => x.item.id === d.id)?.ranges ?? [];
      return renderHighlighted(full, ranges);
    }
    return short;
  }

  function clearDictLongPressTimer() {
    const t = dictLongPressRef.current.timer;
    if (t != null) window.clearTimeout(t);
    dictLongPressRef.current.timer = null;
    dictLongPressRef.current.pointerId = null;
    dictLongPressRef.current.itemId = null;
  }

  function handleDictRowPointerDown(
    e: PointerEvent<HTMLLIElement>,
    d: DictionaryItem
  ) {
    if (exportSelectMode) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest("[data-skip-dict-longpress]")) return;

    clearDictLongPressTimer();
    dictLongPressRef.current.pointerId = e.pointerId;
    dictLongPressRef.current.startX = e.clientX;
    dictLongPressRef.current.startY = e.clientY;
    dictLongPressRef.current.itemId = d.id;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dictLongPressRef.current.timer = window.setTimeout(() => {
      dictLongPressRef.current.timer = null;
      dictLongPressRef.current.pointerId = null;
      dictLongPressRef.current.itemId = null;
      setDictRowMenuOpenId(null);
      setDictionaryActionItem(d);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
    }, DICT_LONG_PRESS_MS);
  }

  function handleDictRowPointerMove(e: PointerEvent<HTMLLIElement>) {
    if (dictLongPressRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dictLongPressRef.current.startX;
    const dy = e.clientY - dictLongPressRef.current.startY;
    if (dx * dx + dy * dy > DICT_LONG_PRESS_CANCEL_DIST2) {
      clearDictLongPressTimer();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function handleDictRowPointerEnd(e: PointerEvent<HTMLLIElement>) {
    if (dictLongPressRef.current.pointerId !== e.pointerId) return;
    clearDictLongPressTimer();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function handleDictRowContextMenu(
    e: MouseEvent<HTMLLIElement>,
    d: DictionaryItem
  ) {
    if (exportSelectMode) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest("[data-skip-dict-longpress]")) return;
    e.preventDefault();
    clearDictLongPressTimer();
    setDictRowMenuOpenId(null);
    setDictionaryActionItem(d);
  }

  function confirmDictionaryDeleteItem() {
    const victim = dictionaryActionItem;
    if (!victim) return;
    setSaved(removeDictionaryItem(victim.id));
    setDictionaryActionItem(null);
    setOpenSavedId((x) => (x === victim.id ? null : x));
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

  function openDictProductEdit(d: DictionaryItem) {
    setQuantityEditTarget(d);
    setDictProductEditNameDraft(d.food);
    setEditQtyText(String(d.quantity));
    setEditUnit(d.unit);
    setEditGramsPerUnitText(
      d.gramsPerUnit != null && d.gramsPerUnit > 0 ? String(d.gramsPerUnit) : ""
    );
  }

  function closeQuantityEdit() {
    setQuantityEditTarget(null);
    setDictProductEditNameDraft("");
  }

  function saveDictProductEdit() {
    if (!quantityEditTarget) return;
    const prev = quantityEditTarget;
    const nameTrim = dictProductEditNameDraft.trim();
    if (!nameTrim) return;

    const preset =
      prev.mealPresetId != null ? presetMap.get(prev.mealPresetId) : undefined;
    const isMeal = Boolean(prev.mealPresetId && preset);

    if (isMeal) {
      if (prev.food.trim() !== nameTrim) {
        if (!patchDictionaryItemById(prev.id, { food: nameTrim })) return;
        refresh();
      }
      closeQuantityEdit();
      return;
    }

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
    if (prev.food.trim() !== nameTrim) {
      patch.food = nameTrim;
    }

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
          <div className="-mx-3 space-y-4">
            {visibleSavedGrouped.map((group) => (
              <div key={group.key} className="space-y-2">
                <ul className="notebook-list space-y-2">
                  {group.items.map((d) => {
              const preset =
                d.mealPresetId != null
                  ? presetMap.get(d.mealPresetId)
                  : undefined;
              const dominantMacro = dominantDictMacro(d, preset);
              const macroAria =
                dominantMacro === "protein"
                  ? gf(gender, "רכיב דומיננטי: חלבון", "רכיב דומיננטי: חלבון")
                  : dominantMacro === "carbs"
                    ? gf(
                        gender,
                        "רכיב דומיננטי: פחמימה",
                        "רכיב דומיננטי: פחמימה"
                      )
                    : dominantMacro === "fat"
                      ? gf(gender, "רכיב דומיננטי: שומן", "רכיב דומיננטי: שומן")
                      : gf(
                          gender,
                          "מאקרו — ללא דומיננטי ברור",
                          "מאקרו — ללא דומיננטי ברור"
                        );
              const isMeal = Boolean(d.mealPresetId && preset);
              const isOpen = openSavedId === d.id;
              const isSelected = exportSelectedIds.has(d.id);
              return (
                <motion.li
                  key={d.id}
                  layout
                  className="notebook-row"
                  onPointerDown={(e) => handleDictRowPointerDown(e, d)}
                  onPointerMove={handleDictRowPointerMove}
                  onPointerUp={handleDictRowPointerEnd}
                  onPointerCancel={handleDictRowPointerEnd}
                  onContextMenu={(e) => handleDictRowContextMenu(e, d)}
                >
                  <div className="flex items-start justify-between gap-3">
                    {exportSelectMode ? (
                      <button
                        type="button"
                        data-skip-dict-longpress
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
                      <span
                        className="flex w-8 shrink-0 items-center justify-center"
                        title={macroAria}
                        aria-label={macroAria}
                      >
                        <DictDominantMacroGlyph kind={dominantMacro} />
                      </span>
                      {!isOpen ? (
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-right"
                          onClick={() =>
                            setOpenSavedId((x) => (x === d.id ? null : d.id))
                          }
                          aria-expanded={false}
                          title={d.food}
                        >
                          <span className="flex min-w-0 items-center justify-end gap-1.5">
                            <span className="min-w-0 flex-1 break-words text-base font-normal leading-snug text-[var(--cherry)]">
                              {renderDictListFoodTitle(d)}
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
                          <span className="min-w-0 flex-1 break-words px-1 py-0.5 text-right text-base font-normal leading-snug text-[var(--cherry)]">
                            {renderDictListFoodTitle(d)}
                          </span>
                          <button
                            type="button"
                            data-skip-dict-longpress
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

                    <div className="relative flex shrink-0 items-center gap-1">
                      {!exportSelectMode &&
                      (!d.mealPresetId || preset != null) ? (
                        <div className="relative" data-dict-row-menu>
                          <button
                            type="button"
                            data-skip-dict-longpress
                            className="rounded-md border border-[var(--border-cherry-soft)] bg-white p-1.5 text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                            aria-expanded={dictRowMenuOpenId === d.id}
                            aria-haspopup="menu"
                            aria-label={gf(
                              gender,
                              "פעולות נוספות על הפריט",
                              "פעולות נוספות על הפריט"
                            )}
                            title={gf(gender, "עוד", "עוד")}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDictRowMenuOpenId((x) =>
                                x === d.id ? null : d.id
                              );
                            }}
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden />
                          </button>
                          {dictRowMenuOpenId === d.id ? (
                            <div
                              role="menu"
                              className="absolute end-0 top-[calc(100%+4px)] z-40 min-w-[13rem] rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white py-1 shadow-lg"
                              dir="rtl"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full px-3 py-2.5 text-start text-sm font-bold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]/45"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDictRowMenuOpenId(null);
                                  openDictProductEdit(d);
                                }}
                              >
                                {gf(gender, "עריכת מוצר", "עריכת מוצר")}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full px-3 py-2.5 text-start text-sm font-bold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]/45"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDictRowMenuOpenId(null);
                                  void onCartDictionaryItem(d);
                                }}
                              >
                                {gf(
                                  gender,
                                  "העברה לסל הקניות",
                                  "העברה לסל הקניות"
                                )}
                                {justAddedId === `shop:${d.id}` ? (
                                  <span className="ms-1 text-xs font-extrabold text-[var(--stem)]">
                                    ✓
                                  </span>
                                ) : null}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        className="mt-3"
                        data-skip-dict-longpress
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        <div className="flex min-w-0 flex-col gap-2">
                          {isMeal && preset && (
                            <>
                              <ul className="space-y-1 text-sm text-[var(--text)]/90">
                                {preset.components.map((c, i) => (
                                  <li key={`${d.id}-c-${i}`} className="leading-snug">
                                    <div className="text-sm text-[var(--text)]/90">
                                      <span className="font-bold text-neutral-900">
                                        מנה
                                      </span>
                                      {" · "}
                                      <span className="bidi-isolate-rtl inline-block font-semibold text-[var(--cherry)]">
                                        {truncateDisplayFoodLabel(c.food)}
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
                                    </div>
                                    <div className="mt-0.5 text-xs text-[var(--stem)]/75">
                                      <span className={DICT_CARD_MACRO_P}>
                                        חלבון {fmtMacroG(c.proteinG)} ג׳
                                      </span>
                                      <span className={DICT_CARD_MACRO_C}>
                                        {" · "}
                                        פחמימות {fmtMacroG(c.carbsG)} ג׳
                                      </span>
                                      <span className={DICT_CARD_MACRO_F}>
                                        {" · "}
                                        שומן {fmtMacroG(c.fatG)} ג׳
                                      </span>
                                    </div>
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

                              return showPer100 || showPortionLine ? (
                                <p className="text-xs font-normal leading-snug text-[var(--stem)]/85">
                                  {showPer100 ? (
                                    <span className="text-[var(--text)]/70">
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
                                    </span>
                                  ) : null}
                                  {showPer100 && showPortionLine ? (
                                    <span className="text-[var(--stem)]/40" aria-hidden>
                                      {" "}
                                      ·{" "}
                                    </span>
                                  ) : null}
                                  {showPortionLine ? (
                                    <>
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
                                    </>
                                  ) : null}
                                </p>
                              ) : null;
                            })()}
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
                <div className="mx-1 rounded-xl border-2 border-[var(--border-cherry-soft)]/70 bg-gradient-to-br from-[var(--cherry-muted)]/28 to-white px-4 py-3 text-center shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
                  <p className="text-[15px] font-extrabold leading-snug text-[var(--cherry)]">
                    {debouncedQ.length >= 2
                      ? dictTab === "meals"
                        ? `סה״כ ארוחות: ${group.items.length}`
                        : dictTab === "foods"
                          ? `סה״כ מוצרים: ${group.items.length}`
                          : (() => {
                              const mc = group.items.filter(
                                (x) => x.mealPresetId != null
                              ).length;
                              return `סה״כ מוצרים: ${group.items.length - mc} · סה״כ ארוחות: ${mc}`;
                            })()
                      : activeLetter
                        ? dictTab === "meals"
                          ? `סה״כ ארוחות באות ${activeLetter}: ${group.items.length}`
                          : dictTab === "foods"
                            ? `סה״כ מוצרים באות ${activeLetter}: ${group.items.length}`
                            : (() => {
                                const mc = group.items.filter(
                                  (x) => x.mealPresetId != null
                                ).length;
                                const fc = group.items.length - mc;
                                return `סה״כ באות ${activeLetter}: ${group.items.length} (מוצרים ${fc} · ארוחות ${mc})`;
                              })()
                        : dictTab === "meals"
                          ? `סה״כ ארוחות: ${group.items.length}`
                          : dictTab === "foods"
                            ? `סה״כ מוצרים: ${group.items.length}`
                            : (() => {
                                const mc = group.items.filter(
                                  (x) => x.mealPresetId != null
                                ).length;
                                return `סה״כ מוצרים: ${group.items.length - mc} · סה״כ ארוחות: ${mc}`;
                              })()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      <AnimatePresence>
        {dictionaryActionItem ? (
          <motion.div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/35 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDictionaryActionItem(null)}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="w-full max-w-sm rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <p className="text-center text-base font-semibold text-[var(--cherry)]">
                {truncateDisplayFoodLabel(dictionaryActionItem.food)}
              </p>
              {truncateDisplayFoodLabel(dictionaryActionItem.food) !==
              dictionaryActionItem.food.trim() ? (
                <p className="mt-1 text-center text-xs leading-snug text-[var(--stem)]/75">
                  {dictionaryActionItem.food}
                </p>
              ) : null}
              <p className="mt-3 text-center text-xs text-[var(--text)]/75">
                {gf(
                  gender,
                  "לחיצה ארוכה — מחיקה מהמילון (כמו ביומן).",
                  "לחיצה ארוכה — מחיקה מהמילון (כמו ביומן)."
                )}
              </p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/50 px-3 py-3 text-sm font-bold text-red-800 transition hover:bg-red-50"
                  onClick={() => confirmDictionaryDeleteItem()}
                >
                  {gf(gender, "מחיקה מהמילון", "מחיקה מהמילון")}
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl py-2.5 text-sm font-semibold text-[var(--stem)] transition hover:bg-neutral-100"
                  onClick={() => setDictionaryActionItem(null)}
                >
                  {gf(gender, "סגירה", "סגירה")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
                  {gf(gender, "עריכת מוצר", "עריכת מוצר")}
                </h2>
                <button
                  type="button"
                  onClick={closeQuantityEdit}
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--cherry-muted)]"
                >
                  סגירה
                </button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                  {gf(gender, "שם המוצר", "שם המוצר")}
                </span>
                <input
                  type="text"
                  value={dictProductEditNameDraft}
                  onChange={(e) => setDictProductEditNameDraft(e.target.value)}
                  className="input-luxury-dark w-full"
                  dir="rtl"
                  aria-label={gf(gender, "שם המוצר", "שם המוצר")}
                />
              </label>
              {quantityEditTarget.mealPresetId != null &&
              presetMap.get(quantityEditTarget.mealPresetId) != null ? (
                <p className="text-xs leading-relaxed text-[var(--stem)]/80">
                  {gf(
                    gender,
                    "ארוחה שמורה — ניתן לערוך כאן רק את השם. לשינוי מנות ערכו מהארוחה במסך הארוחות.",
                    "ארוחה שמורה — ניתן לערוך כאן רק את השם. לשינוי מנות ערוך מהארוחה במסך הארוחות."
                  )}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <label className="min-w-[6rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    {gf(gender, "כמות", "כמות")}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editQtyText}
                    disabled={
                      quantityEditTarget.mealPresetId != null &&
                      presetMap.get(quantityEditTarget.mealPresetId) != null
                    }
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
                    className="input-luxury-dark w-full disabled:cursor-not-allowed disabled:opacity-55"
                  />
                </label>
                <label className="min-w-[8rem] flex-[2]">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    יחידה
                  </span>
                  <select
                    value={editUnit}
                    disabled={
                      quantityEditTarget.mealPresetId != null &&
                      presetMap.get(quantityEditTarget.mealPresetId) != null
                    }
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
                    className="select-luxury w-full disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {editUnit === "יחידה" &&
              !(
                quantityEditTarget.mealPresetId != null &&
                presetMap.get(quantityEditTarget.mealPresetId) != null
              ) ? (
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
              ) : null}
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
              quantityEditParsedQty > 0 &&
              !(
                quantityEditTarget.mealPresetId != null &&
                presetMap.get(quantityEditTarget.mealPresetId) != null
              ) ? (
                <p className="text-xs text-[var(--text)]/75">
                  יש ערכי תזונה ל־100 ג׳ — הקק״ל והמאקרו למנה יעודכנו לפי הכמות
                  בגרם או ליחידה עם משקל יחידה.
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-stem flex-1 rounded-xl py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={saveDictProductEdit}
                  disabled={
                    !dictProductEditNameDraft.trim() ||
                    (!(quantityEditTarget.mealPresetId != null &&
                      presetMap.get(quantityEditTarget.mealPresetId) != null) &&
                      quantityEditParsedQty <= 0)
                  }
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
