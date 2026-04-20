"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadAssistantInsightForBubble,
  resolveHomeInsightBubbleText,
} from "@/lib/assistantInsight";
import type { AppVariant } from "@/lib/appVariant";
import { stepsForKcal, walkMinutesForKcal } from "@/lib/burnOffset";
import { formatWalkingMinutes } from "@/lib/formatWalkDuration";
import { addDaysToDateKey, getTodayKey } from "@/lib/dateKey";
import {
  type FoodUnit,
  type LogEntry,
  type MealPresetComponent,
  addMealPreset,
  getEntriesForDate,
  type UserProfile,
  isFoodStarred,
  loadDayJournalClosedMap,
  loadProfile,
  saveDayJournalClosedMap,
  saveDayLogEntries,
  saveFoodMemoryKey,
  toggleDictionaryFromEntry,
} from "@/lib/storage";
import { buildDashboardGreetingLine } from "@/lib/dashboardGreeting";
import { dailyMacroTargetsGrams } from "@/lib/macroTargets";
import {
  dailyCalorieMotivationLine,
  gf,
  homeJournalIntroBody,
  homeJournalIntroTitle,
} from "@/lib/hebrewGenderUi";
import { optionalMacroGram, sumMacroGrams } from "@/lib/macroGrams";
import { dailyCalorieTarget } from "@/lib/tdee";
import { weeklyCalorieSavingsClosedDays } from "@/lib/weeklyCalorieSavings";
import { InfoCard } from "./InfoCard";
import { CelebrationConfetti } from "./Fireworks";
import { useAppVariant } from "./useAppVariant";
import {
  IconBookmark,
  IconDuplicate,
  IconPencil,
  IconStar,
  IconTrash,
  IconVerified,
} from "./Icons";
import { IconCaption } from "./IconCaption";
import { LiveClock } from "./LiveClock";
import { ProfileMenu } from "./ProfileMenu";

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

function formatEntryTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatMacroCell(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)} ג׳`;
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

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

function CalorieHeroRing({
  target,
  total,
}: {
  target: number;
  total: number;
}) {
  const remaining = target > 0 ? Math.max(0, target - total) : 0;
  const over = target > 0 && total > target ? total - target : 0;
  const pct = target > 0 ? Math.min(100, (total / target) * 100) : 0;
  const size = 200;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
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
            className="text-[var(--cherry)]"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center"
          dir="rtl"
        >
          {over <= 0 ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--stem)]/75">
                נותרו בתקציב
              </p>
              <p className="text-4xl font-black tabular-nums leading-tight text-[var(--cherry)] md:text-[2.75rem]">
                {remaining}
              </p>
              <p className="text-sm font-semibold text-[var(--stem)]">קק״ל</p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold text-[var(--stem)]/75">
                מעל היעד
              </p>
              <p className="text-3xl font-black tabular-nums leading-tight text-[#b91c1c] md:text-4xl">
                +{Math.round(over)}
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
}: {
  text: string;
  variant: AppVariant;
  gender: UserProfile["gender"];
}) {
  const router = useRouter();
  const cherry = variant === "cherry";
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      onClick={() => router.push("/assistant")}
      className={`relative mx-auto mt-1 w-full max-w-md rounded-2xl border-2 px-3 py-3 text-start shadow-[0_6px_22px_rgba(0,0,0,0.08)] transition hover:brightness-[1.02] active:scale-[0.99] sm:px-4 sm:py-3.5 ${
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
      <p className="mt-2 text-center text-[11px] font-bold text-[var(--cherry)]">
        {gf(gender, "לשיחה עם העוזר ←", "לשיחה עם העוזר ←")}
      </p>
    </motion.button>
  );
}

const quickNavBtnClass =
  "flex min-h-[2.75rem] flex-1 min-w-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/75 px-2 py-2.5 text-xs font-semibold text-[var(--cherry)] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99] sm:text-sm";

const foodToolbarBtnClass =
  "inline-flex min-w-[2.65rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--border-cherry-soft)] bg-white/95 px-1.5 py-1.5 text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] disabled:cursor-not-allowed disabled:opacity-40";

export function HomeClient() {
  const gender = loadProfile().gender;
  const appVariant = useAppVariant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [dictTick, setDictTick] = useState(0);

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [mealNameDraft, setMealNameDraft] = useState("");

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
  const [insightBubbleText, setInsightBubbleText] = useState<string | null>(null);

  const [journalClosedMap, setJournalClosedMap] = useState<
    Record<string, boolean>
  >({});

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
  const todayKey = getTodayKey();
  const canGoNextDay = viewDateKey < todayKey;

  function navigateToDate(dk: string) {
    setViewDateKey(dk);
    if (dk === getTodayKey()) {
      router.replace("/", { scroll: false });
    } else {
      router.replace(`/?date=${encodeURIComponent(dk)}`, { scroll: false });
    }
  }

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

  const target = profile
    ? dailyCalorieTarget(
        profile.gender,
        profile.weightKg,
        profile.heightCm,
        profile.age,
        profile.deficit,
        profile.activity
      )
    : 0;

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

  const macroGoals = useMemo(() => dailyMacroTargetsGrams(target), [target]);

  const greetingLine = useMemo(
    () =>
      buildDashboardGreetingLine(
        gender,
        profile?.firstName ?? "",
        greetingHour
      ),
    [gender, profile?.firstName, greetingHour]
  );

  const weeklySavings = useMemo(
    () =>
      profile
        ? weeklyCalorieSavingsClosedDays(profile, journalClosedMap)
        : 0,
    [profile, journalClosedMap]
  );

  const dailyMotivationLine = useMemo(
    () => dailyCalorieMotivationLine(gender, target, total),
    [gender, target, total]
  );

  /** מעל 100% מהיעד (לטקסט חריגה / צעדים) — רק כשמוצגת אזהרת מעל 110% */
  const overGoalKcal =
    target > 0 && total > target ? total - target : 0;
  /** אזהרת מעל היעד רק מעל 110% מהיעד; בין 100% ל־110% — ללא חריגה, עדיין חגיגת 100% */
  const showHarriga = target > 0 && total > target * 1.1;
  const isViewingToday = viewDateKey === getTodayKey();

  useEffect(() => {
    const sync = () => {
      const stored = loadAssistantInsightForBubble();
      const overKcal =
        target > 0 && total > target ? Math.round(total - target) : 0;
      setInsightBubbleText(
        resolveHomeInsightBubbleText(gender, stored, isViewingToday, overKcal)
      );
    };
    sync();
    window.addEventListener("cj-assistant-insight-updated", sync);
    window.addEventListener("cj-profile-updated", sync);
    return () => {
      window.removeEventListener("cj-assistant-insight-updated", sync);
      window.removeEventListener("cj-profile-updated", sync);
    };
  }, [gender, isViewingToday, total, target]);

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
    setEntries(getEntriesForDate(viewDateKey));
  }, [viewDateKey]);

  useEffect(() => {
    const d = searchParams.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= getTodayKey()) {
      setViewDateKey(d);
    }
  }, [searchParams]);

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
  }

  function duplicateEntry(item: LogEntry) {
    if (isDayClosed) return;
    const copy: LogEntry = {
      ...item,
      id: uid(),
      createdAt: new Date().toISOString(),
      mealStarred: false,
      verified: item.verified,
    };
    persistEntries([copy, ...entries]);
  }

  function toggleMealStar(id: string) {
    if (isDayClosed) return;
    persistEntries(
      entries.map((e) =>
        e.id === id ? { ...e, mealStarred: !e.mealStarred } : e
      )
    );
  }

  function openMealModal() {
    if (isDayClosed) return;
    setMealNameDraft("");
    setMealModalOpen(true);
  }

  function confirmCreateMeal() {
    if (isDayClosed) return;
    const name = mealNameDraft.trim();
    if (!name) return;
    const starred = entries.filter((e) => e.mealStarred);
    const components: MealPresetComponent[] = starred.map((e) => ({
      food: e.food,
      quantity: e.quantity,
      unit: e.unit,
      calories: e.calories,
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
    }));
    addMealPreset({ name, components });
    persistEntries(
      entries.map((e) => (e.mealStarred ? { ...e, mealStarred: false } : e))
    );
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

  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-6 md:pt-10" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-start gap-3">
        <ProfileMenu />
      </div>

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
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/25 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal
            aria-labelledby="meal-modal-title"
          >
            <motion.div
              className="glass-panel w-full max-w-md space-y-4 p-5"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <h2
                id="meal-modal-title"
                className="panel-title-cherry text-lg"
              >
                שמירת ארוחה במילון
              </h2>
              <p className="text-sm text-[var(--text)]/85">
                נשמרו {starredForMealCount} פריטים. תני שם — הארוחה תופיע
                במילון האישי לחיפוש והוספה ליומן (למשל: בוקר קבוע).
              </p>
              <input
                type="text"
                value={mealNameDraft}
                onChange={(e) => setMealNameDraft(e.target.value)}
                placeholder="שם הארוחה"
                className="input-luxury-search"
                autoFocus
              />
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
                  onClick={() => setMealModalOpen(false)}
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
              <p className="text-sm text-[var(--text)]/90">{editEntry.food}</p>
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

      <header className="mb-6 space-y-4 sm:space-y-5">
        <div className="flex flex-row items-start justify-between gap-2 sm:items-center sm:gap-4 md:justify-between">
          <p className="min-w-0 flex-1 text-balance text-base font-extrabold leading-snug text-[var(--stem)] sm:text-lg md:text-right md:text-2xl">
            {greetingLine}
          </p>
          <div className="shrink-0 scale-[0.92] sm:scale-100 md:max-w-[12rem] md:scale-100">
            <LiveClock />
          </div>
        </div>

        <CalorieHeroRing target={target} total={total} />

        {insightBubbleText ? (
          <HomeAssistantInsightBubble
            text={insightBubbleText}
            variant={appVariant}
            gender={gender}
          />
        ) : null}

        {dailyMotivationLine ? (
          <p
            className="mx-auto max-w-md text-center text-sm font-medium leading-relaxed text-[var(--stem)]/90"
            role="status"
          >
            {dailyMotivationLine}
          </p>
        ) : null}

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
                <p className="text-center text-[9px] font-semibold leading-tight text-[var(--cherry)] sm:text-sm">
                  {label}
                </p>
                <p className="mt-0.5 text-center text-[11px] font-bold tabular-nums leading-tight text-[var(--stem)] sm:mt-1 sm:text-base">
                  {Math.round(consumed)}ג/{Math.round(goal)}ג
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

        <InfoCard
          gender={gender}
          icon="🏦"
          title="הון קלורי שנצבר השבוע"
          body={`${weeklySavings.toLocaleString("he-IL")} קק״ל — סכום מהימים הסגורים השבוע שבהם נצרכו פחות מהיעד.`}
          className="shadow-[0_8px_24px_var(--panel-shadow-soft)]"
        />

        <nav
          className="flex w-full flex-wrap gap-2 sm:gap-3"
          aria-label="פעולות מהירות"
        >
          <Link
            href={`/add-food?date=${encodeURIComponent(viewDateKey)}`}
            className={quickNavBtnClass}
          >
            <span className="text-lg" aria-hidden>
              ➕
            </span>
            <span className="truncate">הוספת מזון</span>
          </Link>
          <Link href="/explorer" className={quickNavBtnClass}>
            <span className="text-lg" aria-hidden>
              💎
            </span>
            <span className="truncate">מגלה האוצרות</span>
          </Link>
          <Link href="/shopping" className={quickNavBtnClass}>
            <span className="text-lg" aria-hidden>
              🧺
            </span>
            <span className="truncate">סל האוצרות</span>
          </Link>
          <Link href="/daily-summary" className={quickNavBtnClass}>
            <span className="text-lg" aria-hidden>
              📊
            </span>
            <span className="truncate">סיכום יומי</span>
          </Link>
        </nav>
      </header>

      <motion.div
        className="mb-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 px-3 text-center"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="text-base font-bold leading-snug tracking-wide text-[var(--stem)] md:text-lg">
          יומן המעקב של
        </span>
        <h1 className="app-title relative inline-block rounded-2xl border border-[var(--home-title-border)] bg-gradient-to-b from-white to-[var(--home-title-bg-end)] px-3 py-2 text-[1.2rem] leading-snug shadow-[0_2px_14px_var(--home-title-glow),0_0_0_1px_var(--glass-glow-inner)] md:px-4 md:py-2.5 md:text-2xl lg:text-[1.55rem]">
          אינטליגנציה קלורית
        </h1>
      </motion.div>

      {showHarriga && (
        <motion.section
          className="glass-panel mb-6 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <motion.div
            className="rounded-xl border-[3px] border-[#d4848c] bg-[#fff0f1] p-4 shadow-sm md:p-5"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <h3 className="text-center text-3xl font-extrabold leading-snug tracking-tight text-[var(--ui-home-over-budget-h3)] md:text-4xl">
              מעל היעד – זה מצב זמני
            </h3>
            <p
              className="mt-5 text-[15px] font-medium leading-[1.75] tracking-[0.01em] text-[var(--text)] antialiased md:text-base md:leading-[1.8]"
              style={{ fontFeatureSettings: '"kern" 1, "liga" 1' }}
            >
              חריגה של {Math.round(overGoalKcal)} קק״ל.{" "}
              <strong className="font-semibold text-[#1f1f1f]">
                יום אחד לא מגדיר אותך
              </strong>
              . אפשר לאזן את החריגה על ידי פריסה של הקלוריות במהלך השבוע הקרוב,
              או בפעילות ממוקדת של כ־
              {stepsForKcal(overGoalKcal).toLocaleString("he-IL")} צעדים (שהם
              כ־{formatWalkingMinutes(walkMinutesForKcal(overGoalKcal))} הליכה
              בקצב בינוני).
            </p>
          </motion.div>
        </motion.section>
      )}

      {starredForMealCount >= 2 && !isDayClosed && (
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            type="button"
            className="btn-stem w-full rounded-xl py-3 text-base font-semibold"
            onClick={openMealModal}
          >
            שמירה במילון מהפריטים המסומנים ({starredForMealCount})
          </button>
        </motion.div>
      )}

      <section className="glass-panel p-4">
        <InfoCard
          gender={gender}
          icon="📔"
          title={homeJournalIntroTitle()}
          body={homeJournalIntroBody(gender)}
          className="mb-5"
        />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <button
              type="button"
              className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-bold text-[var(--stem)] shadow-sm transition hover:bg-[rgba(74,124,35,0.08)]"
              aria-label="יום קודם ביומן"
              onClick={() =>
                navigateToDate(addDaysToDateKey(viewDateKey, -1))
              }
            >
              ‹ יום קודם
            </button>
            <button
              type="button"
              disabled={!canGoNextDay}
              className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-bold text-[var(--stem)] shadow-sm transition hover:bg-[rgba(74,124,35,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="יום הבא ביומן"
              onClick={() => {
                if (canGoNextDay) {
                  navigateToDate(addDaysToDateKey(viewDateKey, 1));
                }
              }}
            >
              יום הבא ›
            </button>
            {!isViewingToday && (
              <button
                type="button"
                className="rounded-xl border-2 border-dashed border-[var(--border-cherry-soft)] bg-[#fffafb] px-3 py-2 text-sm font-bold text-[var(--cherry)]"
                onClick={() => navigateToDate(getTodayKey())}
              >
                חזרה להיום
              </button>
            )}
          </div>
        </div>

        <div className="mb-5">
          <button
            type="button"
            className={
              isDayClosed
                ? "w-full rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-4 text-base font-bold text-[var(--cherry)] shadow-md"
                : "btn-stem w-full rounded-2xl px-4 py-4 text-base font-extrabold shadow-[0_8px_28px_rgba(74,124,35,0.35)] ring-2 ring-white/40 md:text-lg"
            }
            onClick={toggleJournalClosedForViewDay}
          >
            {isDayClosed ? "פתיחת היום לעריכה" : "סגירת היום ביומן"}
          </button>
        </div>
        {isDayClosed && (
          <div
            className="mb-4 space-y-3 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-cherry-faint px-3 py-3 text-center"
            role="status"
          >
            <p className="text-sm font-semibold text-[var(--cherry)]">
              היום סגור ביומן — רק צפייה. אפשר לפתוח שוב אם שכחת להזין משהו.
            </p>
            <button
              type="button"
              className="btn-stem w-full rounded-xl py-2.5 text-sm font-bold shadow-sm"
              onClick={toggleJournalClosedForViewDay}
            >
              פתיחת היום לעריכה
            </button>
          </div>
        )}
        <h2 className="panel-title-cherry mb-1 text-xl">
          {isViewingToday
            ? "היום ביומן"
            : `יומן — ${formatDateKeyHe(viewDateKey)}`}
        </h2>
        <p className="mb-3 text-center text-xs font-medium tabular-nums text-[var(--text)]/55">
          {viewDateKey}
        </p>
        {entries.length === 0 ? (
          <p className="text-[var(--text)]/85">
            {gf(
              gender,
              "עדיין אין רשומות — לחצי על הכפתור המרכזי ״הוספה״ בתפריט התחתון,",
              "עדיין אין רשומות — לחץ על הכפתור המרכזי ״הוספה״ בתפריט התחתון,"
            )}{" "}
            ואז על ״פתיחת מסך הוספת מזון״ (המקלדת לא מסתירה את תוצאות החיפוש).
          </p>
        ) : (
          <ul className="space-y-3" data-dict-rev={dictTick}>
            {entries.map((item) => {
              const inDictionary = isFoodStarred(item.food);
              const mealOn = item.mealStarred === true;
              const isAiMeal = item.aiMeal === true;
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
                  layout
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    layout: { type: "spring", damping: 28, stiffness: 400 },
                  }}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3 ${isDayClosed ? "opacity-85" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="w-full text-start"
                      onClick={() => {
                        if (!isAiMeal || !aiRows) return;
                        setAiExpandedId((x) => (x === item.id ? null : item.id));
                      }}
                    >
                      <p className="flex flex-wrap items-center gap-1 font-semibold text-[var(--text)]">
                        {isAiMeal && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-cherry-soft)] bg-white px-2 py-0.5 text-[10px] font-extrabold text-[var(--cherry)]">
                            🤖 ארוחת AI
                          </span>
                        )}
                      {item.verified && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1"
                          title="מאומת מהמאגר"
                        >
                          <IconVerified className="h-4 w-4 text-[var(--stem)]" />
                          <span className="text-[10px] font-bold text-[var(--text)]/80">
                            מאומת
                          </span>
                        </span>
                      )}
                        <span className="min-w-0">{item.food}</span>
                        {isAiMeal && aiRows ? (
                          <span className="ms-auto text-xs font-bold text-[var(--stem)]/55">
                            {aiExpandedId === item.id ? "▲" : "▼"}
                          </span>
                        ) : null}
                      </p>
                    </button>
                    <p className="text-sm text-[var(--text)]/80">
                      {formatEntryTime(item.createdAt) ? (
                        <>
                          <span className="tabular-nums font-medium text-[var(--text)]">
                            {formatEntryTime(item.createdAt)}
                          </span>
                          {" · "}
                        </>
                      ) : null}
                      {formatQtyLabel(item.quantity, item.unit)} {item.unit} ·{" "}
                      {item.calories} קק״ל
                    </p>
                    <p className="text-xs text-[var(--text)]/65">
                      חלבון {formatMacroCell(item.proteinG)} · פחמימות{" "}
                      {formatMacroCell(item.carbsG)} · שומן{" "}
                      {formatMacroCell(item.fatG)}
                    </p>
                    {isAiMeal && aiRows && aiExpandedId === item.id && (
                      <div className="mt-3 rounded-xl border border-[var(--border-cherry-soft)] bg-white/80 p-3 text-sm">
                        <p className="mb-2 text-xs font-extrabold text-[var(--cherry)]">
                          פירוט חישוב ה-AI
                        </p>
                        <ul className="space-y-2">
                          {aiRows.map((r, idx) => (
                            <li key={`${item.id}-ai-${idx}`} className="leading-relaxed">
                              <p className="font-semibold text-[var(--stem)]">
                                {r.item}{" "}
                                <span className="text-xs font-semibold text-[var(--stem)]/70">
                                  ({r.qty})
                                </span>
                              </p>
                              <p className="text-xs text-[var(--stem)]/75">
                                קלוריות {Math.round(r.calories)} · חלבון {r.protein} ·
                                פחמימות {r.carbs} · שומן {r.fat}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="flex max-w-full shrink-0 flex-wrap items-start justify-end gap-1.5">
                    <button
                      type="button"
                      className={foodToolbarBtnClass}
                      title="סימון כארוחה קבועה במילון הארוחות"
                      aria-label="ארוחה קבועה — סימון לשמירה כארוחה במילון"
                      aria-pressed={mealOn}
                      disabled={isDayClosed}
                      onClick={() => toggleMealStar(item.id)}
                    >
                      <IconCaption label="ארוחה">
                        <IconStar filled={mealOn} className="h-[1.15rem] w-[1.15rem]" />
                      </IconCaption>
                    </button>
                    <button
                      type="button"
                      className={foodToolbarBtnClass}
                      title="שמירה במילון האישי שלי"
                      aria-label="מילון — שמירת הפריט במילון"
                      aria-pressed={inDictionary}
                      disabled={isDayClosed}
                      onClick={() => {
                        toggleDictionaryFromEntry(item);
                        setDictTick((t) => t + 1);
                      }}
                    >
                      <IconCaption label="מילון">
                        <IconBookmark
                          filled={inDictionary}
                          className="h-[1.15rem] w-[1.15rem]"
                        />
                      </IconCaption>
                    </button>
                    <button
                      type="button"
                      className={foodToolbarBtnClass}
                      title="עריכת כמות והגדרות מנה"
                      aria-label="כמות — עריכת כמות"
                      disabled={isDayClosed}
                      onClick={() => openEdit(item)}
                    >
                      <IconCaption label="כמות">
                        <IconPencil className="h-[1.15rem] w-[1.15rem]" />
                      </IconCaption>
                    </button>
                    <button
                      type="button"
                      className={foodToolbarBtnClass}
                      title="שכפול לרשומה נוספת"
                      aria-label="שכפול — הוספת אותה מנה שוב"
                      disabled={isDayClosed}
                      onClick={() => duplicateEntry(item)}
                    >
                      <IconCaption label="שכפול">
                        <IconDuplicate className="h-[1.15rem] w-[1.15rem]" />
                      </IconCaption>
                    </button>
                    <button
                      type="button"
                      className={`${foodToolbarBtnClass} border-red-300/70 text-red-800 hover:bg-red-50`}
                      title="מחיקה מהיומן"
                      aria-label="מחיקה — הסרת הרשומה מהיום"
                      disabled={isDayClosed}
                      onClick={() => removeEntry(item.id)}
                    >
                      <IconCaption label="מחק">
                        <IconTrash className="h-[1.15rem] w-[1.15rem]" />
                      </IconCaption>
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}
