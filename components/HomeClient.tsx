"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { resolveHomeInsightBubbleText } from "@/lib/assistantInsight";
import { emitEntryDeletedFeedback } from "@/lib/feedbackEvents";
import type { AppVariant } from "@/lib/appVariant";
import { kcalBurnedFromStepsMet35, met35OffsetWalkPlan } from "@/lib/burnOffset";
import { formatWalkingMinutes } from "@/lib/formatWalkDuration";
import { addDaysToDateKey, getTodayKey } from "@/lib/dateKey";
import {
  loadExerciseActivityDay,
  saveExerciseActivityDay,
  type ExerciseActivityDay,
} from "@/lib/exerciseActivity";
import {
  applyJournalFoodDisplayRename,
  type FoodUnit,
  type LogEntry,
  type MealPresetComponent,
  addMealPreset,
  getEntriesForDate,
  isMealPresetNameTaken,
  loadDictionary,
  logEntryFromMealPreset,
  type UserProfile,
  loadDayLogs,
  loadDayJournalClosedMap,
  loadWeightSkipDayKey,
  loadWeights,
  loadProfile,
  setActiveJournalDateKey,
  saveWeightSkipDayKey,
  saveDayJournalClosedMap,
  saveDayLogEntries,
  saveFoodMemoryKey,
  addDictionaryFromJournalEntryIfAbsent,
  getJournalMealPresetBreakdown,
} from "@/lib/storage";
import { buildDashboardGreetingRich } from "@/lib/dashboardGreeting";
import { dailyMacroTargetsGramsForProfile } from "@/lib/macroTargets";
import {
  dailyCalorieMotivationLine,
  gf,
  homeJournalIntroBody,
  homeJournalIntroTitle,
} from "@/lib/hebrewGenderUi";
import {
  formatMacroGramAmount,
  optionalMacroGram,
  sumMacroGrams,
} from "@/lib/macroGrams";
import { dailyCalorieTarget } from "@/lib/tdee";
import { weeklyCalorieSavingsClosedDays } from "@/lib/weeklyCalorieSavings";
import {
  getEffectiveMealSlot,
  JOURNAL_DAY_SECTION_SLOTS,
  JOURNAL_MEAL_LABELS,
  JOURNAL_MEAL_SLOTS,
  JOURNAL_MEAL_TIME_LABELS,
  type JournalDaySectionSlot,
  type JournalMealSlot,
} from "@/lib/journalMeals";
import { useDocumentScrollOnlyIfOverflowing } from "@/lib/useDocumentScrollOnlyIfOverflowing";
import { CelebrationConfetti } from "./Fireworks";
import { useAppVariant } from "./useAppVariant";
import { QuickWeightModal } from "./QuickWeightModal";
import { QuickStepsModal } from "./QuickStepsModal";
import { ChevronDown, CornerUpRight, Pencil, Trash2 } from "lucide-react";
import { IconUtensilsMeal } from "./Icons";
import { LiveClock } from "./LiveClock";

const UNITS: FoodUnit[] = [
  "גרם",
  "כוס",
  "כף",
  "כפית",
  "מריחה",
  "יחידה",
];

/** שברים לבחירה (ללא 1 — בשדה המספרי) — ערך + טקסט עשרוני */
const FRACTION_DECIMAL_ROWS = [
  [0.25, "0.25"],
  [0.33, "0.33"],
  [0.5, "0.5"],
  [0.66, "0.66"],
  [0.75, "0.75"],
] as const;

const FRACTION_VALUES = FRACTION_DECIMAL_ROWS.map((r) => r[0]);

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.009;
}

function nearestFractionBelowOne(value: number): number {
  return FRACTION_VALUES.reduce((best, v) =>
    Math.abs(v - value) < Math.abs(best - value) ? v : best
  );
}

function normalizeValue(value: number): number {
  if (value < 1) {
    return nearestFractionBelowOne(value);
  }
  return Math.round(value);
}

/** יתרת מאקרו בכותרת היומן — כולל שלילי כשחורגים מהיעד */
function formatJournalRemainingMacroG(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const v = Math.round(n * 10) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${s}ג׳`;
}

function formatQtyLabel(q: number, u: FoodUnit): string {
  if (u === "גרם") return String(Math.round(q));
  if (approxEq(q, 0.25)) return "רבע";
  if (approxEq(q, 0.33)) return "שליש";
  if (approxEq(q, 0.5)) return "חצי";
  if (approxEq(q, 0.66)) return "שני שליש";
  if (approxEq(q, 0.75)) return "שלושת רבעי";
  if (approxEq(q, 1)) return "1";
  return String(q);
}

function clampQuantity(q: number, u: FoodUnit): number {
  if (!Number.isFinite(q)) return u === "גרם" ? 100 : 1;
  if (u === "גרם") {
    return Math.min(5000, Math.max(1, Math.round(q)));
  }
  const n = normalizeValue(q);
  return Math.min(50, Math.max(0.25, n));
}

const halfMessages = [
  "התקדמות מעולה — ממשיכים בדיוק ככה!",
  "את בשליטה — וזה כבר חצי דרך!",
  "חצי יעד כבר מאחורייך — יפה!",
];

const fullMessages = [
  "יעד הושג — כל הכבוד!",
  "עשית את זה — מדויק!",
  "שליטה מלאה — ככה נראית הצלחה",
];

function getRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
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

/** הפרש ימים בלוח בין dateKey לבין היום (חיובי = עתיד, שלילי = עבר) */
function diffCalendarDaysFromToday(dateKey: string): number {
  const a = new Date(`${dateKey}T12:00:00`);
  const b = new Date(`${getTodayKey()}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/**
 * תווית מרכז פס ניווט היומן — רק שלושה מצבים מיוחדים, כל שאר הימים = תאריך מלא.
 * - אותו יום בלוח כמו היום → "היום"
 * - יום אחד לפני → "אתמול" (בלי תאריך)
 * - יום אחד אחרי → "מחר" (בלי תאריך)
 * - כל יום אחר (עבר רחוק / עתיד רחוק) → יום בשבוע + יום + חודש בעברית (לא הקיצור)
 */
function formatDateKeyHeJournalNav(dateKey: string): string {
  const d = diffCalendarDaysFromToday(dateKey);
  if (d === 0) return "היום";
  if (d === -1) return "אתמול";
  if (d === 1) return "מחר";

  const dt = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return dateKey;
  const raw = dt.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return raw.replace(/,\s*/g, " ").replace(/\s+/g, " ").trim();
}

function CalorieHeroRing({
  target,
  total,
  walkBurnKcal = 0,
  gender,
}: {
  target: number;
  total: number;
  walkBurnKcal?: number;
  gender: UserProfile["gender"];
}) {
  const remaining = target > 0 ? Math.max(0, target - total) : 0;
  const grossOver = target > 0 && total > target ? total - target : 0;
  const netOver = Math.max(0, grossOver - walkBurnKcal);
  const clearedByWalk = grossOver > 0 && netOver <= 0;
  const pct = target > 0 ? Math.min(100, (total / target) * 100) : 0;
  const size = 200;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const ringTone =
    grossOver <= 0 || clearedByWalk
      ? "text-[var(--cherry)]"
      : "text-[#b91c1c]";
  return (
    <div className="flex flex-col items-center py-2">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border-cherry-soft)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={ringTone}
            stroke="currentColor"
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease, color 0.35s ease" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center"
          dir="rtl"
        >
          {grossOver <= 0 ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--stem)]/75">
                נותרו בתקציב
              </p>
              <p className="text-4xl font-black tabular-nums leading-tight text-[var(--cherry)] md:text-[2.75rem]">
                {remaining}
              </p>
              <p className="text-sm font-semibold text-[var(--stem)]">קק״ל</p>
            </>
          ) : clearedByWalk ? (
            <>
              <p className="text-[11px] font-bold text-[var(--cherry)]">
                קיזוז הליכה
              </p>
              <p className="mt-1 px-1 text-[12px] font-bold leading-snug text-[var(--stem)] sm:text-sm">
                {gf(
                  gender,
                  "כל הכבוד! החריגה קוזזה במלואה. את שוב במסלול! 🍒",
                  "כל הכבוד! החריגה קוזזה במלואה. אתה שוב במסלול! 🫐"
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold text-[var(--stem)]/75">
                מעל היעד (אחרי קיזוז)
              </p>
              <p className="text-3xl font-black tabular-nums leading-tight text-[#b91c1c] md:text-4xl">
                +{Math.round(netOver)}
              </p>
              <p className="text-sm font-semibold text-[var(--stem)]">קק״ל</p>
            </>
          )}
          <p className="mt-2 text-xs font-medium tabular-nums text-[var(--stem)]/80">
            {total} / {target} קק״ל
            {target > 0 ? (
              <span className="mr-1 font-bold text-[var(--cherry)]">
                {" "}
                ({Math.round((total / target) * 100)}%)
              </span>
            ) : null}
          </p>
          {walkBurnKcal > 0 && grossOver > 0 ? (
            <p className="mt-1 text-[10px] font-semibold text-[var(--stem)]/70">
              קיזוז הליכה: −{walkBurnKcal} קק״ל
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-center text-sm font-semibold text-[var(--ui-home-daily-line)]">
        יעד יומי: {target} קק״ל
      </p>
    </div>
  );
}

function HomeAssistantInsightBubble({
  text,
  variant,
  gender,
  offsetPlan,
  children,
}: {
  text: string;
  variant: AppVariant;
  gender: UserProfile["gender"];
  offsetPlan: { steps: number; minutes: number } | null;
  children?: ReactNode;
}) {
  const router = useRouter();
  const cherry = variant === "cherry";
  const [walkAck, setWalkAck] = useState(false);

  useEffect(() => {
    setWalkAck(false);
  }, [offsetPlan?.steps, offsetPlan?.minutes]);

  function goAssistant() {
    router.push("/assistant");
  }

  function onCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goAssistant();
    }
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      onClick={goAssistant}
      onKeyDown={onCardKeyDown}
      className={`relative mx-auto mt-1 w-full max-w-md cursor-pointer rounded-2xl border-2 px-3 py-3 text-start shadow-[0_6px_22px_rgba(0,0,0,0.08)] transition hover:brightness-[1.02] active:scale-[0.99] sm:px-4 sm:py-3.5 ${
        cherry
          ? "border-pink-200/95 bg-gradient-to-br from-pink-50/98 via-rose-50/85 to-white/95"
          : "border-sky-300/80 bg-gradient-to-br from-sky-50/98 via-blue-50/80 to-white/95"
      }`}
      aria-label="תובנה מהעוזר — פתיחת צ׳אט"
    >
      <span
        className={`absolute -top-2 right-5 h-3 w-3 rotate-45 border-l-2 border-t-2 ${
          cherry
            ? "border-pink-200/95 bg-gradient-to-br from-pink-50 to-rose-50"
            : "border-sky-300/80 bg-gradient-to-br from-sky-50 to-blue-50"
        }`}
        aria-hidden
      />
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--stem)]/55">
        {cherry ? "Cherry" : "Blue"} · עוזר
      </p>
      <p className="mt-1 text-[13px] font-semibold leading-relaxed text-[var(--stem)] sm:text-sm">
        {text}
      </p>
      {offsetPlan ? (
        <div
          className="mt-2 border-t border-[var(--border-cherry-soft)]/60 pt-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-semibold leading-snug text-[var(--stem)] sm:text-xs">
            <span aria-hidden>👟 </span>
            כדי לאזן את החריגה היום, נדרשת הליכה של כ־
            {offsetPlan.steps.toLocaleString("he-IL")} צעדים (בערך{" "}
            {formatWalkingMinutes(offsetPlan.minutes)} בקצב בינוני).
          </p>
          <button
            type="button"
            className="mt-2 w-full rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 py-1.5 text-center text-[10px] font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] sm:py-2 sm:text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              setWalkAck(true);
            }}
          >
            {walkAck
              ? gf(gender, "מעולה, בהצלחה בדרך! ✨", "מעולה, בהצלחה! ✨")
              : gf(
                  gender,
                  "נשמע טוב, אני יוצאת לדרך! 🚶‍♀️",
                  "נשמע טוב, אני יוצא לדרך! 🚶‍♂️"
                )}
          </button>
        </div>
      ) : null}
      {children}
      <p className="mt-2 text-center text-[11px] font-bold text-[var(--cherry)]">
        {gf(gender, "לשיחה עם העוזר ←", "לשיחה עם העוזר ←")}
      </p>
    </motion.div>
  );
}

const quickNavBtnClass =
  "flex min-h-[2.75rem] flex-1 min-w-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/75 px-2 py-2.5 text-xs font-semibold text-[var(--cherry)] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99] sm:text-sm";

const journalToolbarIconClass = "h-[15px] w-[15px] shrink-0";

const JOURNAL_LONG_PRESS_MS = 520;
const JOURNAL_LONG_PRESS_CANCEL_DIST2 = 100;

type WeatherClientState = {
  tempC: number;
  description: string;
  isRain: boolean;
  isHot: boolean;
};

type WeatherLocalStorageV1 = {
  ts?: number;
  data?: Partial<WeatherClientState> & Record<string, unknown>;
};

const WEATHER_BACKGROUND_REFRESH_AFTER_MS = 60 * 60 * 1000;

function parseWeatherCachePayload(
  raw: string
): { ts: number; state: WeatherClientState } | null {
  try {
    const parsed = JSON.parse(raw) as WeatherLocalStorageV1;
    const ts = Number(parsed?.ts);
    if (!Number.isFinite(ts)) return null;
    const d = parsed?.data;
    if (!d || typeof d !== "object") return null;
    if (typeof d.tempC !== "number") return null;
    return {
      ts,
      state: {
        tempC: d.tempC,
        description: String(d.description ?? ""),
        isRain: Boolean(d.isRain),
        isHot: Boolean(d.isHot),
      },
    };
  } catch {
    return null;
  }
}

export function HomeClient({ mode = "dashboard" }: { mode?: "dashboard" | "journal" }) {
  const gender = loadProfile().gender;
  const appVariant = useAppVariant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [dictTick, setDictTick] = useState(0);

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [mealNameDraft, setMealNameDraft] = useState("");
  const [mealNameDuplicateError, setMealNameDuplicateError] = useState(false);
  const [mealCtaEntryId, setMealCtaEntryId] = useState<string | null>(null);
  const [journalInfoOpen, setJournalInfoOpen] = useState(false);
  const [journalFoodNameEditId, setJournalFoodNameEditId] = useState<
    string | null
  >(null);
  const [journalFoodNameDraft, setJournalFoodNameDraft] = useState("");
  const journalFoodNameInputRef = useRef<HTMLInputElement>(null);
  const journalLongPressRef = useRef<{
    timer: number | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    entryId: string | null;
  }>({
    timer: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    entryId: null,
  });

  const datePickerRef = useRef<HTMLInputElement | null>(null);

  const [journalCardActionEntry, setJournalCardActionEntry] =
    useState<LogEntry | null>(null);
  const [journalCardMoveOpen, setJournalCardMoveOpen] = useState(false);

  const [celebration, setCelebration] = useState({
    show: false,
    message: "",
    fadeOut: false,
  });
  const [milestones, setMilestones] = useState({ half: false, full: false });
  const prevCaloriesRef = useRef<number | null>(null);
  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const celebrationHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [viewDateKey, setViewDateKey] = useState(() => getTodayKey());
  const prevCalKeyRef = useRef(getTodayKey());

  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<LogEntry | null>(null);
  const [editQtyText, setEditQtyText] = useState("1");
  const editQty = useMemo(() => {
    const n = parseFloat(editQtyText.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [editQtyText]);
  const [editUnit, setEditUnit] = useState<FoodUnit>("גרם");
  const [editLoading, setEditLoading] = useState(false);
  const [aiExpandedId, setAiExpandedId] = useState<string | null>(null);
  const [journalMealPresetExpandedId, setJournalMealPresetExpandedId] =
    useState<string | null>(null);
  const [exerciseDay, setExerciseDay] = useState<ExerciseActivityDay | null>(
    null
  );
  const [stepsDraft, setStepsDraft] = useState("");
  const [exerciseSaving, setExerciseSaving] = useState(false);

  const [journalClosedMap, setJournalClosedMap] = useState<
    Record<string, boolean>
  >({});

  const [quickWeightOpen, setQuickWeightOpen] = useState(false);
  const [quickStepsOpen, setQuickStepsOpen] = useState(false);
  const [weightSkipRev, setWeightSkipRev] = useState(0);
  const [weightToast, setWeightToast] = useState<{
    show: boolean;
    fade: boolean;
    message: string;
  }>({ show: false, fade: false, message: "" });

  const [mealHintInlineEntryId, setMealHintInlineEntryId] = useState<
    string | null
  >(null);
  const mealHintInlineTimerRef = useRef<number | null>(null);

  function clearMealHintInline() {
    if (mealHintInlineTimerRef.current != null) {
      window.clearTimeout(mealHintInlineTimerRef.current);
      mealHintInlineTimerRef.current = null;
    }
    setMealHintInlineEntryId(null);
  }

  function showMealHintInline(entryId: string) {
    clearMealHintInline();
    setMealHintInlineEntryId(entryId);
    mealHintInlineTimerRef.current = window.setTimeout(() => {
      clearMealHintInline();
    }, 4500);
  }

  useEffect(() => {
    return () => {
      if (mealHintInlineTimerRef.current != null) {
        window.clearTimeout(mealHintInlineTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setJournalClosedMap(loadDayJournalClosedMap());
  }, []);

  const [greetingHour, setGreetingHour] = useState(() =>
    new Date().getHours()
  );
  useEffect(() => {
    const id = window.setInterval(
      () => setGreetingHour(new Date().getHours()),
      60_000
    );
    return () => clearInterval(id);
  }, []);

  const isDayClosed = journalClosedMap[viewDateKey] === true;
  const canGoNextDay = true;

  function navigateToDate(dk: string) {
    setViewDateKey(dk);
    setEntries(getEntriesForDate(dk));
    const base = isJournalMode ? "/journal" : "/";
    if (dk === getTodayKey()) {
      router.replace(base, { scroll: false });
    } else {
      router.replace(`${base}?date=${encodeURIComponent(dk)}`, { scroll: false });
    }
  }

  function onJournalDayDragEnd(
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) {
    const { offset, velocity } = info;
    if (Math.abs(offset.y) > Math.abs(offset.x) * 1.25) return;
    const threshold = 48;
    const vThresh = 380;
    // קבוע לפי המשתמשת: החלקה ימינה = עתיד (+יום), החלקה שמאלה = עבר (−יום).
    // ב-framer: offset.x חיובי = תזוזה ימינה, שלילי = שמאלה.
    if (offset.x > threshold || velocity.x > vThresh) {
      if (canGoNextDay) navigateToDate(addDaysToDateKey(viewDateKey, 1));
      return;
    }
    if (offset.x < -threshold || velocity.x < -vThresh) {
      navigateToDate(addDaysToDateKey(viewDateKey, -1));
    }
  }

  // Date picker kept for future; not used in journal header UX right now.

  function toggleJournalClosedForViewDay() {
    const m = { ...loadDayJournalClosedMap() };
    const k = viewDateKey;
    const wasClosed = m[k] === true;
    if (m[k]) {
      delete m[k];
    } else {
      m[k] = true;
    }
    saveDayJournalClosedMap(m);
    setJournalClosedMap(m);
    window.dispatchEvent(new Event("cj-journal-closed-changed"));
    if (!wasClosed && m[k] === true) {
      router.push("/calorie-board");
    }
  }

  useEffect(() => {
    setProfile(loadProfile());
    const refresh = () => {
      setProfile(loadProfile());
      setEntries(getEntriesForDate(viewDateKey));
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("cj-profile-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cj-profile-updated", refresh);
    };
  }, [viewDateKey]);

  const target = profile ? dailyCalorieTarget(profile) : 0;

  const total = useMemo(
    () => entries.reduce((s, e) => s + e.calories, 0),
    [entries]
  );

  const totalProteinG = useMemo(
    () => sumMacroGrams(entries, "proteinG"),
    [entries]
  );
  const totalCarbsG = useMemo(
    () => sumMacroGrams(entries, "carbsG"),
    [entries]
  );
  const totalFatG = useMemo(
    () => sumMacroGrams(entries, "fatG"),
    [entries]
  );

  const macroGoals = useMemo(
    () =>
      profile
        ? dailyMacroTargetsGramsForProfile(
            target,
            profile.weightKg,
            profile.gender
          )
        : { proteinG: 0, carbsG: 0, fatG: 0 },
    [target, profile]
  );

  const remainingKcal = useMemo(() => Math.round(target - total), [target, total]);
  const remainingProteinG = useMemo(
    () => Math.round((macroGoals.proteinG - totalProteinG) * 10) / 10,
    [macroGoals.proteinG, totalProteinG]
  );
  const remainingCarbsG = useMemo(
    () => Math.round((macroGoals.carbsG - totalCarbsG) * 10) / 10,
    [macroGoals.carbsG, totalCarbsG]
  );
  const remainingFatG = useMemo(
    () => Math.round((macroGoals.fatG - totalFatG) * 10) / 10,
    [macroGoals.fatG, totalFatG]
  );

  /** חלוקת פריטי היום — לפי חלון ארוחה שמור (מודל «העבר אל…») או לפי שעת רישום */
  const entriesByJournalDaySection = useMemo(() => {
    const m: Record<JournalDaySectionSlot, LogEntry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      night: [],
      snack: [],
    };
    for (const e of entries) {
      m[getEffectiveMealSlot(e) as JournalDaySectionSlot].push(e);
    }
    for (const slot of JOURNAL_DAY_SECTION_SLOTS) {
      m[slot].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return m;
  }, [entries]);

  const greetingModel = useMemo(
    () => buildDashboardGreetingRich(profile?.firstName ?? "", new Date()),
    // refresh on hour tick (and profile name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.firstName, greetingHour],
  );

  const isJournalMode = mode === "journal";

  useDocumentScrollOnlyIfOverflowing(
    isJournalMode
      ? {
          remeasureKey: `${viewDateKey}:${entries.length}:${dictTick}:${
            journalClosedMap[viewDateKey] === true ? "1" : "0"
          }`,
        }
      : { enabled: false }
  );

  useEffect(() => {
    if (!isJournalMode) return;
    getEntriesForDate(addDaysToDateKey(viewDateKey, -1));
    getEntriesForDate(addDaysToDateKey(viewDateKey, 1));
  }, [isJournalMode, viewDateKey]);

  useEffect(() => {
    if (!isJournalMode) return;
    const openJournalHelp = () => setJournalInfoOpen(true);
    window.addEventListener("cj-journal-help", openJournalHelp);
    return () => window.removeEventListener("cj-journal-help", openJournalHelp);
  }, [isJournalMode]);

  const weeklySavings = useMemo(
    () =>
      profile
        ? weeklyCalorieSavingsClosedDays(profile, journalClosedMap)
        : 0,
    [profile, journalClosedMap]
  );

  function closeAllJournalDays(): void {
    const all = loadDayLogs();
    const next = { ...loadDayJournalClosedMap() };
    for (const [k, list] of Object.entries(all)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      next[k] = true;
    }
    saveDayJournalClosedMap(next);
    setJournalClosedMap(next);
  }

  const dailyMotivationLine = useMemo(
    () => dailyCalorieMotivationLine(gender, target, total),
    [gender, target, total]
  );

  const [weather, setWeather] = useState<null | WeatherClientState>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("cj_weather_v1");
    if (!raw) return;
    const parsed = parseWeatherCachePayload(raw);
    if (!parsed) return;
    setWeather(parsed.state);
  }, []);

  /** ריענון שקט כשהמטמון ישן — רק אם הרשאת מיקום כבר granted (בלי חלון הרשאה באמצע הבית). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("cj_weather_v1");
    if (!raw) return;
    const parsed = parseWeatherCachePayload(raw);
    if (!parsed) return;
    if (Date.now() - parsed.ts <= WEATHER_BACKGROUND_REFRESH_AFTER_MS) return;
    if (!("geolocation" in navigator) || !window.isSecureContext) return;

    let cancelled = false;
    (async () => {
      try {
        const permissionState =
          "permissions" in navigator && navigator.permissions?.query
            ? await navigator.permissions
                .query({ name: "geolocation" as PermissionName })
                .then((x) => x.state)
                .catch(() => "" as const)
            : "";
        if (permissionState !== "granted") return;

        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 15_000,
            maximumAge: 5 * 60 * 1000,
          });
        });
        if (cancelled) return;
        const res = await fetch(
          `/api/weather?lat=${encodeURIComponent(pos.coords.latitude)}&lon=${encodeURIComponent(pos.coords.longitude)}`
        );
        const data = (await res.json()) as {
          ok?: boolean;
          tempC?: number;
          description?: string;
          isRain?: boolean;
          isHot?: boolean;
        };
        if (!data?.ok || typeof data.tempC !== "number") return;
        if (cancelled) return;
        const next: WeatherClientState = {
          tempC: data.tempC,
          description: String(data.description ?? ""),
          isRain: Boolean(data.isRain),
          isHot: Boolean(data.isHot),
        };
        setWeather(next);
        localStorage.setItem(
          "cj_weather_v1",
          JSON.stringify({ ts: Date.now(), data: next })
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dailyMotivationLineWithWeather = useMemo(() => {
    if (!dailyMotivationLine) return null;
    if (!weather) return dailyMotivationLine;
    const extra = weather.isRain
      ? gf(gender, " טיפ קטן: גשם בחוץ — מרק חם יכול להיות מושלם הערב.", " טיפ קטן: גשם בחוץ — מרק חם יכול להיות מושלם הערב.")
      : weather.isHot
        ? gf(gender, " טיפ קטן: שרב — שימי דגש על מים וארוחה קלילה.", " טיפ קטן: שרב — שים דגש על מים וארוחה קלילה.")
        : "";
    return `${dailyMotivationLine}${extra}`;
  }, [dailyMotivationLine, weather, gender]);

  /** חריגה גולמית מהיעד (לפני קיזוז הליכה) */
  const overGoalKcal =
    target > 0 && total > target ? total - target : 0;
  const isViewingToday = viewDateKey === getTodayKey();

  const walkBurnKcal = useMemo(() => {
    if (!profile || !exerciseDay) return 0;
    return kcalBurnedFromStepsMet35(
      exerciseDay.reportedSteps,
      profile.weightKg
    );
  }, [profile, exerciseDay]);

  const netOverKcal = useMemo(
    () => Math.max(0, Math.round(overGoalKcal) - walkBurnKcal),
    [overGoalKcal, walkBurnKcal]
  );

  const weightDue = useMemo(() => {
    void weightSkipRev;
    if (!profile || !isViewingToday) return false;
    try {
      // Baseline row may be created lazily; do not require it.
      const today = getTodayKey();
      const skipKey = loadWeightSkipDayKey();
      if (skipKey === today) return false;
      const weights = loadWeights();
      const hasToday = weights.some((w) => w && w.date === today);
      if (hasToday) return false;
      const freq = profile.weighInFrequency ?? "daily";
      if (freq === "daily") return true;
      const d = new Date(`${today}T12:00:00`);
      if (Number.isNaN(d.getTime())) return false;
      if (freq === "weekly") {
        const wd = typeof profile.weighInWeekday === "number" ? profile.weighInWeekday : 1;
        return d.getDay() === Math.min(6, Math.max(0, Math.floor(wd)));
      }
      if (freq === "monthly") {
        const md =
          typeof profile.weighInMonthDay === "number" ? profile.weighInMonthDay : 1;
        return d.getDate() === Math.min(28, Math.max(1, Math.floor(md)));
      }
      return true;
    } catch {
      return false;
    }
  }, [profile, isViewingToday, weightSkipRev]);

  const nextStep = useMemo(() => {
    if (!profile) return null as null | "weight" | "walk" | "food";
    if (weightDue) return "weight";
    if (netOverKcal > 0) return "walk";
    return "food";
  }, [profile, weightDue, netOverKcal]);

  function triggerWeightToast(prevKg: number | null, newKg: number) {
    if (prevKg == null) return;
    const delta = prevKg - newKg;
    if (!Number.isFinite(delta) || delta <= 0.05) return;
    const lines = [
      "אלופה! צעד קטן — תוצאה גדולה.",
      "איזה יופי! ההתמדה שלך מנצחת.",
      "וואו, ירידה מדויקת. ממשיכים ככה!",
      "כל הכבוד! זה בדיוק הכיוון.",
    ];
    const line = lines[Math.floor(Math.random() * lines.length)]!;
    const msg = `ירדת ${Math.round(delta * 10) / 10} ק״ג מאז השקילה האחרונה. ${line}`;
    setWeightToast({ show: true, fade: false, message: msg });
    window.setTimeout(() => {
      setWeightToast((t) => (t.show ? { ...t, fade: true } : t));
      window.setTimeout(() => {
        setWeightToast({ show: false, fade: false, message: "" });
      }, 500);
    }, 2500);
  }

  const insightBubbleText = useMemo(
    () => resolveHomeInsightBubbleText(gender, isViewingToday, netOverKcal),
    [gender, isViewingToday, netOverKcal]
  );

  const calorieOffsetPlan = useMemo(() => {
    if (!profile || !isViewingToday) return null;
    const kcal = netOverKcal;
    if (kcal <= 0) return null;
    return met35OffsetWalkPlan(kcal, profile.weightKg);
  }, [profile, isViewingToday, netOverKcal]);

  useEffect(() => {
    if (!isViewingToday) {
      setExerciseDay(null);
      setStepsDraft("");
      return;
    }
    let alive = true;
    void (async () => {
      const row = await loadExerciseActivityDay(getTodayKey());
      if (!alive) return;
      if (row && row.reportedSteps > 0) {
        setExerciseDay(row);
        setStepsDraft(String(row.reportedSteps));
      } else {
        setExerciseDay(row);
        setStepsDraft(row ? String(row.reportedSteps) : "");
      }
    })();
    return () => {
      alive = false;
    };
  }, [isViewingToday, viewDateKey]);

  useEffect(() => {
    if (!isViewingToday) return;
    const onEx = () => {
      void loadExerciseActivityDay(getTodayKey()).then((row) => {
        setExerciseDay(row);
        if (row) setStepsDraft(String(row.reportedSteps));
      });
    };
    window.addEventListener("cj-exercise-activity-updated", onEx);
    return () =>
      window.removeEventListener("cj-exercise-activity-updated", onEx);
  }, [isViewingToday]);

  async function submitReportedSteps() {
    if (!profile || !isViewingToday) return;
    const raw = stepsDraft.replace(/[^\d]/g, "");
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;
    setExerciseSaving(true);
    try {
      await saveExerciseActivityDay(getTodayKey(), n);
      setExerciseDay({
        reportedSteps: n,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setExerciseSaving(false);
    }
  }

  const triggerCelebration = useCallback((type: "half" | "full") => {
    const message =
      type === "half" ? getRandom(halfMessages) : getRandom(fullMessages);
    setCelebration({ show: true, message, fadeOut: false });
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
    }
    if (celebrationHideRef.current) {
      clearTimeout(celebrationHideRef.current);
    }
    celebrationTimeoutRef.current = setTimeout(() => {
      setCelebration((prev) => ({ ...prev, fadeOut: true }));
      celebrationHideRef.current = setTimeout(() => {
        setCelebration((prev) => ({ ...prev, show: false }));
      }, 500);
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
      if (celebrationHideRef.current) {
        clearTimeout(celebrationHideRef.current);
      }
    };
  }, []);

  const starredForMealCount = useMemo(
    () => entries.filter((e) => e.mealStarred).length,
    [entries]
  );

  const persistEntries = useCallback((next: LogEntry[]) => {
    saveDayLogEntries(viewDateKey, next);
    setEntries(next);
  }, [viewDateKey]);

  useEffect(() => {
    if (!journalFoodNameEditId) return;
    const tid = window.setTimeout(
      () => journalFoodNameInputRef.current?.focus(),
      50
    );
    return () => window.clearTimeout(tid);
  }, [journalFoodNameEditId]);

  useEffect(() => {
    if (isDayClosed && journalFoodNameEditId) {
      setJournalFoodNameEditId(null);
      setJournalFoodNameDraft("");
    }
  }, [isDayClosed, journalFoodNameEditId]);

  function cancelJournalFoodNameEdit() {
    setJournalFoodNameEditId(null);
    setJournalFoodNameDraft("");
  }

  function saveJournalFoodNameEdit() {
    if (!journalFoodNameEditId || isDayClosed) return;
    const name = journalFoodNameDraft.trim();
    if (!name) return;
    if (
      !applyJournalFoodDisplayRename(
        viewDateKey,
        journalFoodNameEditId,
        name
      )
    ) {
      return;
    }
    cancelJournalFoodNameEdit();
    setEntries(getEntriesForDate(viewDateKey));
    setDictTick((t) => t + 1);
  }

  useEffect(() => {
    setEntries(getEntriesForDate(viewDateKey));
  }, [viewDateKey]);

  useEffect(() => {
    const raw = searchParams.get("date");
    const dk =
      raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : getTodayKey();
    setViewDateKey((prev) => (prev === dk ? prev : dk));
    setEntries(getEntriesForDate(dk));
  }, [searchParams]);

  useEffect(() => {
    setActiveJournalDateKey(viewDateKey);
  }, [viewDateKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = getTodayKey();
      if (now !== prevCalKeyRef.current) {
        const before = prevCalKeyRef.current;
        prevCalKeyRef.current = now;
        setViewDateKey((v) => (v === before ? now : v));
      }
    }, 25000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    prevCaloriesRef.current = null;
    setMilestones({ half: false, full: false });
  }, [viewDateKey]);

  useEffect(() => {
    return () => {
      const t = journalLongPressRef.current.timer;
      if (t != null) window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const goalCalories = target;
    const currentCalories = total;
    if (!profile || goalCalories <= 0) return;
    if (viewDateKey !== getTodayKey()) {
      prevCaloriesRef.current = currentCalories;
      return;
    }

    const prev = prevCaloriesRef.current;
    const curr = currentCalories;
    if (prev === null) {
      prevCaloriesRef.current = curr;
      return;
    }

    const half = goalCalories * 0.5;
    const full = goalCalories;

    if (prev < full && curr >= full && !milestones.full) {
      triggerCelebration("full");
      setMilestones((m) => ({ ...m, full: true, half: true }));
    } else if (prev < half && curr >= half && !milestones.half) {
      triggerCelebration("half");
      setMilestones((m) => ({ ...m, half: true }));
    }

    prevCaloriesRef.current = curr;
  }, [total, target, profile, viewDateKey, milestones, triggerCelebration]);

  function removeEntry(id: string) {
    if (isDayClosed) return;
    persistEntries(entries.filter((x) => x.id !== id));
    emitEntryDeletedFeedback();
  }

  function clearJournalLongPressTimer() {
    const t = journalLongPressRef.current.timer;
    if (t != null) window.clearTimeout(t);
    journalLongPressRef.current.timer = null;
    journalLongPressRef.current.pointerId = null;
    journalLongPressRef.current.entryId = null;
  }

  function handleJournalCardPointerDown(
    e: React.PointerEvent<HTMLLIElement>,
    item: LogEntry
  ) {
    if (!isJournalMode || isDayClosed) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest("[data-skip-journal-longpress]")) return;

    clearJournalLongPressTimer();
    journalLongPressRef.current.pointerId = e.pointerId;
    journalLongPressRef.current.startX = e.clientX;
    journalLongPressRef.current.startY = e.clientY;
    journalLongPressRef.current.entryId = item.id;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    journalLongPressRef.current.timer = window.setTimeout(() => {
      journalLongPressRef.current.timer = null;
      journalLongPressRef.current.pointerId = null;
      journalLongPressRef.current.entryId = null;
      setJournalCardMoveOpen(false);
      setJournalCardActionEntry(item);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
    }, JOURNAL_LONG_PRESS_MS);
  }

  function handleJournalCardPointerMove(e: React.PointerEvent<HTMLLIElement>) {
    if (journalLongPressRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - journalLongPressRef.current.startX;
    const dy = e.clientY - journalLongPressRef.current.startY;
    if (dx * dx + dy * dy > JOURNAL_LONG_PRESS_CANCEL_DIST2) {
      clearJournalLongPressTimer();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function handleJournalCardPointerEnd(e: React.PointerEvent<HTMLLIElement>) {
    if (journalLongPressRef.current.pointerId !== e.pointerId) return;
    clearJournalLongPressTimer();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  /** במחשב: לחיצה ימנית = אותו תפריט כמו לחיצה ארוכה בנייד */
  function handleJournalCardContextMenu(
    e: React.MouseEvent<HTMLLIElement>,
    item: LogEntry
  ) {
    if (!isJournalMode || isDayClosed) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest("[data-skip-journal-longpress]")) return;
    e.preventDefault();
    clearJournalLongPressTimer();
    setJournalCardMoveOpen(false);
    setJournalCardActionEntry(item);
  }

  function moveJournalEntryToSlot(id: string, slot: JournalMealSlot) {
    if (isDayClosed) return;
    persistEntries(
      entries.map((e) => (e.id === id ? { ...e, mealSlot: slot } : e))
    );
    setJournalCardMoveOpen(false);
    setJournalCardActionEntry(null);
  }

  function toggleMealStar(id: string) {
    if (isDayClosed) return;
    const next = entries.map((e) =>
      e.id === id ? { ...e, mealStarred: !e.mealStarred } : e
    );
    const starredCount = next.filter((e) => e.mealStarred).length;
    persistEntries(next);
    setMealCtaEntryId(id);
    if (starredCount === 1) {
      showMealHintInline(id);
    } else {
      clearMealHintInline();
    }
  }

  function clearMealStarSelection() {
    if (isDayClosed) return;
    clearMealHintInline();
    persistEntries(entries.map((e) => ({ ...e, mealStarred: false })));
    setMealCtaEntryId(null);
  }

  function openMealModal() {
    if (isDayClosed) return;
    setMealNameDraft("");
    setMealNameDuplicateError(false);
    setMealModalOpen(true);
  }

  function confirmCreateMeal() {
    if (isDayClosed) return;
    const name = mealNameDraft.trim();
    if (!name) return;
    if (isMealPresetNameTaken(name)) {
      setMealNameDuplicateError(true);
      return;
    }
    setMealNameDuplicateError(false);
    const starred = entries.filter((e) => e.mealStarred);
    if (starred.length < 2) return;

    const components: MealPresetComponent[] = starred.map((e) => ({
      food: e.food,
      quantity: e.quantity,
      unit: e.unit,
      calories: e.calories,
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
    }));

    const presetsList = addMealPreset({ name, components });
    const preset = presetsList[0]!;
    loadDictionary();

    const starredIds = new Set(starred.map((e) => e.id));
    const insertAt = entries.findIndex((e) => starredIds.has(e.id));
    /** זמן וסעיף יומן: לפי הפריט שנרשם הכי מוקדם בקבוצה (כולל אחרי «העבר אל»). */
    const sortedStarred = [...starred].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    const anchor = sortedStarred[0]!;
    const combined = logEntryFromMealPreset(preset, {
      createdAt: anchor.createdAt,
      ...(anchor.mealSlot ? { mealSlot: anchor.mealSlot } : {}),
    });

    const without = entries.filter((e) => !starredIds.has(e.id));
    const safeInsert =
      insertAt < 0 ? 0 : Math.min(insertAt, without.length);
    const next = [
      ...without.slice(0, safeInsert),
      combined,
      ...without.slice(safeInsert),
    ];
    persistEntries(next);

    for (const e of starred) {
      addDictionaryFromJournalEntryIfAbsent(e);
    }
    setDictTick((t) => t + 1);

    setMealModalOpen(false);
    setMealNameDraft("");
  }

  function openEdit(item: LogEntry) {
    if (isDayClosed) return;
    setEditEntry(item);
    setEditQtyText(String(item.quantity));
    setEditUnit(item.unit);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editEntry || isDayClosed) return;
    const q = clampQuantity(editQty, editUnit);
    setEditQtyText(String(q));
    setEditLoading(true);
    try {
      const res = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food: editEntry.food,
          quantity: q,
          unit: editUnit,
        }),
      });
      const data = (await res.json()) as {
        calories?: number;
        verified?: boolean;
        error?: string;
        proteinG?: number;
        carbsG?: number;
        fatG?: number;
        protein?: number;
        carbohydrates?: number;
        fat?: number;
      };
      if (!res.ok) return;
      const kcal = data.calories ?? 0;
      const proteinG = optionalMacroGram(data.proteinG ?? data.protein);
      const carbsG = optionalMacroGram(data.carbsG ?? data.carbohydrates);
      const fatG = optionalMacroGram(data.fatG ?? data.fat);
      persistEntries(
        entries.map((e) =>
          e.id === editEntry.id
            ? {
                ...e,
                quantity: q,
                unit: editUnit,
                calories: kcal,
                verified: data.verified === true,
                proteinG,
                carbsG,
                fatG,
              }
            : e
        )
      );
      saveFoodMemoryKey(editEntry.food, q, editUnit);
      setEditOpen(false);
      setEditEntry(null);
    } finally {
      setEditLoading(false);
    }
  }

  if (!profile) {
    return (
      <div className="p-8 text-center text-lg text-[var(--text)]" dir="rtl">
        טוען…
      </div>
    );
  }

  const showAssistantBubble =
    isViewingToday &&
    (insightBubbleText != null ||
      Math.round(overGoalKcal) > 0 ||
      (exerciseDay?.reportedSteps ?? 0) > 0);

  const bubbleMainText =
    insightBubbleText ??
    gf(
      gender,
      "דיווח צעדים למטה מחשב קיזוז לפי MET 3.5 ומעדכן את הגרף.",
      "דיווח צעדים למטה מחשב קיזוז לפי MET 3.5 ומעדכן את הגרף."
    );

  const compact = mode === "journal";
  const showHomeSearchTrigger = mode === "dashboard";
  const showHomeMenu = mode === "dashboard";
  void showHomeSearchTrigger;
  void showHomeMenu;

  return (
    <div
      className={`mx-auto max-w-lg ${compact ? "cj-compact px-3 pb-0 pt-0" : "px-4 pb-32 pt-6 md:pt-10"}`}
      dir="rtl"
    >
      {celebration.show && (
        <div
          className={`celebration ${celebration.fadeOut ? "fade-out" : ""}`}
        >
          <CelebrationConfetti />
          <div className="message">{celebration.message}</div>
        </div>
      )}

      <AnimatePresence>
        {mealModalOpen && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/25 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal
            aria-labelledby="meal-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setMealModalOpen(false);
                setMealNameDuplicateError(false);
              }
            }}
          >
            <motion.div
              className="glass-panel w-full max-w-md space-y-4 p-5"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="meal-modal-title"
                className="panel-title-cherry text-lg"
              >
                שמירה למילון
              </h2>
              <div className="space-y-1.5">
                <input
                  id="meal-modal-name-input"
                  type="text"
                  value={mealNameDraft}
                  onChange={(e) => {
                    setMealNameDraft(e.target.value);
                    if (mealNameDuplicateError) setMealNameDuplicateError(false);
                  }}
                  placeholder="שם הארוחה"
                  className="input-luxury-search"
                  autoFocus
                  aria-invalid={mealNameDuplicateError}
                  aria-describedby={
                    mealNameDuplicateError ? "meal-modal-name-error" : undefined
                  }
                />
                {mealNameDuplicateError ? (
                  <p
                    id="meal-modal-name-error"
                    className="text-sm font-semibold leading-snug text-[var(--cherry)]"
                    role="alert"
                  >
                    {gf(
                      gender,
                      "כבר קיימת ארוחה שמורה בשם הזה — בחרי שם אחר.",
                      "כבר קיימת ארוחה שמורה בשם הזה — בחר שם אחר."
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-stem flex-1 rounded-xl py-3 font-semibold"
                  onClick={confirmCreateMeal}
                  disabled={!mealNameDraft.trim()}
                >
                  שמירה
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white py-3 font-semibold text-[var(--text)]"
                  onClick={() => {
                    setMealModalOpen(false);
                    setMealNameDuplicateError(false);
                  }}
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editOpen && editEntry && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/25 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal
            aria-labelledby="edit-entry-title"
          >
            <motion.div
              className="glass-panel w-full max-w-md space-y-4 p-5"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <h2
                id="edit-entry-title"
                className="panel-title-cherry text-lg"
              >
                עריכת כמות
              </h2>
              <p className="text-sm text-[var(--text)]/90">
                <span className="bidi-isolate-rtl">{editEntry.food}</span>
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="min-w-[6rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[var(--text)]">
                    כמות
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editQtyText}
                    onFocus={(e) => {
                      if (e.currentTarget.value.trim() === "0") {
                        setEditQtyText("");
                      }
                      e.currentTarget.select();
                    }}
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
                      const normalized =
                        parts.length <= 1
                          ? parts[0]
                          : `${parts[0]}.${parts.slice(1).join("")}`;
                      setEditQtyText(normalized);
                    }}
                    onBlur={() =>
                      setEditQtyText((x) => {
                        const n = parseFloat(x.replace(",", "."));
                        if (!Number.isFinite(n)) return x;
                        return String(clampQuantity(n, editUnit));
                      })
                    }
                    className="input-luxury-dark w-full"
                  />
                </label>
                <label className="min-w-[8rem] flex-[2]">
                  <span className="mb-1 block text-xs font-semibold text-[var(--text)]">
                    יחידה
                  </span>
                  <select
                    value={editUnit}
                    onChange={(e) => {
                      const u = e.target.value as FoodUnit;
                      setEditUnit(u);
                      setEditQtyText((q) => {
                        const n = parseFloat(q.replace(",", "."));
                        if (!Number.isFinite(n)) return q;
                        return String(clampQuantity(n, u));
                      });
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
              {editUnit !== "גרם" && (
                <div className="flex min-w-0 flex-nowrap justify-start gap-2 overflow-x-auto pb-1">
                  {FRACTION_DECIMAL_ROWS.map(([num, label]) => {
                    const selected = approxEq(editQty, num);
                    return (
                      <button
                        key={label}
                        type="button"
                        className={`shrink-0 cursor-pointer whitespace-nowrap rounded-[10px] px-3 py-2 text-sm font-semibold text-[var(--text)] ${
                          selected
                            ? "border-2 border-[var(--stem)] bg-[var(--cherry-muted)]"
                            : "border border-[var(--border-cherry-soft)] bg-white"
                        }`}
                        onClick={() =>
                          setEditQtyText(String(clampQuantity(num, editUnit)))
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-stem flex-1 rounded-xl py-3 font-semibold disabled:opacity-50"
                  disabled={editLoading}
                  onClick={() => void saveEdit()}
                >
                  {editLoading ? "שומרים…" : "שמירה"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white py-3 font-semibold text-[var(--text)]"
                  onClick={() => {
                    setEditOpen(false);
                    setEditEntry(null);
                  }}
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isJournalMode && (
      <header className="mb-6 space-y-4 sm:space-y-5">
        <div className="flex flex-row items-start justify-between gap-2 sm:items-center sm:gap-4 md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-balance text-base font-extrabold leading-snug text-[var(--stem)] sm:text-lg md:text-right md:text-2xl">
              {greetingModel.title}
            </p>
            {greetingModel.subtitle ? (
              <p className="mt-1 text-xs font-semibold text-[var(--text)]/70 sm:text-sm">
                {greetingModel.subtitle}
              </p>
            ) : null}
            {greetingModel.tip ? (
              <p className="mt-1 text-xs font-semibold text-[var(--stem)]/80 sm:text-sm">
                {greetingModel.tip}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 scale-[0.92] sm:scale-100 md:max-w-[12rem] md:scale-100">
            <LiveClock />
          </div>
        </div>

        <CalorieHeroRing
          target={target}
          total={total}
          walkBurnKcal={walkBurnKcal}
          gender={gender}
        />

        {showAssistantBubble ? (
          <HomeAssistantInsightBubble
            text={bubbleMainText}
            variant={appVariant}
            gender={gender}
            offsetPlan={calorieOffsetPlan}
          >
            {Math.round(overGoalKcal) > 0 ||
            (exerciseDay?.reportedSteps ?? 0) > 0 ? (
              <div
                id="cj-steps-card"
                className="mt-2 border-t border-[var(--border-cherry-soft)]/60 pt-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-extrabold text-[var(--stem)]/65">
                  דיווח צעדים 👟
                </p>
                <div className="mt-1 flex flex-wrap items-stretch gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={stepsDraft}
                    onChange={(e) =>
                      setStepsDraft(e.target.value.replace(/[^\d]/g, ""))
                    }
                    placeholder="0"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border-cherry-soft)] bg-white/95 px-2 py-1.5 text-sm tabular-nums"
                    aria-label="מספר צעדים שבוצעו"
                  />
                  <button
                    type="button"
                    disabled={exerciseSaving}
                    className="shrink-0 rounded-lg bg-[var(--cherry)] px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      void submitReportedSteps();
                    }}
                  >
                    {exerciseSaving ? "…" : "עדכן"}
                  </button>
                </div>
                {(exerciseDay?.reportedSteps ?? 0) > 0 ? (
                  <p className="mt-1 text-[10px] font-semibold leading-snug text-[var(--stem)]/85">
                    {exerciseDay!.reportedSteps.toLocaleString("he-IL")} צעדים ≈{" "}
                    {walkBurnKcal} קק״ל קיזוז
                  </p>
                ) : null}
              </div>
            ) : null}
          </HomeAssistantInsightBubble>
        ) : null}

        {dailyMotivationLineWithWeather ? (
          <p
            className="mx-auto max-w-md text-center text-sm font-extrabold leading-relaxed text-[var(--stem)]/90"
            role="status"
          >
            {dailyMotivationLineWithWeather}
          </p>
        ) : null}

        {/* Weather permission moved to Settings */}

        <div className="mx-auto grid max-w-xl grid-cols-3 gap-1.5 sm:gap-3">
          {(
            [
              ["חלבון", totalProteinG, macroGoals.proteinG] as const,
              ["פחמימות", totalCarbsG, macroGoals.carbsG] as const,
              ["שומן", totalFatG, macroGoals.fatG] as const,
            ] as const
          ).map(([label, consumed, goal]) => {
            const g = goal > 0 ? goal : 1;
            const pct = Math.min(100, (consumed / g) * 100);
            return (
              <div
                key={label}
                className="flex min-w-0 flex-col rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-1.5 py-2 shadow-sm sm:rounded-2xl sm:px-3 sm:py-3"
              >
                <p className="text-center text-[13px] font-semibold leading-tight text-[var(--cherry)] sm:text-sm">
                  {label}
                </p>
                <p className="mt-0.5 text-center text-[13px] font-bold tabular-nums leading-tight text-[var(--stem)] sm:mt-1 sm:text-base">
                  {formatMacroGramAmount(consumed)}ג/
                  {formatMacroGramAmount(goal)}ג
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#f0f0f0] sm:mt-4 sm:h-2.5">
                  <div
                    className="h-full rounded-full bg-[var(--cherry)] transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {profile && nextStep ? (
          <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-4 shadow-[0_8px_24px_var(--panel-shadow-soft)]">
            <div className="flex items-start gap-3" dir="rtl">
              <div
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cherry-muted)] text-2xl shadow-sm"
                aria-hidden
              >
                {nextStep === "weight" ? "⚖️" : nextStep === "walk" ? "🚶‍♀️" : "➕"}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold tracking-tight text-[var(--cherry)]">
                  הצעד הבא שלך
                </h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--stem)]/80">
                  {nextStep === "weight"
                    ? "בואי נמדוד נקודת אמת — זה לוקח 10 שניות. אחר כך תראי את התוצאות הרבה יותר ברור."
                    : nextStep === "walk"
                      ? "לא נלחצים—מאזנים. הליכה קצרה עכשיו יכולה לסגור את הפער של היום."
                      : "כל רישום קטן בונה דיוק. הוסיפי את מה שאכלת עכשיו—ונתקדם משם."}
                </p>
                <button
                  type="button"
                  className="btn-stem mt-3 w-full rounded-xl py-2.5 text-sm font-extrabold"
                  onClick={() => {
                    if (nextStep === "weight") {
                      setQuickWeightOpen(true);
                      return;
                    }
                    if (nextStep === "walk") {
                      setQuickStepsOpen(true);
                      return;
                    }
                    router.push(
                      `/add-food?from=journal&date=${encodeURIComponent(viewDateKey)}`
                    );
                  }}
                >
                  {nextStep === "weight"
                    ? "הזיני משקל יומי"
                    : nextStep === "walk"
                      ? "קיזוז בהליכה"
                      : "הוסיפי מזון"}
                </button>
                {nextStep === "weight" ? (
                  <button
                    type="button"
                    className="mt-2 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white py-2.5 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                    onClick={() => {
                      const today = getTodayKey();
                      saveWeightSkipDayKey(today);
                      setWeightSkipRev((x) => x + 1);
                    }}
                  >
                    {gf(gender, "דלגי היום", "דלג היום")}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-4 shadow-[0_8px_24px_var(--panel-shadow-soft)]">
          <div className="flex items-start gap-3" dir="rtl">
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cherry-muted)] text-2xl shadow-sm"
              aria-hidden
            >
              🏦
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--cherry)]">
                הון קלורי שנצבר השבוע
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text)]/85">
                <span className="font-extrabold text-[var(--stem)]">
                  {weeklySavings.toLocaleString("he-IL")} קק״ל
                </span>
              </p>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--stem)]/80">
                כדי לראות את כל מה שצברת מתחילת התהליך, סגרי את כל הימים ביומן.
              </p>
              <button
                type="button"
                className="btn-stem mt-3 w-full rounded-xl py-2.5 text-sm font-extrabold"
                onClick={closeAllJournalDays}
              >
                סגור
              </button>
            </div>
          </div>
        </div>

        <nav className="grid w-full grid-cols-2 gap-2 sm:gap-3" aria-label="פעולות מהירות">
          <Link
            href={`/add-food?from=journal&date=${encodeURIComponent(viewDateKey)}`}
            className={`${quickNavBtnClass} min-h-[3.25rem] px-3 py-3 text-sm sm:min-h-[3.5rem] sm:text-base`}
          >
            <span className="text-xl" aria-hidden>
              ➕
            </span>
            <span className="font-extrabold">הוספת מזון</span>
          </Link>
          <Link
            href="/daily-summary"
            className={`${quickNavBtnClass} min-h-[3.25rem] px-3 py-3 text-sm sm:min-h-[3.5rem] sm:text-base`}
          >
            <span className="text-xl" aria-hidden>
              📊
            </span>
            <span className="font-extrabold">סיכום יומי</span>
          </Link>
        </nav>

        {profile ? (
          <QuickWeightModal
            open={quickWeightOpen}
            profile={profile}
            onClose={(result) => {
              setQuickWeightOpen(false);
              if (!result.ok) return;
              triggerWeightToast(result.prevKg, result.newKg);
            }}
          />
        ) : null}

        {profile ? (
          <QuickStepsModal
            open={quickStepsOpen}
            initialSteps={stepsDraft}
            onClose={() => setQuickStepsOpen(false)}
            onSave={(steps) => {
              setQuickStepsOpen(false);
              setStepsDraft(String(steps));
              void (async () => {
                try {
                  await saveExerciseActivityDay(getTodayKey(), steps);
                  setExerciseDay({
                    reportedSteps: steps,
                    updatedAt: new Date().toISOString(),
                  });
                } finally {
                  /* ignore */
                }
              })();
            }}
          />
        ) : null}

        {weightToast.show ? (
          <div
            className={`fixed bottom-24 left-3 right-3 z-[410] mx-auto max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 px-4 py-3 text-center text-sm font-extrabold text-[var(--cherry)] shadow-[0_10px_30px_rgba(0,0,0,0.14)] transition-opacity ${
              weightToast.fade ? "opacity-0" : "opacity-100"
            }`}
            dir="rtl"
            role="status"
          >
            {weightToast.message}
          </div>
        ) : null}
      </header>
      )}

      {isJournalMode ? (
        <>
          <div className="sticky top-0 z-[55] isolate -mx-3 mb-3 sm:-mx-4 sm:mb-4">
            <input
              ref={datePickerRef}
              type="date"
              value={viewDateKey}
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const dk = e.target.value;
                if (dk && /^\d{4}-\d{2}-\d{2}$/.test(dk)) {
                  navigateToDate(dk);
                }
              }}
            />
            <div className="overflow-hidden rounded-xl border border-[var(--border-cherry-soft)]/40 bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
              {/* החלקה בין ימים רק כאן — לא על רשימת הפריטים (פחות התנגשות עם גלילה / כרטיסים / לחיצה ארוכה) */}
              <motion.div
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.1}
                dragMomentum={false}
                onDragEnd={onJournalDayDragEnd}
                className="touch-manipulation"
              >
              {/* שורה 1 — תאריך וניווט ימים בלבד */}
              <div className="px-2 py-1.5 sm:px-2.5 sm:py-2">
                <div
                  className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-0.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]"
                  dir="ltr"
                >
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-center rounded-lg text-lg leading-none text-[var(--stem)]/70 transition hover:bg-[var(--cherry-muted)]/35 active:bg-[var(--cherry-muted)]/45 disabled:pointer-events-none disabled:opacity-35 sm:h-10 sm:text-xl"
                    onClick={() =>
                      canGoNextDay && navigateToDate(addDaysToDateKey(viewDateKey, 1))
                    }
                    disabled={!canGoNextDay}
                    aria-label="יום הבא — עתיד"
                  >
                    ‹
                  </button>
                  <div className="flex min-h-9 min-w-0 items-center justify-center gap-1.5 px-0.5 sm:min-h-10 sm:gap-2">
                    <button
                      type="button"
                      dir="rtl"
                      className="min-h-9 min-w-0 flex-1 px-1 py-1 text-center text-[13px] font-semibold leading-snug text-[var(--stem)] sm:min-h-10 sm:text-sm"
                      onClick={() => navigateToDate(getTodayKey())}
                      aria-label={
                        isViewingToday
                          ? "היום"
                          : `חזרה להיום — מציגים ${formatDateKeyHeJournalNav(viewDateKey)}`
                      }
                    >
                      <span className="line-clamp-2 max-w-full text-balance">
                        {formatDateKeyHeJournalNav(viewDateKey)}
                      </span>
                    </button>
                    <Link
                      href={`/add-food?from=journal&date=${encodeURIComponent(viewDateKey)}`}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--cherry)] bg-[var(--cherry)] text-[1.35rem] font-extrabold leading-none text-white shadow-[0_3px_10px_rgba(155,27,48,0.38)] ring-2 ring-white/70 transition hover:brightness-110 hover:shadow-[0_4px_14px_rgba(155,27,48,0.45)] active:scale-[0.94] sm:size-11 sm:text-[1.5rem]"
                      aria-label={gf(gender, "הוספת מזון", "הוספת מזון")}
                      title={gf(gender, "הוספת מזון", "הוספת מזון")}
                    >
                      <span aria-hidden>+</span>
                    </Link>
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-center rounded-lg text-lg leading-none text-[var(--stem)]/70 transition hover:bg-[var(--cherry-muted)]/35 active:bg-[var(--cherry-muted)]/45 sm:h-10 sm:text-xl"
                    onClick={() => navigateToDate(addDaysToDateKey(viewDateKey, -1))}
                    aria-label="יום קודם — עבר"
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* שורה 2 — יתרה יומית: מספר למעלה + תווית למטה (כמו יומן ניסיון); אותם צבעי מאקרו בלי רקעים/מסגרות פנימיים */}
              <div className="border-t border-[var(--border-cherry-soft)]/30 px-2 py-2.5 sm:px-3 sm:py-3">
                <div
                  className="mx-auto grid w-full max-w-xl grid-cols-4 gap-1 px-0.5 sm:gap-1.5"
                  dir="rtl"
                >
                  <div className="flex min-w-0 flex-col items-center text-center">
                    <p
                      className="text-xl font-extrabold leading-none tabular-nums text-[var(--cherry)]"
                      aria-label={`קלוריות נותרו ${remainingKcal}`}
                    >
                      {remainingKcal}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[var(--cherry)]">
                      קק״ל
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-col items-center text-center">
                    <p
                      className="text-[17px] font-bold leading-none tabular-nums text-[#CA8A04]"
                      aria-label={`חלבון נותר ${formatJournalRemainingMacroG(remainingProteinG)}`}
                    >
                      {formatJournalRemainingMacroG(remainingProteinG)}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[#CA8A04]">
                      חלבון (ג׳)
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-col items-center text-center">
                    <p
                      className="text-[17px] font-bold leading-none tabular-nums text-[#2563EB]"
                      aria-label={`פחמימה נותרה ${formatJournalRemainingMacroG(remainingCarbsG)}`}
                    >
                      {formatJournalRemainingMacroG(remainingCarbsG)}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[#2563EB]">
                      פחמימה (ג׳)
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-col items-center text-center">
                    <p
                      className="text-[17px] font-bold leading-none tabular-nums text-[#16A34A]"
                      aria-label={`שומן נותר ${formatJournalRemainingMacroG(remainingFatG)}`}
                    >
                      {formatJournalRemainingMacroG(remainingFatG)}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[#16A34A]">
                      שומן (ג׳)
                    </p>
                  </div>
                </div>
              </div>
              </motion.div>
            </div>
          </div>

      <AnimatePresence>
        {journalInfoOpen && isJournalMode && (
          <motion.div
            className="fixed inset-0 z-[600] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setJournalInfoOpen(false);
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
                  {homeJournalIntroTitle()}
                </h2>
                <button
                  type="button"
                  className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => setJournalInfoOpen(false)}
                >
                  סגירה
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--stem)]/85">
                {homeJournalIntroBody(gender)}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA moved next to the last starred entry (see below) */}

          <section
            key={viewDateKey}
            className="touch-manipulation max-w-full overflow-x-hidden bg-transparent px-0 pb-28 pt-1"
          >
        {isDayClosed && (
          <div
            className="mb-4 flex min-w-0 w-full max-w-full items-start gap-2.5 rounded-2xl border border-[var(--border-cherry-soft)]/70 bg-gradient-to-br from-[var(--cherry-muted)]/25 to-white px-3.5 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
            role="status"
          >
            <span className="mt-0.5 shrink-0 text-base opacity-80" aria-hidden>
              🔒
            </span>
            <p className="min-w-0 flex-1 text-start text-[13px] font-medium leading-snug text-[var(--stem)]/88">
              {gf(
                gender,
                "היום סגור — צפייה בלבד. אפשר לפתוח שוב למטה אם צריך להוסיף או לערוך.",
                "היום סגור — צפייה בלבד. אפשר לפתוח שוב למטה אם צריך להוסיף או לערוך."
              )}
            </p>
          </div>
        )}
        <h2 className="sr-only">
          {isViewingToday ? "היום ביומן" : `יומן — ${formatDateKeyHe(viewDateKey)}`}
        </h2>

        {entries.length === 0 ? (
          <p className="text-[var(--text)]/85">
            {gf(
              gender,
              "עדיין אין רשומות — לחצי על הפלוס ליד התאריך או על הכפתור המרכזי ״הוספה״ בתפריט התחתון.",
              "עדיין אין רשומות — לחץ על הפלוס ליד התאריך או על הכפתור המרכזי ״הוספה״ בתפריט התחתון."
            )}{" "}
          </p>
        ) : (
          <div className="-mx-3 bg-white" data-dict-rev={dictTick}>
            {JOURNAL_DAY_SECTION_SLOTS.map((slot) => {
              const sectionEntries = entriesByJournalDaySection[slot];
              if (sectionEntries.length === 0) return null;
              const headingId = `journal-section-${viewDateKey}-${slot}`;
              const sectionKcalSum = Math.round(
                sectionEntries.reduce((s, e) => s + e.calories, 0)
              );
              return (
                <section key={slot} aria-labelledby={headingId}>
                  <div
                    id={headingId}
                    className="flex flex-row items-center justify-between gap-2 border-b-2 border-[var(--cherry)]/50 bg-[var(--cherry-muted)]/25 px-3 py-2"
                    dir="rtl"
                  >
                    <h3 className="text-base font-extrabold leading-tight text-[var(--cherry)]">
                      {JOURNAL_MEAL_LABELS[slot]}
                    </h3>
                    <p
                      className="ml-2 shrink-0 text-sm font-bold leading-tight text-[var(--stem)] tracking-wide md:ml-3 md:text-base"
                      aria-label={`סה״כ קלוריות: ${sectionKcalSum} בקטגוריה ${JOURNAL_MEAL_LABELS[slot]}`}
                    >
                      סה״כ קלוריות:{" "}
                      <span dir="ltr" className="inline-block tabular-nums">
                        {sectionKcalSum}
                      </span>
                    </p>
                  </div>
                  <ul className="divide-y divide-[var(--cherry)]/35">
                    {sectionEntries.map((item) => {
              const mealOn = item.mealStarred === true;
              const isAiMeal = item.aiMeal === true;
              const journalMealPreset = getJournalMealPresetBreakdown(item);
              const hasAiBreakdown =
                typeof item.aiBreakdownJson === "string" &&
                item.aiBreakdownJson.trim().length > 2;
              const aiRows = (() => {
                if (!hasAiBreakdown) return null;
                try {
                  const parsed = JSON.parse(item.aiBreakdownJson!) as Array<{
                    item: string;
                    qty: string;
                    calories: number;
                    protein: number;
                    carbs: number;
                    fat: number;
                  }>;
                  return Array.isArray(parsed) ? parsed : null;
                } catch {
                  return null;
                }
              })();
              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`touch-manipulation bg-white ${isDayClosed ? "opacity-85" : ""}`}
                  onPointerDown={(e) => handleJournalCardPointerDown(e, item)}
                  onPointerMove={handleJournalCardPointerMove}
                  onPointerUp={handleJournalCardPointerEnd}
                  onPointerCancel={handleJournalCardPointerEnd}
                  onContextMenu={(e) => handleJournalCardContextMenu(e, item)}
                >
                  <div className="flex min-w-0 flex-row items-start gap-3 px-3 py-2.5">
                    <div
                      className="flex min-w-0 flex-1 flex-col gap-1"
                      dir="rtl"
                    >
                      {journalFoodNameEditId === item.id && !isDayClosed ? (
                        <div
                          className="flex min-w-0 flex-col gap-2"
                          data-skip-journal-longpress
                        >
                          <div className="flex w-full flex-row justify-end gap-1.5">
                            <button
                              type="button"
                              className="rounded-lg border border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]/45"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                saveJournalFoodNameEdit();
                              }}
                            >
                              {gf(gender, "שמור", "שמור")}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--text)]/80 transition hover:bg-[var(--cherry-muted)]/45"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelJournalFoodNameEdit();
                              }}
                            >
                              {gf(gender, "ביטול", "ביטול")}
                            </button>
                          </div>
                          <input
                            ref={journalFoodNameInputRef}
                            type="text"
                            value={journalFoodNameDraft}
                            onChange={(e) =>
                              setJournalFoodNameDraft(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") cancelJournalFoodNameEdit();
                              if (e.key === "Enter") saveJournalFoodNameEdit();
                            }}
                            className="min-w-0 w-full rounded-lg border border-[var(--border-cherry-soft)] bg-white px-2 py-1.5 text-base font-normal text-[var(--stem)] outline-none focus:ring-2 focus:ring-[var(--stem)]/25"
                            aria-label={gf(
                              gender,
                              "שם להצגה ביומן",
                              "שם להצגה ביומן"
                            )}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex w-full min-w-0 flex-row items-start gap-2">
                            <button
                              type="button"
                              disabled={isDayClosed}
                              data-skip-journal-longpress
                              className="min-w-0 flex-1 py-0 text-start transition hover:bg-[var(--cherry-muted)]/25 disabled:opacity-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (isDayClosed) return;
                                setJournalFoodNameEditId(item.id);
                                setJournalFoodNameDraft(item.food);
                              }}
                              title={gf(
                                gender,
                                "לחצי לעריכת השם",
                                "לחץ לעריכת השם"
                              )}
                              aria-label={gf(
                                gender,
                                "עריכת שם להצגה",
                                "עריכת שם להצגה"
                              )}
                            >
                              <span className="bidi-isolate-rtl block min-w-0 whitespace-normal break-words text-base font-normal leading-snug">
                                {journalMealPreset ? (
                                  <>
                                    <span className="font-semibold text-[var(--stem)]">
                                      ארוחה
                                    </span>
                                    <span className="text-neutral-400" aria-hidden>
                                      {" "}
                                      —{" "}
                                    </span>
                                    <span className="text-[var(--cherry)]">
                                      {item.food}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[var(--cherry)]">
                                    {item.food}
                                  </span>
                                )}
                              </span>
                            </button>
                            {journalMealPreset || !isDayClosed ? (
                              <div
                                className="flex min-w-0 shrink-0 flex-row flex-wrap items-center justify-end gap-2 pt-0.5"
                                data-skip-journal-longpress
                                role="group"
                                aria-label={
                                  journalMealPreset
                                    ? gf(
                                        gender,
                                        "פירוט ארוחה שמורה",
                                        "פירוט ארוחה שמורה"
                                      )
                                    : gf(
                                        gender,
                                        "פעולות על המנה",
                                        "פעולות על המנה"
                                      )
                                }
                              >
                                {!journalMealPreset &&
                                mealHintInlineEntryId === item.id ? (
                                  <p className="max-w-[min(18rem,calc(100vw-7rem))] text-end text-sm font-semibold leading-snug text-[var(--cherry)]">
                                    {gf(
                                      gender,
                                      "בחרי לפחות עוד מוצר אחד ליצירת ארוחה.",
                                      "בחר לפחות עוד מוצר אחד ליצירת ארוחה."
                                    )}
                                  </p>
                                ) : null}
                                {journalMealPreset ? (
                                  <button
                                    type="button"
                                    className="rounded-full p-1.5 text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]/45"
                                    aria-expanded={
                                      journalMealPresetExpandedId === item.id
                                    }
                                    aria-label={gf(
                                      gender,
                                      "הצגת המנות שנבחרו לארוחה",
                                      "הצגת המנות שנבחרו לארוחה"
                                    )}
                                    title={gf(
                                      gender,
                                      "מה נכלל בארוחה",
                                      "מה נכלל בארוחה"
                                    )}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setJournalMealPresetExpandedId((x) =>
                                        x === item.id ? null : item.id
                                      );
                                    }}
                                  >
                                    <ChevronDown
                                      className={`${journalToolbarIconClass} transition-transform duration-200 ${
                                        journalMealPresetExpandedId === item.id
                                          ? "rotate-180"
                                          : ""
                                      }`}
                                      strokeWidth={2.25}
                                      aria-hidden
                                    />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={`rounded-full p-1.5 transition ${
                                      mealOn
                                        ? "border-2 border-[var(--cherry)] text-[var(--stem)]"
                                        : "border-2 border-transparent text-[var(--stem)] hover:bg-[var(--cherry-muted)]/45"
                                    }`}
                                    title="סימון כארוחה קבועה במילון הארוחות"
                                    aria-label="ארוחה קבועה — סימון לשמירה כארוחה במילון"
                                    aria-pressed={mealOn}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleMealStar(item.id);
                                    }}
                                  >
                                    <IconUtensilsMeal
                                      className={journalToolbarIconClass}
                                    />
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <div
                            className="w-full space-y-1 text-[var(--text)]/80"
                            dir="rtl"
                            data-skip-journal-longpress
                          >
                            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-base font-bold leading-snug">
                              {isDayClosed ? (
                                <span className="bidi-isolate-rtl">
                                  {formatQtyLabel(item.quantity, item.unit)}{" "}
                                  {item.unit}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  title={gf(
                                    gender,
                                    "לחצי כדי לשנות כמות או יחידה",
                                    "לחץ כדי לשנות כמות או יחידה"
                                  )}
                                  className="bidi-isolate-rtl inline-flex items-center gap-1 rounded px-0.5 text-[var(--stem)] underline decoration-dotted decoration-[var(--stem)]/40 underline-offset-2 transition hover:bg-[var(--cherry-muted)]/45 hover:decoration-[var(--stem)]/70"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openEdit(item);
                                  }}
                                  aria-label={gf(
                                    gender,
                                    "עריכת כמות ויחידה — לחיצה לפתיחת עריכה",
                                    "עריכת כמות ויחידה — לחיצה לפתיחת עריכה"
                                  )}
                                >
                                  <span>
                                    {formatQtyLabel(item.quantity, item.unit)}{" "}
                                    {item.unit}
                                  </span>
                                  <Pencil
                                    className="size-3.5 shrink-0 text-[var(--stem)]/55"
                                    strokeWidth={2.25}
                                    aria-hidden
                                  />
                                </button>
                              )}
                            </p>
                          </div>
                        </>
                      )}

                      <AnimatePresence initial={false}>
                        {journalMealPreset &&
                          journalMealPresetExpandedId === item.id && (
                            <motion.div
                              key={`meal-preset-${item.id}`}
                              className="mt-1 w-full rounded-lg border border-[var(--border-cherry-soft)]/70 bg-white px-2.5 py-2"
                              data-skip-journal-longpress
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                            >
                              <p className="mb-1.5 text-xs font-extrabold text-[var(--cherry)]">
                                {gf(gender, "בארוחה:", "בארוחה:")}
                              </p>
                              {journalMealPreset.components.length === 0 ? (
                                <p className="text-sm text-[var(--stem)]/75">
                                  {gf(
                                    gender,
                                    "אין רשימת מרכיבים.",
                                    "אין רשימת מרכיבים."
                                  )}
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {journalMealPreset.components.map((c, idx) => {
                                    const macroLine = [
                                      Number.isFinite(c.proteinG) &&
                                      (c.proteinG ?? 0) > 0
                                        ? `חלבון ${formatMacroGramAmount(c.proteinG)} ג׳`
                                        : null,
                                      Number.isFinite(c.carbsG) &&
                                      (c.carbsG ?? 0) > 0
                                        ? `פחמימה ${formatMacroGramAmount(c.carbsG)} ג׳`
                                        : null,
                                      Number.isFinite(c.fatG) &&
                                      (c.fatG ?? 0) > 0
                                        ? `שומן ${formatMacroGramAmount(c.fatG)} ג׳`
                                        : null,
                                    ].filter(Boolean);
                                    return (
                                      <li
                                        key={`${item.id}-mpc-${idx}`}
                                        className="leading-relaxed"
                                      >
                                        <p className="text-sm font-semibold text-[var(--stem)]">
                                          {c.food}{" "}
                                          <span className="text-xs font-semibold text-[var(--stem)]/70">
                                            ({formatQtyLabel(c.quantity, c.unit)}{" "}
                                            {c.unit})
                                          </span>
                                        </p>
                                        <p className="text-xs text-[var(--stem)]/75">
                                          {Math.round(c.calories)} קק״ל
                                          {macroLine.length > 0
                                            ? ` · ${macroLine.join(" · ")}`
                                            : ""}
                                        </p>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </motion.div>
                          )}
                      </AnimatePresence>

                      <AnimatePresence>
                        {isAiMeal && (
                          <motion.div
                            className="mt-1 w-full"
                            data-skip-journal-longpress
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-cherry-soft)] bg-white px-2 py-0.5 text-[10px] font-extrabold text-[var(--cherry)]">
                                🤖 ארוחת AI
                              </span>
                            </div>

                            {aiRows ? (
                              <button
                                type="button"
                                className="mt-2 w-full rounded-lg border border-[var(--border-cherry-soft)]/70 bg-white p-2.5 text-start text-sm"
                                onClick={() => {
                                  setAiExpandedId((x) =>
                                    x === item.id ? null : item.id
                                  );
                                }}
                              >
                                <span className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-extrabold text-[var(--cherry)]">
                                    פירוט חישוב ה-AI
                                  </span>
                                  <span className="text-xs font-bold text-[var(--stem)]/55">
                                    {aiExpandedId === item.id ? "▲" : "▼"}
                                  </span>
                                </span>
                                {aiExpandedId === item.id ? (
                                  <ul className="mt-2 space-y-2">
                                    {aiRows.map((r, idx) => (
                                      <li
                                        key={`${item.id}-ai-${idx}`}
                                        className="leading-relaxed"
                                      >
                                        <p className="font-semibold text-[var(--stem)]">
                                          {r.item}{" "}
                                          <span className="text-xs font-semibold text-[var(--stem)]/70">
                                            ({r.qty})
                                          </span>
                                        </p>
                                        <p className="text-xs text-[var(--stem)]/75">
                                          קלוריות {Math.round(r.calories)} · חלבון{" "}
                                          {r.protein} · פחמימה {r.carbs} · שומן{" "}
                                          {r.fat}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </button>
                            ) : null}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div
                      className="shrink-0 select-none pt-0.5 text-base font-bold tabular-nums leading-snug text-neutral-900"
                      dir="ltr"
                      aria-label={`${item.calories} קק״ל`}
                    >
                      <span className="bidi-isolate-rtl whitespace-nowrap">
                        {item.calories} קק״ל
                      </span>
                    </div>
                  </div>

                  {isJournalMode &&
                    !isDayClosed &&
                    starredForMealCount >= 2 &&
                    mealCtaEntryId === item.id && (
                      <motion.div
                        className="mt-1.5 flex w-full justify-center px-3 pb-0.5"
                        data-skip-journal-longpress
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div
                          dir="rtl"
                          className="inline-flex max-w-full flex-row items-center gap-3 rounded-full border-2 border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/20 px-4 py-1.5 shadow-[0_1px_6px_var(--panel-shadow-soft)]"
                        >
                          <button
                            type="button"
                            className="min-h-0 shrink-0 rounded-md px-0.5 py-0 text-[15px] font-semibold leading-tight text-[var(--cherry)] transition hover:opacity-85 active:scale-[0.99]"
                            onClick={openMealModal}
                          >
                            יצירת ארוחה ({starredForMealCount})
                          </button>
                          <span
                            className="h-4 w-px shrink-0 bg-[var(--cherry)]/25"
                            aria-hidden
                          />
                          <button
                            type="button"
                            className="shrink-0 rounded-md px-0.5 py-0 text-[15px] font-semibold leading-tight text-[var(--stem)]/80 transition hover:bg-[var(--cherry-muted)]/35 hover:text-[var(--stem)]"
                            onClick={clearMealStarSelection}
                          >
                            ביטול
                          </button>
                        </div>
                      </motion.div>
                    )}
                </motion.li>
              );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 space-y-2">
          <button
            type="button"
            className={`w-full rounded-2xl border px-4 py-3.5 text-[15px] font-semibold shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition hover:bg-[var(--cherry-muted)]/40 active:scale-[0.99] ${
              isDayClosed
                ? "border-[var(--border-cherry-soft)] bg-white text-[var(--cherry)]"
                : "border-[var(--border-cherry-soft)]/85 bg-white text-[var(--stem)]"
            }`}
            onClick={toggleJournalClosedForViewDay}
          >
            {isDayClosed
              ? gf(gender, "פתיחת היום לעריכה", "פתיחת היום לעריכה")
              : gf(gender, "סגירת היום", "סגירת היום")}
          </button>
        </div>

        <AnimatePresence>
          {journalCardActionEntry && !journalCardMoveOpen ? (
            <motion.div
              className="fixed inset-0 z-[500] flex items-center justify-center bg-black/35 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(ev) => {
                if (ev.target === ev.currentTarget) setJournalCardActionEntry(null);
              }}
            >
              <motion.div
                role="dialog"
                aria-modal
                aria-labelledby="journal-entry-action-food"
                className="w-full max-w-sm rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-xl"
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.97, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
              >
                <p
                  id="journal-entry-action-food"
                  className="line-clamp-3 text-center text-base font-semibold text-[var(--stem)]"
                >
                  {journalCardActionEntry.food}
                </p>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-cherry-soft)] px-3 py-3 text-start text-sm font-bold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]/35"
                    onClick={() => setJournalCardMoveOpen(true)}
                  >
                    <CornerUpRight
                      className="size-5 shrink-0 text-[var(--cherry)]"
                      strokeWidth={2}
                      aria-hidden
                    />
                    העבר אל…
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50/50 px-3 py-3 text-start text-sm font-bold text-red-800 transition hover:bg-red-50"
                    onClick={() => {
                      const id = journalCardActionEntry.id;
                      setJournalCardActionEntry(null);
                      removeEntry(id);
                    }}
                  >
                    <Trash2 className="size-5 shrink-0" strokeWidth={2} aria-hidden />
                    מחק מוצר
                  </button>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-xl py-2 text-sm font-semibold text-[var(--text)]/75 hover:bg-neutral-100"
                  onClick={() => setJournalCardActionEntry(null)}
                >
                  ביטול
                </button>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {journalCardActionEntry && journalCardMoveOpen ? (
            <motion.div
              className="fixed inset-0 z-[510] flex items-center justify-center bg-black/35 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(ev) => {
                if (ev.target === ev.currentTarget) {
                  setJournalCardMoveOpen(false);
                  setJournalCardActionEntry(null);
                }
              }}
            >
              <motion.div
                role="dialog"
                aria-modal
                className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-3 shadow-xl"
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
              >
                <p className="border-b border-neutral-100 pb-2 text-center text-base font-extrabold text-neutral-900">
                  העבר אל…
                </p>
                <ul className="mt-1">
                  {JOURNAL_MEAL_SLOTS.map((slot) => (
                    <li key={slot}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-center gap-0.5 rounded-xl py-3 text-center transition hover:bg-[var(--cherry-muted)]/40"
                        onClick={() =>
                          journalCardActionEntry &&
                          moveJournalEntryToSlot(journalCardActionEntry.id, slot)
                        }
                      >
                        <span className="text-[15px] font-semibold text-[var(--stem)]">
                          {JOURNAL_MEAL_LABELS[slot]}
                        </span>
                        <span
                          className="text-[13px] font-black tabular-nums tracking-tight text-[#db2777]"
                          dir="ltr"
                        >
                          {JOURNAL_MEAL_TIME_LABELS[slot]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-1 w-full rounded-xl py-2 text-sm font-semibold text-[var(--text)]/75 hover:bg-neutral-100"
                  onClick={() => setJournalCardMoveOpen(false)}
                >
                  חזרה
                </button>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

          </section>
        </>
      ) : (
        <div className="mb-8">
          <button
            type="button"
            className="btn-stem w-full rounded-2xl px-4 py-4 text-base font-extrabold shadow-[0_8px_28px_rgba(74,124,35,0.35)] ring-2 ring-white/40 md:text-lg"
            onClick={() => router.push(`/journal?date=${encodeURIComponent(viewDateKey)}`)}
          >
            {gf(gender, "תעדי את היום שלך", "תעד את היום שלך")}
          </button>
        </div>
      )}

    </div>
  );
}
