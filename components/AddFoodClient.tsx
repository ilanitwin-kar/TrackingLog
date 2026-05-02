"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { BarcodeScanModal } from "@/components/BarcodeScanModal";
import { IconCaption } from "@/components/IconCaption";
import { IconPlusCircle, IconScanBarcode, IconVerified } from "@/components/Icons";
import { getTodayKey } from "@/lib/dateKey";
import {
  parseMealSlotParam,
  withMealSlotFromQuery,
} from "@/lib/journalMeals";
import { type HomeSuggestRow, sortHomeLocalRows } from "@/lib/foodSearchShared";
import { optionalMacroGram } from "@/lib/macroGrams";
import { SEARCH_DEBOUNCE_MS } from "@/lib/searchDebounce";
import {
  loadRecentFoodPicks,
  rememberFoodPick,
} from "@/lib/recentFoodPicks";
import {
  type FoodUnit,
  type LogEntry,
  getEntriesForDate,
  getFoodMemory,
  loadProfile,
  resolveJournalTargetDateKey,
  saveDayLogEntries,
  saveFoodMemoryKey,
  upsertDictionaryFromAiMeal,
  upsertDictionaryFromScan,
} from "@/lib/storage";
import { emitMealLoggedFeedback } from "@/lib/feedbackEvents";
import { gf } from "@/lib/hebrewGenderUi";

function clampGrams(q: number): number {
  if (!Number.isFinite(q)) return 100;
  return Math.min(5000, Math.max(1, Math.round(q)));
}

function clampUnitWeightG(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(5000, Math.max(0.1, Math.round(n * 100) / 100));
}

function clampServingUnits(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(100, Math.max(0.25, Math.round(n * 100) / 100));
}

function sanitizeDecimalTyping(raw: string): string {
  if (raw.trim() === "") return "";
  const cleaned = raw
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .replace(/^0+(?=\d)/, "");
  const parts = cleaned.split(".");
  return parts.length <= 1
    ? parts[0]
    : `${parts[0]}.${parts.slice(1).join("")}`;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** תצוגת «נבחרו לאחרונה»: כמות אחרונה מזיכרון + קלוריות למנה */
function recentPickQtyAndKcal(row: HomeSuggestRow): { qtyLine: string; kcal: number } {
  const mem = getFoodMemory(row.name.trim());
  const unit: FoodUnit = mem?.unit ?? "גרם";
  const qtyRaw = mem?.quantity ?? 100;
  const qty =
    unit === "גרם"
      ? clampGrams(Number(qtyRaw))
      : clampServingUnits(Number(qtyRaw));
  const gramsTotal =
    unit === "גרם"
      ? qty
      : (() => {
          const gPerU =
            mem?.gramsPerUnit != null &&
            Number.isFinite(mem.gramsPerUnit) &&
            mem.gramsPerUnit > 0
              ? mem.gramsPerUnit
              : 0;
          return gPerU > 0 ? qty * gPerU : 0;
        })();
  const per100 = row.calories ?? 0;
  const factor = gramsTotal > 0 ? gramsTotal / 100 : qty / 100;
  const kcal = Math.max(1, Math.round(per100 * factor));
  const qtyLine =
    unit === "גרם" ? `${qty} גרם` : `${qty} ${unit}`;
  return { qtyLine, kcal };
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function SearchSourceSection({
  title,
  subtitle,
  rows,
  loading,
  expanded,
  onToggle,
  gender,
  quickAddId,
  onOpenPick,
  onQuickAdd,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  rows: HomeSuggestRow[];
  loading: boolean;
  expanded: boolean;
  onToggle: () => void;
  gender: "female" | "male";
  quickAddId: string | null;
  onOpenPick: (row: HomeSuggestRow, e: ReactMouseEvent) => void;
  onQuickAdd: (row: HomeSuggestRow) => void;
  emptyText: string;
}) {
  const canToggle = rows.length > 0;
  return (
    <div className="border-t border-[var(--border-cherry-soft)]/80 pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        className={`flex w-full items-start justify-between gap-2 px-2 pb-0.5 text-right ${canToggle ? "cursor-pointer" : "cursor-default"}`}
        onClick={() => {
          if (canToggle) onToggle();
        }}
        aria-expanded={expanded}
      >
        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-[var(--cherry)]">
            {title}
          </span>
          {subtitle ? (
            <span className="block pt-0.5 text-[11px] font-medium text-[var(--stem)]/60">
              {subtitle}
            </span>
          ) : null}
        </span>
        {loading ? (
          <span className="shrink-0 rounded-lg border border-[var(--border-cherry-soft)] bg-white px-2 py-1 text-[10px] font-extrabold text-[var(--stem)] shadow-sm">
            טוען…
          </span>
        ) : canToggle ? (
          <span className="shrink-0 rounded-lg border border-[var(--border-cherry-soft)] bg-white px-2 py-1 text-[10px] font-extrabold text-[var(--stem)] shadow-sm">
            {expanded ? "סגירה" : `פתח (${rows.length})`}
          </span>
        ) : null}
      </button>

      {!expanded ? null : rows.length === 0 ? (
        <p className="px-2 py-1 text-xs text-[var(--cherry)]/65">
          {loading ? "טוען…" : emptyText}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((s) => (
            <AddFoodSearchResultRow
              key={`${s.source ?? "local"}-${s.id}`}
              row={s}
              gender={gender}
              quickAddId={quickAddId}
              onOpenPick={onOpenPick}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const AI_CHERRY_OPENERS = [
  "היי! מה היה הדובדבן שבקצפת היום? רשמי כאן הכל...",
  "Cherry כאן כדי להקשיב. אכלת משהו טוב? פשוט תגידי לי במילים שלך.",
  "בואי נעדכן את היומן שלך. מה אכלת היום?",
  "ספרי לי על הארוחה שלך, אני כבר אדאג לכל החישובים.",
] as const;

const AI_BLUE_OPENERS = [
  "אהלן! מה אכלנו היום? תרשום כאן בחופשיות...",
  "Blue כאן כדי לעשות לך סדר בנתונים. מה היה בארוחה האחרונה?",
  "בוא נסגור את הפינה של האוכל. מה אכלת? (אפשר גם להקליט).",
  "תרשום מה היה בצלחת, אני כבר מחשב לך הכל.",
] as const;

const AI_CHERRY_PLACEHOLDERS = [
  'למשל: "חצי בננה וביס מלחם"',
  'למשל: "סלט עם טחינה וקפה עם חלב"',
  'למשל: "כוס יוגורט וכמה שקדים"',
] as const;

const AI_BLUE_PLACEHOLDERS = [
  'למשל: "חצי בננה וביס מלחם"',
  'למשל: "המבורגר וצ׳יפס (מסעדה)"',
  'למשל: "קפה עם חלב ופרוסת לחם"',
] as const;

function resolveDateKey(raw: string | null): string {
  const today = getTodayKey();
  const fallback = resolveJournalTargetDateKey();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  if (raw > today) return today;
  return raw;
}

function formatDateKeyHe(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function addFoodSourceBadge(src: HomeSuggestRow["source"]) {
  const s = src ?? "local";
  if (s === "local") {
    return {
      label: "מאגר אינטליגנציה קלורית",
      verified: true,
      border: "border-[#e6c65c]/80",
      bg: "bg-[#fff9e6]",
      text: "text-[#b8860b]",
    };
  }
  if (s === "israelMoH") {
    return {
      label: "משרד הבריאות",
      verified: true,
      border: "border-[#2e7d32]/40",
      bg: "bg-[#e8f5e9]",
      text: "text-[#1b5e20]",
    };
  }
  if (s === "usda") {
    return {
      label: "USDA",
      verified: true,
      border: "border-[#1565c0]/40",
      bg: "bg-[#e3f2fd]",
      text: "text-[#0d47a1]",
    };
  }
  if (s === "openFoodFacts") {
    return {
      label: "Open Food Facts",
      verified: false,
      border: "border-[var(--border-cherry-soft)]",
      bg: "bg-white",
      text: "text-[var(--stem)]",
    };
  }
  return {
    label: "AI",
    verified: false,
    border: "border-[var(--border-cherry-soft)]",
    bg: "bg-white",
    text: "text-[var(--cherry)]",
  };
}

function AddFoodSearchResultRow({
  row,
  gender,
  quickAddId,
  onOpenPick,
  onQuickAdd,
}: {
  row: HomeSuggestRow;
  gender: "female" | "male";
  quickAddId: string | null;
  onOpenPick: (row: HomeSuggestRow, e: ReactMouseEvent) => void;
  onQuickAdd: (row: HomeSuggestRow) => void;
}) {
  const src = row.source ?? "local";
  const badge = addFoodSourceBadge(src);
  const qk = `${src}-${row.id}`;

  return (
    <li className="flex items-stretch gap-1.5">
      <button
        type="button"
        className="suggestion-item flex min-w-0 flex-1 flex-col items-stretch gap-0.5 rounded-lg px-3 py-2.5 text-right transition hover:bg-[var(--cherry-muted)]"
        onClick={(e) => onOpenPick(row, e)}
      >
        <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 font-semibold text-[var(--stem)]">
          <span>{row.name}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${badge.border} ${badge.bg}`}
            title={badge.label}
          >
            {badge.verified ? (
              <>
                <span className="text-sm font-bold leading-none text-[#d4a017]" aria-hidden>
                  ✓
                </span>
                <IconVerified className="h-3.5 w-3.5 shrink-0 text-[#16a34a]" />
              </>
            ) : null}
            <span className={`text-[10px] font-extrabold tracking-wide ${badge.text}`}>
              {badge.label}
            </span>
          </span>
        </span>
        {row.category != null ? (
          <span className="text-[11px] text-[var(--cherry)]/65">{row.category}</span>
        ) : null}
        {row.calories != null ? (
          <span className="text-[11px] text-[var(--cherry)]/75">
            קלוריות: {Math.round(row.calories)} · חלבון: {row.protein ?? "—"} · פחמימות:{" "}
            {row.carbs ?? "—"} · שומן: {row.fat ?? "—"}{" "}
            <span className="text-[var(--cherry)]/55">(ל־100 ג׳)</span>
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className={`flex min-w-[3.35rem] shrink-0 flex-col items-center justify-center rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-0.5 py-1 shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.98] ${
          quickAddId === qk ? "ring-2 ring-[var(--stem)]" : ""
        }`}
        aria-label={`הוספת «${row.name}» ליומן`}
        title="הוספה ליומן"
        onClick={() => onQuickAdd(row)}
      >
        <IconCaption label="הוספה">
          {quickAddId === qk ? (
            <span className="text-lg font-extrabold text-[var(--stem)]" aria-hidden>
              ✓
            </span>
          ) : (
            <IconPlusCircle
              className={`h-6 w-6 sm:h-7 sm:w-7 ${
                gender === "male" ? "text-[#1e3a5f]" : "text-[var(--cherry)]"
              }`}
            />
          )}
        </IconCaption>
      </button>
    </li>
  );
}

function entryVerifiedForQuickAdd(src: HomeSuggestRow["source"]): boolean {
  const s = src ?? "local";
  return s === "local" || s === "israelMoH" || s === "usda";
}

export function AddFoodClient({
  screen = "search",
}: {
  screen?: "search" | "ai";
}) {
  const gender = loadProfile().gender;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dateKey = resolveDateKey(searchParams.get("date"));
  const from = searchParams.get("from") ?? "";
  const mealSlotFromQuery = useMemo(
    () => parseMealSlotParam(searchParams.get("mealSlot")),
    [searchParams]
  );

  function attachMealSlot(entry: LogEntry): LogEntry {
    return withMealSlotFromQuery(entry, mealSlotFromQuery);
  }

  const [food, setFood] = useState("");

  const [debouncedFoodSearch, setDebouncedFoodSearch] = useState("");
  const [intelRows, setIntelRows] = useState<HomeSuggestRow[]>([]);
  const [mohRows, setMohRows] = useState<HomeSuggestRow[]>([]);
  const [usdaRows, setUsdaRows] = useState<HomeSuggestRow[]>([]);
  const [homeSearchLoading, setHomeSearchLoading] = useState(false);
  const [worldRows, setWorldRows] = useState<HomeSuggestRow[]>([]);
  const [worldSearchLoading, setWorldSearchLoading] = useState(false);
  // AI meal log (free-form)
  const [aiMealText, setAiMealText] = useState("");
  const [aiMealLoading, setAiMealLoading] = useState(false);
  const [aiMealQuestion, setAiMealQuestion] = useState<string | null>(null);
  const [aiMealOriginal, setAiMealOriginal] = useState<string | null>(null);
  const [aiMealError, setAiMealError] = useState<string | null>(null);
  const [aiListening, setAiListening] = useState(false);
  const [aiGreeting, setAiGreeting] = useState("");
  const [aiPlaceholder, setAiPlaceholder] = useState("");
  const [aiPending, setAiPending] = useState<null | {
    original: string;
    displayName: string;
    totals: { calories: number; protein: number; carbs: number; fat: number };
    breakdown: Array<{
      item: string;
      qty: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }>(null);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const manualTitleId = useId();
  const [manName, setManName] = useState("");
  const [manKcal100, setManKcal100] = useState("");
  const [manProtein100, setManProtein100] = useState("");
  const [manCarbs100, setManCarbs100] = useState("");
  const [manFat100, setManFat100] = useState("");
  const [manGrams, setManGrams] = useState("100");
  const [manUnitWeightText, setManUnitWeightText] = useState("");
  const [manUnitsText, setManUnitsText] = useState("1");
  const [manError, setManError] = useState<string | null>(null);
  const [manLoading, setManLoading] = useState(false);
  const [dictFeedback, setDictFeedback] = useState<string | null>(null);
  const [pickModalRow, setPickModalRow] = useState<HomeSuggestRow | null>(null);
  const [pickGramsText, setPickGramsText] = useState("100");
  const [pickUnitWeightText, setPickUnitWeightText] = useState("");
  const [pickUnitsText, setPickUnitsText] = useState("1");
  const [pickPressedDiary, setPickPressedDiary] = useState(false);
  const [pickPressedDictionary, setPickPressedDictionary] = useState(false);
  const [pickPressedBothShortcut, setPickPressedBothShortcut] =
    useState(false);
  const [pickModalFeedback, setPickModalFeedback] = useState<string | null>(
    null
  );
  const pickFeedbackTimerRef = useRef<number | null>(null);
  const pickTitleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);
  const aiTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [recentPicks, setRecentPicks] = useState<HomeSuggestRow[]>([]);

  const speechRecRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Refresh “personality” lines per track (Cherry/Blue) to keep it fresh.
    if (gender === "male") {
      setAiGreeting(pickRandom(AI_BLUE_OPENERS));
      setAiPlaceholder(pickRandom(AI_BLUE_PLACEHOLDERS));
    } else {
      setAiGreeting(pickRandom(AI_CHERRY_OPENERS));
      setAiPlaceholder(pickRandom(AI_CHERRY_PLACEHOLDERS));
    }
  }, [gender]);

  const mealPrefilledRef = useRef(false);
  useEffect(() => {
    if (screen !== "ai" || mealPrefilledRef.current) return;
    const raw = searchParams.get("text") ?? "";
    const t = raw.trim();
    if (t) {
      setAiMealText(t);
      mealPrefilledRef.current = true;
    }
  }, [screen, searchParams]);

  function stopAiDictation() {
    const r = speechRecRef.current;
    speechRecRef.current = null;
    setAiListening(false);
    if (r) {
      try {
        r.onresult = null;
        r.onerror = null;
        r.onend = null;
        r.stop();
      } catch {
        /* ignore */
      }
    }
  }

  function toggleAiDictation() {
    const AnyRec =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;
    if (!AnyRec) {
      setAiMealError("הכתבה לא נתמכת בדפדפן הזה.");
      return;
    }
    if (aiListening) {
      stopAiDictation();
      return;
    }
    setAiMealError(null);
    const rec = new AnyRec();
    rec.lang = "he-IL";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (event) => {
      let out = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r?.[0]?.transcript ?? "";
        out += t;
      }
      if (out.trim()) {
        setAiMealText((prev) => (prev ? `${prev} ${out}` : out).replace(/\s+/g, " "));
      }
    };
    rec.onerror = () => {
      setAiMealError("לא הצלחנו להפעיל את ההכתבה. בדקי הרשאות מיקרופון.");
      stopAiDictation();
    };
    rec.onend = () => {
      setAiListening(false);
      speechRecRef.current = null;
    };
    speechRecRef.current = rec;
    setAiListening(true);
    try {
      rec.start();
    } catch {
      setAiMealError("לא הצלחנו להתחיל הכתבה.");
      stopAiDictation();
    }
  }

  async function runAiMeal(mode: "start" | "answer") {
    const original = (mode === "start" ? aiMealText : aiMealOriginal ?? "").trim();
    const input = (mode === "start" ? aiMealText : aiMealText).trim();
    if (mode === "start" && original.length < 2) return;
    if (mode === "answer" && input.length < 1) return;

    setAiMealError(null);
    setAiPending(null);
    setAiMealLoading(true);
    try {
      const res = await fetch("/api/ai-meal-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          original: mode === "answer" ? original : undefined,
          input: mode === "start" ? original : input,
        }),
      });
      const data = (await res.json()) as {
        result?: unknown;
        error?: string;
      };
      if (!res.ok) {
        setAiMealError(data.error ?? "שירות הניתוח זמנית לא זמין");
        return;
      }
      const r = data.result as
        | null
        | {
            kind: "question";
            original: string;
            question: string;
          }
        | {
            kind: "result";
            original: string;
            displayName?: string;
            totals: { calories: number; protein: number; carbs: number; fat: number };
            breakdown: Array<{
              item: string;
              qty: string;
              calories: number;
              protein: number;
              carbs: number;
              fat: number;
            }>;
          };
      if (!r) {
        setAiMealError("לא הצלחתי לחשב את הארוחה. נסי לנסח אחרת.");
        return;
      }
      if (r.kind === "question") {
        setAiMealOriginal(r.original);
        setAiMealQuestion(r.question);
        // user answers in same box
        setAiMealText("");
        return;
      }

      // Final: show summary card first (validation step), only save on explicit confirm.
      const displayName = (r.displayName ?? "").trim() || r.original.trim();
      setAiPending({
        original: r.original.trim(),
        displayName,
        totals: r.totals,
        breakdown: r.breakdown ?? [],
      });
      setAiConfirmOpen(true);
    } catch {
      setAiMealError("שירות הניתוח זמנית לא זמין");
    } finally {
      setAiMealLoading(false);
    }
  }

  function commitAiJournal(includeDictionary: boolean) {
    if (!aiPending) return;
    const r = aiPending;
    const cleanName = r.displayName.trim();
    if (includeDictionary) {
      upsertDictionaryFromAiMeal(cleanName, r.totals);
    }
    const entry: LogEntry = attachMealSlot({
      id: uid(),
      food: cleanName,
      calories: Math.max(0, Math.round(r.totals.calories)),
      quantity: 1,
      unit: "יחידה",
      createdAt: new Date().toISOString(),
      mealStarred: false,
      verified: false,
      aiMeal: true,
      aiBreakdownJson: JSON.stringify(r.breakdown ?? []),
      proteinG: r.totals.protein,
      carbsG: r.totals.carbs,
      fatG: r.totals.fat,
    });
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    setAiPending(null);
    setAiConfirmOpen(false);
    setAiMealText("");
    setAiMealQuestion(null);
    setAiMealOriginal(null);
    setAiMealError(null);
    stopAiDictation();
    emitMealLoggedFeedback(
      includeDictionary
        ? gf(
            gender,
            `«${cleanName}» נוסף ליומן ולמילון`,
            `«${cleanName}» נוסף ליומן ולמילון`
          )
        : gf(gender, `«${cleanName}» נוסף ליומן`, `«${cleanName}» נוסף ליומן`)
    );
  }

  function confirmAiPending() {
    commitAiJournal(false);
  }

  function confirmAiPendingAndDictionary() {
    commitAiJournal(true);
  }

  const pickCubeBaseClass =
    "flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 px-1.5 py-2.5 text-center text-[11px] font-bold leading-snug text-[var(--cherry)] transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out sm:min-h-[5.75rem] sm:text-xs";

  /** מראה קובייה נלחצת (תלת־ממד) — בלי להחליף לצבעי הצלחה */
  const pickCubePressedWhite =
    "translate-y-1 border-[#e8c2cb] bg-[#faf7f8] shadow-[inset_0_3px_10px_rgba(0,0,0,0.11),inset_0_-1px_0_rgba(255,255,255,0.75)]";
  const pickCubePressedGold =
    "translate-y-1 border-[#d4b24a] bg-[#fff3dd] shadow-[inset_0_3px_10px_rgba(0,0,0,0.11),inset_0_-1px_0_rgba(255,255,255,0.65)]";
  const pickCubeIdleWhite =
    "border-[var(--border-cherry-soft)] bg-white shadow-[0_2px_8px_var(--panel-shadow-soft)] hover:bg-[var(--cherry-muted)]";
  const pickCubeIdleGold =
    "border-[#e6c65c] bg-[#fff9e6] shadow-[0_2px_5px_rgba(0,0,0,0.06)] hover:bg-[#fff3cc]";

  const pickGrams = useMemo(() => {
    const n = parseFloat(pickGramsText.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? clampGrams(n) : 100;
  }, [pickGramsText]);

  const pickUnitWeightG = useMemo(() => {
    const t = pickUnitWeightText.trim();
    if (t === "") return null;
    const n = parseFloat(t.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return clampUnitWeightG(n);
  }, [pickUnitWeightText]);

  const pickUnitsQty = useMemo(() => {
    const n = parseFloat(pickUnitsText.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 1;
    return clampServingUnits(n);
  }, [pickUnitsText]);

  const pickEffectiveTotalGrams = useMemo(() => {
    if (pickUnitWeightG != null) {
      return clampGrams(Math.round(pickUnitsQty * pickUnitWeightG));
    }
    return pickGrams;
  }, [pickUnitWeightG, pickUnitsQty, pickGrams]);

  const manUnitWeightG = useMemo(() => {
    const t = manUnitWeightText.trim();
    if (t === "") return null;
    const n = parseFloat(t.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return clampUnitWeightG(n);
  }, [manUnitWeightText]);

  const manUnitsQty = useMemo(() => {
    const n = parseFloat(manUnitsText.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 1;
    return clampServingUnits(n);
  }, [manUnitsText]);

  const searchPanelSync =
    debouncedFoodSearch.length >= 2 && debouncedFoodSearch === food.trim();
  const debouncePending =
    food.trim().length >= 2 && debouncedFoodSearch !== food.trim();

  const showResultsPanel = food.trim().length >= 2;

  // todayKey was used for date navigation; keep dateKey from params only.

  useEffect(() => {
    const trimmed = food.trim();
    if (trimmed.length === 0) {
      setDebouncedFoodSearch("");
      return;
    }
    if (trimmed.length < 2) {
      setDebouncedFoodSearch("");
      return;
    }
    const t = window.setTimeout(() => {
      setDebouncedFoodSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [food]);

  // UX: new query => collapse expanded source sections
  useEffect(() => {
    setExpandedIntel(false);
    setExpandedMoh(false);
    setExpandedUsda(false);
    setExpandedWorld(false);
  }, [debouncedFoodSearch]);

  useEffect(() => {
    if (food.trim().length < 2) {
      setIntelRows([]);
      setMohRows([]);
      setUsdaRows([]);
      setHomeSearchLoading(false);
      setWorldRows([]);
      setWorldSearchLoading(false);
    }
  }, [food]);

  useEffect(() => {
    const t = food.trim();
    if (t.length < 2) return;
    if (t !== debouncedFoodSearch) {
      // no-op (AI is separated from normal search)
    }
  }, [food, debouncedFoodSearch]);

  useEffect(() => {
    if (debouncedFoodSearch.length < 2) {
      setIntelRows([]);
      setMohRows([]);
      setUsdaRows([]);
      setHomeSearchLoading(false);
      setWorldRows([]);
      setWorldSearchLoading(false);
      return;
    }
    const ac = new AbortController();
    setHomeSearchLoading(true);
    void (async () => {
      try {
        const paramsIntel = new URLSearchParams({
          q: debouncedFoodSearch,
          limit: "20",
        });
        const paramsGov = new URLSearchParams({
          q: debouncedFoodSearch,
          pageSize: "18",
        });
        const [resL, resI, resU] = await Promise.all([
          fetch(`/api/home-smart-search?${paramsIntel}`, { signal: ac.signal }),
          fetch(`/api/israel-food-search?${paramsGov}`, { signal: ac.signal }),
          fetch(`/api/usda-food-search?${paramsGov}`, { signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;

        const intel: HomeSuggestRow[] = [];
        const moh: HomeSuggestRow[] = [];
        const usda: HomeSuggestRow[] = [];

        if (resL.ok) {
          const data = (await resL.json()) as {
            items?: Array<{
              id: string;
              name: string;
              category?: string;
              calories: number;
              protein: number;
              fat: number;
              carbs: number;
            }>;
          };
          const items = data.items ?? [];
          for (const i of items) {
            intel.push({
              id: i.id,
              name: i.name,
              verified: true,
              source: "local",
              category: i.category,
              calories: i.calories,
              protein: i.protein,
              fat: i.fat,
              carbs: i.carbs,
            });
          }
        }

        if (resI.ok) {
          const data = (await resI.json()) as { items?: HomeSuggestRow[] };
          for (const row of data.items ?? []) {
            if (row?.id && row.name) moh.push(row);
          }
        }

        if (resU.ok) {
          const data = (await resU.json()) as { items?: HomeSuggestRow[] };
          for (const row of data.items ?? []) {
            if (row?.id && row.name) usda.push(row);
          }
        }

        // API already applies strict rules; client keeps only sorting.
        setIntelRows(sortHomeLocalRows(intel, debouncedFoodSearch));
        setMohRows(sortHomeLocalRows(moh, debouncedFoodSearch));
        setUsdaRows(sortHomeLocalRows(usda, debouncedFoodSearch));
      } catch (err) {
        // Aborts are expected when user keeps typing / navigates away.
        const name = (err as { name?: string } | null)?.name;
        if (ac.signal.aborted || name === "AbortError") return;
        if (!ac.signal.aborted) {
          setIntelRows([]);
          setMohRows([]);
          setUsdaRows([]);
        }
      } finally {
        if (!ac.signal.aborted) setHomeSearchLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedFoodSearch]);

  useEffect(() => {
    if (debouncedFoodSearch.length < 2) {
      setWorldRows([]);
      setWorldSearchLoading(false);
      return;
    }
    const ac = new AbortController();
    setWorldRows([]);
    setWorldSearchLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          q: debouncedFoodSearch,
          pageSize: "50",
        });
        const resW = await fetch(`/api/openfoodfacts-search?${params}`, {
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!resW.ok) {
          setWorldRows([]);
          return;
        }
        const data = (await resW.json()) as {
          items?: Array<{
            id: string;
            name: string;
            category: string;
            calories: number;
            protein: number;
            fat: number;
            carbs: number;
          }>;
        };
        const items = data.items ?? [];
        const mapped = items.map((i) => ({
          id: i.id,
          name: i.name,
          verified: false,
          source: "openFoodFacts" as const,
          calories: i.calories,
          protein: i.protein,
          fat: i.fat,
          carbs: i.carbs,
        }));
        // API already applies strict rules; client keeps only sorting.
        setWorldRows(sortHomeLocalRows(mapped, debouncedFoodSearch));
      } catch (err) {
        // Aborts are expected when user keeps typing / navigates away.
        const name = (err as { name?: string } | null)?.name;
        if (ac.signal.aborted || name === "AbortError") return;
        if (!ac.signal.aborted) setWorldRows([]);
      } finally {
        if (!ac.signal.aborted) setWorldSearchLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedFoodSearch]);

  const totalSearchHits =
    intelRows.length +
    mohRows.length +
    usdaRows.length +
    worldRows.length;

  useEffect(() => {
    if (!dictFeedback) return;
    const id = window.setTimeout(() => setDictFeedback(null), 2200);
    return () => window.clearTimeout(id);
  }, [dictFeedback]);

  useEffect(() => {
    return () => {
      if (pickFeedbackTimerRef.current) {
        clearTimeout(pickFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setRecentPicks(loadRecentFoodPicks());
  }, []);

  /** שינוי כמות / משקל יחידה / פריט אחר — מחזיר את הקוביות למצב רגיל */
  useEffect(() => {
    if (!pickModalRow?.id) return;
    setPickPressedDiary(false);
    setPickPressedDictionary(false);
    setPickPressedBothShortcut(false);
  }, [
    pickGramsText,
    pickUnitWeightText,
    pickUnitsText,
    pickModalRow?.id,
  ]);

  function applyPickModalRow(row: HomeSuggestRow): boolean {
    const c100 = row.calories;
    if (c100 == null || !Number.isFinite(c100) || c100 <= 0) {
      setDictFeedback(
        gf(
          gender,
          "אין נתוני קלוריות ל־100 ג׳ — בחרי פריט אחר",
          "אין נתוני קלוריות ל־100 ג׳ — בחר פריט אחר"
        )
      );
      return false;
    }
    setPickPressedDiary(false);
    setPickPressedDictionary(false);
    setPickPressedBothShortcut(false);
    setPickModalRow(row);
    const mem = getFoodMemory(row.name.trim());
    if (
      mem?.unit === "יחידה" &&
      typeof mem.gramsPerUnit === "number" &&
      mem.gramsPerUnit > 0 &&
      Number.isFinite(mem.quantity) &&
      mem.quantity > 0
    ) {
      setPickUnitWeightText(String(mem.gramsPerUnit));
      setPickUnitsText(String(mem.quantity));
      setPickGramsText("100");
    } else if (
      mem?.unit === "גרם" &&
      Number.isFinite(mem.quantity) &&
      mem.quantity > 0
    ) {
      setPickUnitWeightText("");
      setPickUnitsText("1");
      setPickGramsText(String(Math.max(1, Math.round(mem.quantity))));
    } else {
      setPickUnitWeightText("");
      setPickUnitsText("1");
      setPickGramsText("100");
    }
    return true;
  }

  function openPickModal(row: HomeSuggestRow, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setExpandedIntel(false);
    setExpandedMoh(false);
    setExpandedUsda(false);
    setExpandedWorld(false);
    if (applyPickModalRow(row)) {
      queueMicrotask(() => searchInputRef.current?.blur());
    }
  }

  function openPickModalFromRow(row: HomeSuggestRow) {
    setExpandedIntel(false);
    setExpandedMoh(false);
    setExpandedUsda(false);
    setExpandedWorld(false);
    if (applyPickModalRow(row)) {
      queueMicrotask(() => searchInputRef.current?.blur());
    }
  }

  function closePickModal() {
    if (pickFeedbackTimerRef.current) {
      clearTimeout(pickFeedbackTimerRef.current);
      pickFeedbackTimerRef.current = null;
    }
    setPickPressedDiary(false);
    setPickPressedDictionary(false);
    setPickPressedBothShortcut(false);
    setPickModalFeedback(null);
    setPickModalRow(null);
    setPickGramsText("100");
    setPickUnitWeightText("");
    setPickUnitsText("1");
    setFood("");
    setDebouncedFoodSearch("");
    setIntelRows([]);
    setMohRows([]);
    setUsdaRows([]);
    setWorldRows([]);
    setHomeSearchLoading(false);
    setWorldSearchLoading(false);
    setExpandedIntel(false);
    setExpandedMoh(false);
    setExpandedUsda(false);
    setExpandedWorld(false);
    queueMicrotask(() => searchInputRef.current?.focus());
  }

  function showPickModalNotice(msg: string) {
    if (pickFeedbackTimerRef.current) {
      clearTimeout(pickFeedbackTimerRef.current);
    }
    setPickModalFeedback(msg);
    pickFeedbackTimerRef.current = window.setTimeout(() => {
      setPickModalFeedback(null);
      pickFeedbackTimerRef.current = null;
    }, 3200);
  }

  function macrosFromPickRow(row: HomeSuggestRow, grams: number) {
    const c100 = row.calories ?? 0;
    const p100 =
      typeof row.protein === "number" && Number.isFinite(row.protein)
        ? Math.max(0, row.protein)
        : 0;
    const car100 =
      typeof row.carbs === "number" && Number.isFinite(row.carbs)
        ? Math.max(0, row.carbs)
        : 0;
    const f100 =
      typeof row.fat === "number" && Number.isFinite(row.fat)
        ? Math.max(0, row.fat)
        : 0;
    const factor = grams / 100;
    return {
      c100,
      p100,
      car100,
      f100,
      factor,
      kcal: Math.max(1, Math.round(c100 * factor)),
      proteinG: optionalMacroGram(p100 > 0 ? p100 * factor : undefined),
      carbsG: optionalMacroGram(car100 > 0 ? car100 * factor : undefined),
      fatG: optionalMacroGram(f100 > 0 ? f100 * factor : undefined),
      verified:
        row.verified === true &&
        (row.source ?? "local") !== "openFoodFacts" &&
        (row.source ?? "local") !== "ai",
    };
  }

  function resolvePickServing(): {
    totalG: number;
    qty: number;
    unit: FoodUnit;
    gramsPerUnit?: number;
  } {
    if (pickUnitWeightG != null) {
      return {
        totalG: pickEffectiveTotalGrams,
        qty: pickUnitsQty,
        unit: "יחידה",
        gramsPerUnit: pickUnitWeightG,
      };
    }
    return {
      totalG: pickGrams,
      qty: pickGrams,
      unit: "גרם",
    };
  }

  function submitPickDiaryOnly() {
    if (!pickModalRow) return;
    const row = pickModalRow;
    const srv = resolvePickServing();
    const m = macrosFromPickRow(row, srv.totalG);
    const entry: LogEntry = attachMealSlot({
      id: uid(),
      food: row.name.trim(),
      calories: m.kcal,
      quantity: srv.qty,
      unit: srv.unit,
      createdAt: new Date().toISOString(),
      mealStarred: false,
      verified: m.verified,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
    });
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    saveFoodMemoryKey(row.name.trim(), srv.qty, srv.unit, srv.gramsPerUnit);
    rememberFoodPick(row);
    setRecentPicks(loadRecentFoodPicks());
    setPickPressedDiary(true);
    emitMealLoggedFeedback(
      gf(
        gender,
        `«${row.name.trim()}» נוסף ליומן`,
        `«${row.name.trim()}» נוסף ליומן`
      )
    );
    showPickModalNotice(
      gf(
        gender,
        "נוסף ליומן. לשנות כמות — ערכי ולחצי שוב; לסיום — ×",
        "נוסף ליומן. לשנות כמות — ערוך ולחץ שוב; לסיום — ×"
      )
    );
  }

  function submitPickDiaryAndDictionary() {
    if (!pickModalRow) return;
    const row = pickModalRow;
    const srv = resolvePickServing();
    const m = macrosFromPickRow(row, srv.totalG);
    upsertDictionaryFromScan({
      food: row.name.trim(),
      quantity: srv.qty,
      unit: srv.unit,
      lastCalories: m.kcal,
      caloriesPer100g: m.c100,
      proteinPer100g: m.p100,
      carbsPer100g: m.car100,
      fatPer100g: m.f100,
      gramsPerUnit: srv.gramsPerUnit,
    });
    const entry: LogEntry = attachMealSlot({
      id: uid(),
      food: row.name.trim(),
      calories: m.kcal,
      quantity: srv.qty,
      unit: srv.unit,
      createdAt: new Date().toISOString(),
      mealStarred: false,
      verified: m.verified,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
    });
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    saveFoodMemoryKey(row.name.trim(), srv.qty, srv.unit, srv.gramsPerUnit);
    rememberFoodPick(row);
    setRecentPicks(loadRecentFoodPicks());
    setPickPressedDiary(true);
    setPickPressedDictionary(true);
    setPickPressedBothShortcut(true);
    emitMealLoggedFeedback(
      gf(
        gender,
        `«${row.name.trim()}» נוסף ליומן ולמילון`,
        `«${row.name.trim()}» נוסף ליומן ולמילון`
      )
    );
    showPickModalNotice(
      gf(
        gender,
        "נוסף ליומן ולמילון. סגירה ב־× כשסיימת",
        "נוסף ליומן ולמילון. סגירה ב־× כשסיימת"
      )
    );
  }

  function submitPickDictionaryOnly() {
    if (!pickModalRow) return;
    const row = pickModalRow;
    const srv = resolvePickServing();
    const m = macrosFromPickRow(row, srv.totalG);
    upsertDictionaryFromScan({
      food: row.name.trim(),
      quantity: srv.qty,
      unit: srv.unit,
      lastCalories: m.kcal,
      caloriesPer100g: m.c100,
      proteinPer100g: m.p100,
      carbsPer100g: m.car100,
      fatPer100g: m.f100,
      gramsPerUnit: srv.gramsPerUnit,
    });
    saveFoodMemoryKey(row.name.trim(), srv.qty, srv.unit, srv.gramsPerUnit);
    rememberFoodPick(row);
    setRecentPicks(loadRecentFoodPicks());
    setPickPressedDictionary(true);
    showPickModalNotice(
      gf(
        gender,
        `«${row.name.trim()}» במילון. אפשר גם ליומן או כמות אחרת; × לסגירה`,
        `«${row.name.trim()}» במילון. אפשר גם ליומן או כמות אחרת; × לסגירה`
      )
    );
  }

  function resetManualForm() {
    setManName("");
    setManKcal100("");
    setManProtein100("");
    setManCarbs100("");
    setManFat100("");
    setManGrams("100");
    setManUnitWeightText("");
    setManUnitsText("1");
    setManError(null);
  }

  function openManualModal() {
    resetManualForm();
    setManualOpen(true);
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManError(null);
    const name = manName.trim();
    const c100 = parseFloat(manKcal100.replace(",", "."));
    let totalG: number;
    let qty: number;
    let unit: FoodUnit;
    let gramsPerUnit: number | undefined;
    if (manUnitWeightG != null) {
      totalG = clampGrams(Math.round(manUnitsQty * manUnitWeightG));
      qty = manUnitsQty;
      unit = "יחידה";
      gramsPerUnit = manUnitWeightG;
    } else {
      const gRaw = parseFloat(manGrams.replace(",", "."));
      totalG = Number.isFinite(gRaw)
        ? Math.min(5000, Math.max(1, Math.round(gRaw)))
        : 100;
      qty = totalG;
      unit = "גרם";
    }
    if (!name) {
      setManError(gf(gender, "הקלידי שם מזון", "הקלד שם מזון"));
      return;
    }
    if (!Number.isFinite(c100) || c100 <= 0) {
      setManError(
        gf(
          gender,
          "הקלידי קלוריות ל־100 ג׳ (מספר חיובי)",
          "הקלד קלוריות ל־100 ג׳ (מספר חיובי)"
        )
      );
      return;
    }
    const p100 = parseFloat(manProtein100.replace(",", "."));
    const car100 = parseFloat(manCarbs100.replace(",", "."));
    const f100 = parseFloat(manFat100.replace(",", "."));
    const protein100 = Number.isFinite(p100) ? Math.max(0, p100) : 0;
    const carbs100 = Number.isFinite(car100) ? Math.max(0, car100) : 0;
    const fat100 = Number.isFinite(f100) ? Math.max(0, f100) : 0;
    const factor = totalG / 100;
    const kcal = Math.max(1, Math.round(c100 * factor));
    setManLoading(true);
    try {
      const entry: LogEntry = attachMealSlot({
        id: uid(),
        food: name,
        calories: kcal,
        quantity: qty,
        unit,
        createdAt: new Date().toISOString(),
        mealStarred: false,
        verified: false,
        proteinG: optionalMacroGram(protein100 > 0 ? protein100 * factor : undefined),
        carbsG: optionalMacroGram(carbs100 > 0 ? carbs100 * factor : undefined),
        fatG: optionalMacroGram(fat100 > 0 ? fat100 * factor : undefined),
      });
      const existing = getEntriesForDate(dateKey);
      saveDayLogEntries(dateKey, [entry, ...existing]);
      upsertDictionaryFromScan({
        food: name,
        quantity: qty,
        unit,
        lastCalories: kcal,
        caloriesPer100g: c100,
        proteinPer100g: protein100,
        carbsPer100g: carbs100,
        fatPer100g: fat100,
        gramsPerUnit,
      });
      saveFoodMemoryKey(name, qty, unit, gramsPerUnit);
      rememberFoodPick({
        id: `manual:${name}`,
        name,
        verified: false,
        calories: c100,
        protein: protein100,
        carbs: carbs100,
        fat: fat100,
        source: "local",
      });
      setRecentPicks(loadRecentFoodPicks());
      setManualOpen(false);
      resetManualForm();
      emitMealLoggedFeedback(
        gf(gender, `«${name}» נוסף ליומן`, `«${name}» נוסף ליומן`)
      );
      router.push(`/?date=${encodeURIComponent(dateKey)}`);
    } finally {
      setManLoading(false);
    }
  }

  const tabsQuery = `date=${encodeURIComponent(dateKey)}&from=${encodeURIComponent(from || "journal")}`;
  const [quickAddToast, setQuickAddToast] = useState<string | null>(null);
  const [quickAddId, setQuickAddId] = useState<string | null>(null);
  const quickAddTimerRef = useRef<number | null>(null);
  const [expandedIntel, setExpandedIntel] = useState(false);
  const [expandedMoh, setExpandedMoh] = useState(false);
  const [expandedUsda, setExpandedUsda] = useState(false);
  const [expandedWorld, setExpandedWorld] = useState(false);

  function showQuickAddToast(msg: string) {
    setQuickAddToast(msg);
    if (quickAddTimerRef.current != null) window.clearTimeout(quickAddTimerRef.current);
    quickAddTimerRef.current = window.setTimeout(() => setQuickAddToast(null), 1100);
  }

  function quickAddRowToJournal(row: HomeSuggestRow): void {
    setExpandedIntel(false);
    setExpandedMoh(false);
    setExpandedUsda(false);
    setExpandedWorld(false);
    const per100 = row.calories ?? 0;
    const mem = getFoodMemory(row.name.trim());
    const unit = mem?.unit ?? ("גרם" as const);
    const qtyRaw = mem?.quantity ?? 100;
    const qty =
      unit === "גרם"
        ? clampGrams(Number(qtyRaw))
        : clampServingUnits(Number(qtyRaw));
    const gramsTotal =
      unit === "גרם"
        ? qty
        : (() => {
            const gPerU =
              mem?.gramsPerUnit != null &&
              Number.isFinite(mem.gramsPerUnit) &&
              mem.gramsPerUnit > 0
                ? mem.gramsPerUnit
                : 0;
            return gPerU > 0 ? qty * gPerU : 0;
          })();
    const factor = gramsTotal > 0 ? gramsTotal / 100 : qty / 100;
    const calories = Math.max(1, Math.round(per100 * factor));

    const entry: LogEntry = attachMealSlot({
      id: uid(),
      food: row.name.trim(),
      calories,
      quantity: qty,
      unit,
      createdAt: new Date().toISOString(),
      verified: entryVerifiedForQuickAdd(row.source),
      ...(row.protein != null ? { proteinG: Math.round(row.protein * factor * 10) / 10 } : {}),
      ...(row.carbs != null ? { carbsG: Math.round(row.carbs * factor * 10) / 10 } : {}),
      ...(row.fat != null ? { fatG: Math.round(row.fat * factor * 10) / 10 } : {}),
    });
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    rememberFoodPick(row);
    setRecentPicks(loadRecentFoodPicks());
    setQuickAddId(`${row.source ?? "local"}-${row.id}`);
    window.setTimeout(() => setQuickAddId(null), 900);
    showQuickAddToast(`«${row.name.trim()}» נרשם ביומן`);
    emitMealLoggedFeedback(gf(gender, "נוסף ליומן.", "נוסף ליומן."));
  }

  const pickPreview = useMemo(() => {
    if (!pickModalRow) return null;
    return macrosFromPickRow(pickModalRow, pickEffectiveTotalGrams);
  }, [pickModalRow, pickEffectiveTotalGrams]);

  const selectedIntel = useMemo(() => intelRows.slice(0, 2), [intelRows]);
  const selectedMoh = useMemo(() => mohRows.slice(0, 2), [mohRows]);
  const selectedUsda = useMemo(() => usdaRows.slice(0, 2), [usdaRows]);
  const selectedWorld = useMemo(() => worldRows.slice(0, 2), [worldRows]);

  const selectedTopRows = useMemo(() => {
    return [
      ...selectedIntel,
      ...selectedMoh,
      ...selectedUsda,
      ...selectedWorld,
    ];
  }, [selectedIntel, selectedMoh, selectedUsda, selectedWorld]);

  const moreIntel = useMemo(() => intelRows.slice(2), [intelRows]);
  const moreMoh = useMemo(() => mohRows.slice(2), [mohRows]);
  const moreUsda = useMemo(() => usdaRows.slice(2), [usdaRows]);
  const moreWorld = useMemo(() => worldRows.slice(2), [worldRows]);

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-[#fff8fa] via-white to-[#f6faf3] pb-[calc(5.25rem+env(safe-area-inset-bottom))]"
      dir="rtl"
    >
      <div className="mx-auto w-full max-w-lg px-3 pt-3">
        <p className="mb-3 text-center text-sm font-semibold text-[var(--stem)]/80">
          <span className="text-[var(--cherry)]">תאריך ביומן:</span>{" "}
          {formatDateKeyHe(dateKey)}
          {dateKey === getTodayKey() ? " · היום" : ""}
        </p>
        {screen === "search" && (
          <>
            <nav
              className="mb-3"
              aria-label="מקורות הוספה"
            >
              <div className="grid grid-cols-4 gap-1 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 p-1 shadow-sm">
                {(
                  [
                    { href: `/add-food?${tabsQuery}`, label: "הכל", on: pathname === "/add-food" },
                    { href: `/menus?${tabsQuery}`, label: "תפריטים", on: pathname === "/menus" },
                    { href: `/my-recipes?${tabsQuery}`, label: "מתכונים", on: pathname === "/my-recipes" },
                    { href: `/dictionary?${tabsQuery}`, label: "מילון", on: pathname === "/dictionary" },
                  ] as const
                ).map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`rounded-xl px-2 py-2 text-center text-xs font-extrabold transition sm:text-sm ${
                      t.on
                        ? "bg-cherry-faint text-[var(--cherry)] shadow-sm"
                        : "bg-transparent text-[var(--stem)]/80 hover:bg-[var(--cherry-muted)]"
                    }`}
                    aria-current={t.on ? "page" : undefined}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
            </nav>

            <div className="sticky top-[4.5rem] z-[110] -mx-3 border-b border-[var(--border-cherry-soft)] bg-white/80 px-3 pb-3 pt-1 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2 pb-2">
                <div className="min-w-0 text-sm font-extrabold text-[var(--stem)]/75">
                  {gf(
                    gender,
                    "עוד תיעוד קטן — והיום שלך מקבל צורה.",
                    "עוד תיעוד קטן — והיום שלך מקבל צורה."
                  )}
                </div>
                {food.trim().length > 0 ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                    onClick={() => {
                      setFood("");
                      setDebouncedFoodSearch("");
                      setIntelRows([]);
                      setMohRows([]);
                      setUsdaRows([]);
                      setWorldRows([]);
                      setExpandedIntel(false);
                      setExpandedMoh(false);
                      setExpandedUsda(false);
                      setExpandedWorld(false);
                      queueMicrotask(() => searchInputRef.current?.focus());
                    }}
                  >
                    ניקוי
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 pb-2">
                <button
                  type="button"
                  className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  onClick={openManualModal}
                >
                  הוספת מוצר
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                  aria-label="סריקת ברקוד — פתיחת מצלמה לסריקת מוצר"
                  title="סריקת ברקוד"
                  onClick={() => {
                    searchInputRef.current?.blur();
                    setScanModalOpen(true);
                  }}
                >
                  <IconScanBarcode className="h-5 w-5" />
                  ברקוד
                </button>
              </div>

              <label className="block">
                <span className="sr-only">הוסף מזון</span>
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    value={food}
                    onChange={(e) => setFood(e.target.value)}
                    onFocus={(e) => {
                      if (e.currentTarget.value) e.currentTarget.select();
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={gf(gender, "הוסיפי מזון…", "הוסף מזון…")}
                    className="input-luxury-search w-full px-4"
                  />
                </div>
              </label>
            </div>

            {(quickAddToast || dictFeedback || debouncePending || showResultsPanel) && (
            <div className="mt-3 scroll-mt-[11rem] rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 p-2 shadow-sm">
              {quickAddToast && (
                <p
                  className="mb-2 rounded-lg border border-[var(--border-cherry-soft)] bg-[#ecfdf5] px-2 py-2 text-center text-xs font-semibold text-[var(--stem)]"
                  role="status"
                >
                  {quickAddToast}
                </p>
              )}
              {dictFeedback && (
                <p
                  className="rounded-lg border border-[var(--border-cherry-soft)] bg-[#fff9e6] px-2 py-2 text-center text-xs font-semibold text-[var(--stem)]"
                  role="status"
                >
                  {dictFeedback}
                </p>
              )}
              {debouncePending && (
                <p className="px-2 py-1 text-xs text-[var(--cherry)]/70" role="status">
                  ממתינים לסיום הקלדה…
                </p>
              )}

              {showResultsPanel ? (
                <div className="space-y-4">
                  {searchPanelSync &&
                  (homeSearchLoading || worldSearchLoading) &&
                  totalSearchHits === 0 ? (
                    <div className="flex items-center gap-2 px-2 py-2 text-sm text-[var(--stem)]" role="status">
                      <span
                        className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--border-cherry-soft)] border-t-[var(--cherry)]"
                        aria-hidden
                      />
                      טוען…
                    </div>
                  ) : null}

                  {searchPanelSync && !homeSearchLoading && !worldSearchLoading && totalSearchHits === 0 ? (
                    <p className="px-2 py-1 text-xs text-[var(--cherry)]/65">לא נמצאו תוצאות.</p>
                  ) : null}

                  {/* Open top picks: 2 per source */}
                  {selectedTopRows.length > 0 ? (
                    <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/85 p-2">
                      <p className="px-2 pb-1 text-sm font-extrabold text-[var(--cherry)]">
                        תוצאות נבחרות
                      </p>
                      <p className="px-2 pb-2 text-[11px] font-medium text-[var(--stem)]/60">
                        2 תוצאות מובילות מכל מאגר שמצא התאמות
                      </p>
                      <ul className="space-y-1">
                        {selectedTopRows.map((s) => (
                          <AddFoodSearchResultRow
                            key={`sel-${s.source ?? "local"}-${s.id}`}
                            row={s}
                            gender={gender}
                            quickAddId={quickAddId}
                            onOpenPick={openPickModal}
                            onQuickAdd={quickAddRowToJournal}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Collapsed sources: only those with more results beyond the top 2 */}
                  <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white/85 p-2">
                    {moreIntel.length > 0 ? (
                      <SearchSourceSection
                        title="אינטליגנציה קלורית"
                        subtitle="חיפוש חכם — מאגר אינטליגנציה קלורית ומילון"
                        rows={moreIntel}
                        loading={searchPanelSync && homeSearchLoading}
                        expanded={expandedIntel}
                        onToggle={() => setExpandedIntel((v) => !v)}
                        gender={gender}
                        quickAddId={quickAddId}
                        onOpenPick={openPickModal}
                        onQuickAdd={quickAddRowToJournal}
                        emptyText="אין עוד תוצאות במאגר אינטליגנציה קלורית."
                      />
                    ) : null}

                    {moreMoh.length > 0 ? (
                      <SearchSourceSection
                        title="משרד הבריאות (ישראל)"
                        subtitle="טבלת הרכב המזון — data.gov.il"
                        rows={moreMoh}
                        loading={searchPanelSync && homeSearchLoading}
                        expanded={expandedMoh}
                        onToggle={() => setExpandedMoh((v) => !v)}
                        gender={gender}
                        quickAddId={quickAddId}
                        onOpenPick={openPickModal}
                        onQuickAdd={quickAddRowToJournal}
                        emptyText="אין עוד תוצאות במאגר משרד הבריאות."
                      />
                    ) : null}

                    {moreUsda.length > 0 ? (
                      <SearchSourceSection
                        title="USDA"
                        subtitle="FoodData Central — ארה״ב"
                        rows={moreUsda}
                        loading={searchPanelSync && homeSearchLoading}
                        expanded={expandedUsda}
                        onToggle={() => setExpandedUsda((v) => !v)}
                        gender={gender}
                        quickAddId={quickAddId}
                        onOpenPick={openPickModal}
                        onQuickAdd={quickAddRowToJournal}
                        emptyText="אין עוד תוצאות ב-USDA."
                      />
                    ) : null}

                    {moreWorld.length > 0 ? (
                      <SearchSourceSection
                        title="Open Food Facts"
                        subtitle="מאגר עולמי — מוצרים וברקוד"
                        rows={moreWorld}
                        loading={searchPanelSync && worldSearchLoading}
                        expanded={expandedWorld}
                        onToggle={() => setExpandedWorld((v) => !v)}
                        gender={gender}
                        quickAddId={quickAddId}
                        onOpenPick={openPickModal}
                        onQuickAdd={quickAddRowToJournal}
                        emptyText="אין עוד תוצאות במאגר העולמי."
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            )}

            {recentPicks.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-sm font-extrabold text-[var(--cherry)]">
                  נבחרו לאחרונה
                </p>
                <ul className="space-y-2">
                  {recentPicks.map((r) => {
                    const { qtyLine, kcal } = recentPickQtyAndKcal(r);
                    const qk = `${r.source ?? "local"}-${r.id}`;
                    return (
                      <li
                        key={`${r.id}-${r.name}`}
                        className="flex items-stretch gap-2 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white shadow-sm"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5 px-3 py-2.5 text-start transition hover:bg-[var(--cherry-muted)]/45"
                          onClick={() => openPickModalFromRow(r)}
                        >
                          <span className="text-sm font-extrabold leading-snug text-[var(--stem)]">
                            {r.name}
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-[var(--stem)]/75">
                            {qtyLine} · {kcal} קק״ל
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`flex w-[3.25rem] shrink-0 flex-col items-center justify-center border-s-2 border-[var(--border-cherry-soft)]/60 bg-[var(--cherry-muted)]/25 transition hover:bg-[var(--cherry-muted)]/55 active:scale-[0.98] ${
                            quickAddId === qk ? "ring-2 ring-inset ring-[var(--stem)]" : ""
                          }`}
                          title={gf(gender, "הוספה מהירה ליומן", "הוספה מהירה ליומן")}
                          aria-label={gf(gender, "הוספה מהירה ליומן", "הוספה מהירה ליומן")}
                          onClick={(e) => {
                            e.stopPropagation();
                            quickAddRowToJournal(r);
                          }}
                        >
                          {quickAddId === qk ? (
                            <span className="text-lg font-extrabold text-[var(--cherry)]" aria-hidden>
                              ✓
                            </span>
                          ) : (
                            <IconPlusCircle className="h-6 w-6 text-[var(--cherry)]" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        {screen === "ai" && (
          <>
            <p className="px-1 pb-2 text-xs font-extrabold tracking-wide text-[var(--stem)]/80">
              ניתוח ארוחה חכם 🪄
            </p>
            <div
              ref={aiSectionRef}
              className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-[rgba(255,255,255,0.92)] p-3 shadow-sm"
            >
              <p className="px-1 pb-2 text-sm font-semibold leading-relaxed text-[var(--stem)]/90">
                {aiGreeting}
              </p>
              <p className="px-1 pb-2 text-xs text-[var(--stem)]/75">
                אם חסר מידע משמעותי — נשאל שאלה קצרה ואז נציג סיכום לאישור לפני שמירה ליומן.
              </p>

              {aiMealQuestion && aiMealOriginal && (
                <div className="mb-3 rounded-xl border border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)] px-3 py-2 text-sm text-[var(--stem)]">
                  <p className="font-bold text-[var(--cherry)]">שאלה מה-AI</p>
                  <p className="mt-1 leading-relaxed">{aiMealQuestion}</p>
                  <p className="mt-2 text-xs text-[var(--stem)]/75">
                    {gf(gender, "כתבי תשובה ואז לחצי על “סיכום”.", "כתוב תשובה ואז לחץ על “סיכום”.")}
                  </p>
                </div>
              )}

              {/* Summary is shown in a dedicated modal after calculation */}

              <textarea
                ref={aiTextareaRef}
                value={aiMealText}
                onChange={(e) => setAiMealText(e.target.value)}
                placeholder={aiMealQuestion ? "התשובה שלך…" : aiPlaceholder}
                rows={4}
                className="w-full resize-none rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3 text-sm text-[var(--stem)] shadow-sm outline-none focus:border-[var(--cherry)]"
              />

              {aiMealError && (
                <p className="mt-2 text-sm font-semibold text-[#a94444]">
                  {aiMealError}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className={`flex min-w-[3.25rem] items-center justify-center rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2.5 text-sm font-bold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] ${
                    aiListening ? "ring-2 ring-[var(--cherry)]" : ""
                  }`}
                  onClick={toggleAiDictation}
                  aria-label={aiListening ? "עצירת הכתבה" : "הפעלת הכתבה"}
                  title={aiListening ? "עצירת הכתבה" : "הפעלת הכתבה"}
                >
                  {gender === "male" ? "🫐" : "🍒"}
                </button>
                <button
                  type="button"
                  disabled={
                    aiMealLoading ||
                    aiConfirmOpen ||
                    aiMealText.trim().length < 1
                  }
                  className="btn-stem flex-1 rounded-2xl py-3 text-center text-sm font-extrabold disabled:opacity-50"
                  onClick={() => void runAiMeal(aiMealQuestion ? "answer" : "start")}
                >
                  {aiMealLoading ? "מחשב…" : aiMealQuestion ? "סיכום" : "חשב וסכם"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* AI confirm modal */}
      <AnimatePresence>
        {screen === "ai" && aiConfirmOpen && aiPending && (
          <motion.div
            role="presentation"
            className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setAiConfirmOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              className="glass-panel w-full max-w-md border-2 border-[var(--border-cherry-soft)] p-5 shadow-2xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-center text-sm font-extrabold text-[var(--cherry)]">סיכום ארוחה (AI)</p>
              <p className="mt-2 text-center text-base font-semibold text-[var(--stem)]">{aiPending.original}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 px-3 py-3 text-sm text-[var(--stem)]">
                <div>
                  <span className="text-[var(--stem)]/70">קלוריות</span>
                  <p className="font-extrabold">{Math.round(aiPending.totals.calories)} קק״ל</p>
                </div>
                <div>
                  <span className="text-[var(--stem)]/70">חלבון</span>
                  <p className="font-extrabold">{Math.round(aiPending.totals.protein)} ג׳</p>
                </div>
                <div>
                  <span className="text-[var(--stem)]/70">פחמימות</span>
                  <p className="font-extrabold">{Math.round(aiPending.totals.carbs)} ג׳</p>
                </div>
                <div>
                  <span className="text-[var(--stem)]/70">שומן</span>
                  <p className="font-extrabold">{Math.round(aiPending.totals.fat)} ג׳</p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex gap-2">
                  <motion.button
                    type="button"
                    className="btn-stem flex-1 rounded-2xl py-3 text-center text-sm font-extrabold"
                    whileTap={{ scale: 0.98 }}
                    onClick={confirmAiPending}
                  >
                    הוסף ליומן
                  </motion.button>
                  <button
                    type="button"
                    className="flex-1 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white py-3 text-center text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                    onClick={() => {
                      setAiConfirmOpen(false);
                      setAiPending(null);
                    }}
                  >
                    ביטול
                  </button>
                </div>
                <motion.button
                  type="button"
                  className="w-full rounded-2xl border-2 border-[#e6c65c] bg-[#fff9e6] py-2.5 text-center text-xs font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[#fff3cc]"
                  whileTap={{ scale: 0.99 }}
                  onClick={confirmAiPendingAndDictionary}
                >
                  {gf(gender, "הוסיפי ליומן ולמילון", "הוסף ליומן ולמילון")}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BarcodeScanModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onApplyToHome={(name, noteMsg) => {
          setFood(name);
          if (noteMsg.trim()) setDictFeedback(noteMsg.trim());
        }}
      />

      <AnimatePresence>
        {pickModalRow && pickPreview && (
          <motion.div
            role="presentation"
            className="fixed inset-0 z-[430] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) closePickModal();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              aria-labelledby={pickTitleId}
              className="glass-panel max-h-[90dvh] w-full max-w-md overflow-y-auto p-5 shadow-2xl"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2
                  id={pickTitleId}
                  className="panel-title-cherry text-lg leading-snug"
                >
                  הוספת מזון
                </h2>
                <button
                  type="button"
                  onClick={closePickModal}
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                >
                  סגירה
                </button>
              </div>
              <p className="mb-3 text-base font-semibold text-[var(--stem)]">
                {pickModalRow.name}
              </p>
              <p className="mb-2 text-xs font-semibold text-[var(--stem)]/65">
                ל־100 גרם
              </p>
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border-cherry-soft)] bg-white/80 px-3 py-3 text-sm">
                <div>
                  <span className="text-[var(--cherry)]/65">קלוריות</span>
                  <p className="font-bold text-[var(--stem)]">
                    {Math.round(pickModalRow.calories ?? 0)} קק״ל
                  </p>
                </div>
                <div>
                  <span className="text-[var(--cherry)]/65">חלבון</span>
                  <p className="font-bold text-[var(--stem)]">
                    {pickModalRow.protein ?? "—"} ג׳
                  </p>
                </div>
                <div>
                  <span className="text-[var(--cherry)]/65">פחמימות</span>
                  <p className="font-bold text-[var(--stem)]">
                    {pickModalRow.carbs ?? "—"} ג׳
                  </p>
                </div>
                <div>
                  <span className="text-[var(--cherry)]/65">שומן</span>
                  <p className="font-bold text-[var(--stem)]">
                    {pickModalRow.fat ?? "—"} ג׳
                  </p>
                </div>
              </div>
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                  משקל יחידה (גרם, אופציונלי)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pickUnitWeightText}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    if ((e.nativeEvent as InputEvent).isComposing) return;
                    setPickUnitWeightText(sanitizeDecimalTyping(e.target.value));
                  }}
                  onBlur={() => {
                    const t = pickUnitWeightText.trim();
                    if (t === "") return;
                    const n = parseFloat(t.replace(",", "."));
                    if (!Number.isFinite(n) || n <= 0) {
                      setPickUnitWeightText("");
                      return;
                    }
                    setPickUnitWeightText(String(clampUnitWeightG(n)));
                  }}
                  placeholder="למשל משקל פרי אחד"
                  className="input-luxury-dark w-full"
                />
              </label>
              {pickUnitWeightG != null ? (
                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                    כמות יחידות
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pickUnitsText}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      setPickUnitsText(sanitizeDecimalTyping(e.target.value));
                    }}
                    onBlur={() => {
                      const n = parseFloat(pickUnitsText.replace(",", "."));
                      if (!Number.isFinite(n) || n <= 0) {
                        setPickUnitsText("1");
                        return;
                      }
                      setPickUnitsText(String(clampServingUnits(n)));
                    }}
                    className="input-luxury-dark w-full"
                  />
                </label>
              ) : (
                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                    משקל המנה (גרם)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pickGramsText}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      if ((e.nativeEvent as InputEvent).isComposing) return;
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setPickGramsText("");
                        return;
                      }
                      const cleaned = raw
                        .replace(",", ".")
                        .replace(/[^\d.]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      const parts = cleaned.split(".");
                      const normalized =
                        parts.length <= 1
                          ? parts[0]
                          : `${parts[0]}.${parts.slice(1).join("")}`;
                      setPickGramsText(normalized);
                    }}
                    onBlur={() => {
                      const n = parseFloat(pickGramsText.replace(",", "."));
                      if (!Number.isFinite(n)) {
                        setPickGramsText("100");
                        return;
                      }
                      setPickGramsText(String(clampGrams(n)));
                    }}
                    className="input-luxury-dark w-full"
                  />
                </label>
              )}
              <div className="mb-4 rounded-xl border border-[#e6c65c]/50 bg-[#fff9e6] px-3 py-2.5 text-sm text-[var(--stem)]">
                <p className="font-bold">
                  {pickUnitWeightG != null
                    ? `למנה: ${pickUnitsQty} יחידות (סה״כ ${pickEffectiveTotalGrams} ג׳)`
                    : `למנה (${pickEffectiveTotalGrams} ג׳)`}
                </p>
                <p className="mt-1 text-[13px]">
                  קק״ל: {pickPreview.kcal}
                  {pickPreview.proteinG != null && (
                    <> · חלבון: {pickPreview.proteinG} ג׳</>
                  )}
                  {pickPreview.carbsG != null && (
                    <> · פחמימות: {pickPreview.carbsG} ג׳</>
                  )}
                  {pickPreview.fatG != null && <> · שומן: {pickPreview.fatG} ג׳</>}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <motion.button
                  type="button"
                  className={`${pickCubeBaseClass} ${
                    pickPressedDiary ? pickCubePressedWhite : pickCubeIdleWhite
                  } active:scale-[0.99]`}
                  whileTap={{ scale: 0.98 }}
                  aria-pressed={pickPressedDiary}
                  onClick={submitPickDiaryOnly}
                >
                  הוספה ליומן
                </motion.button>
                <motion.button
                  type="button"
                  className={`${pickCubeBaseClass} ${
                    pickPressedDictionary
                      ? pickCubePressedWhite
                      : pickCubeIdleWhite
                  } active:scale-[0.99]`}
                  whileTap={{ scale: 0.98 }}
                  aria-pressed={pickPressedDictionary}
                  onClick={submitPickDictionaryOnly}
                >
                  הוספה למילון
                </motion.button>
                <motion.button
                  type="button"
                  className={`${pickCubeBaseClass} ${
                    pickPressedBothShortcut
                      ? pickCubePressedGold
                      : pickCubeIdleGold
                  } active:scale-[0.99]`}
                  whileTap={{ scale: 0.98 }}
                  aria-pressed={pickPressedBothShortcut}
                  onClick={submitPickDiaryAndDictionary}
                >
                  הוספה ליומן ולמילון
                </motion.button>
              </div>
              {pickModalFeedback && (
                <p
                  className="mt-3 rounded-xl border border-[#a5d6a7] bg-[#f1f8f4] px-3 py-2.5 text-center text-[11px] font-semibold leading-snug text-[#1b5e20] sm:text-xs"
                  role="status"
                >
                  {pickModalFeedback}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {manualOpen && (
          <motion.div
            className="fixed inset-0 z-[420] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setManualOpen(false);
                resetManualForm();
              }
            }}
          >
            <motion.div
              role="dialog"
              aria-modal
              aria-labelledby={manualTitleId}
              className="glass-panel relative max-h-[90dvh] w-full max-w-md overflow-y-auto p-5 shadow-2xl"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2
                  id={manualTitleId}
                  className="panel-title-cherry text-lg leading-tight"
                >
                  הוספה ידנית
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setManualOpen(false);
                    resetManualForm();
                  }}
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                >
                  סגירה
                </button>
              </div>
              <form className="space-y-3" onSubmit={(e) => void handleManualSubmit(e)}>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                    שם המזון
                  </span>
                  <input
                    type="text"
                    value={manName}
                    onChange={(e) => setManName(e.target.value)}
                    className="input-luxury-dark w-full"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                    קלוריות ל־100 ג׳
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manKcal100}
                    onChange={(e) =>
                      setManKcal100(
                        e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                      )
                    }
                    className="input-luxury-dark w-full"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold text-[var(--stem)]">
                      חלבון /100ג
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manProtein100}
                      onChange={(e) =>
                        setManProtein100(
                          e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                        )
                      }
                      className="input-luxury-dark w-full text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold text-[var(--stem)]">
                      פחמימות /100ג
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manCarbs100}
                      onChange={(e) =>
                        setManCarbs100(
                          e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                        )
                      }
                      className="input-luxury-dark w-full text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold text-[var(--stem)]">
                      שומן /100ג
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manFat100}
                      onChange={(e) =>
                        setManFat100(
                          e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                        )
                      }
                      className="input-luxury-dark w-full text-sm"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                    משקל יחידה (גרם, אופציונלי)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manUnitWeightText}
                    onChange={(e) =>
                      setManUnitWeightText(sanitizeDecimalTyping(e.target.value))
                    }
                    onBlur={() => {
                      const t = manUnitWeightText.trim();
                      if (t === "") return;
                      const n = parseFloat(t.replace(",", "."));
                      if (!Number.isFinite(n) || n <= 0) {
                        setManUnitWeightText("");
                        return;
                      }
                      setManUnitWeightText(String(clampUnitWeightG(n)));
                    }}
                    placeholder="אם ממלאים — נפתחת כמות ביחידות"
                    className="input-luxury-dark w-full"
                  />
                </label>
                {manUnitWeightG != null ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                      כמות יחידות
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manUnitsText}
                      onChange={(e) =>
                        setManUnitsText(sanitizeDecimalTyping(e.target.value))
                      }
                      onBlur={() => {
                        const n = parseFloat(manUnitsText.replace(",", "."));
                        if (!Number.isFinite(n) || n <= 0) {
                          setManUnitsText("1");
                          return;
                        }
                        setManUnitsText(String(clampServingUnits(n)));
                      }}
                      className="input-luxury-dark w-full"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--stem)]">
                      משקל המנה (גרם)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manGrams}
                      onChange={(e) =>
                        setManGrams(e.target.value.replace(/[^\d]/g, ""))
                      }
                      className="input-luxury-dark w-full"
                    />
                  </label>
                )}
                {manError && (
                  <p className="text-sm font-semibold text-[#a94444]">{manError}</p>
                )}
                <motion.button
                  type="submit"
                  disabled={manLoading}
                  className="btn-stem w-full rounded-xl py-3 text-base font-bold disabled:opacity-50"
                  whileTap={{ scale: 0.98 }}
                >
                  {manLoading ? "שומר…" : "הוספה ליומן"}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
