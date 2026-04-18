"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { optionalMacroGram, sumMacroGrams } from "@/lib/macroGrams";
import { dailyCalorieTarget } from "@/lib/tdee";
import { CelebrationConfetti } from "./Fireworks";
import {
  IconBookmark,
  IconDuplicate,
  IconPencil,
  IconStar,
  IconTrash,
  IconVerified,
} from "./Icons";
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

export function HomeClient() {
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

  const [journalClosedMap, setJournalClosedMap] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setJournalClosedMap(loadDayJournalClosedMap());
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
    if (m[k]) {
      delete m[k];
    } else {
      m[k] = true;
    }
    saveDayJournalClosedMap(m);
    setJournalClosedMap(m);
    window.dispatchEvent(new Event("cj-journal-closed-changed"));
  }

  useEffect(() => {
    setProfile(loadProfile());
    const refresh = () => setProfile(loadProfile());
    window.addEventListener("focus", refresh);
    window.addEventListener("cj-profile-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cj-profile-updated", refresh);
    };
  }, []);

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

  /** מעל 100% מהיעד (לטקסט חריגה / צעדים) — רק כשמוצגת אזהרת מעל 110% */
  const overGoalKcal =
    target > 0 && total > target ? total - target : 0;
  /** אזהרת מעל היעד רק מעל 110% מהיעד; בין 100% ל־110% — ללא חריגה, עדיין חגיגת 100% */
  const showHarriga = target > 0 && total > target * 1.1;
  const displayPercentage =
    target > 0 ? Math.round((total / target) * 100) : 0;
  const isViewingToday = viewDateKey === getTodayKey();

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

      <header className="mb-8 text-center">
        <LiveClock />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 border-y border-[var(--border-cherry-soft)] py-4">
          <p className="text-center text-xl font-extrabold text-[var(--ui-home-daily-line)] md:text-2xl">
            יעד יומי: {target} קק״ל
          </p>
          <span className="hidden text-[var(--stem)]/35 sm:inline" aria-hidden>
            |
          </span>
          <p className="text-center text-xl font-extrabold text-[var(--ui-home-daily-line)] md:text-2xl">
            {isViewingToday ? "נצרכו היום" : "נצרכו ביום הנבחר"}: {total} קק״ל
            <span className="mr-2 text-base font-semibold text-[var(--stem)]">
              {" "}
              ({displayPercentage}%)
            </span>
          </p>
        </div>
        <div className="mx-auto mt-5 flex max-w-xl flex-wrap items-stretch justify-center gap-3 md:mt-6 md:gap-4">
          <div className="min-w-[8.25rem] flex-1 rounded-xl border-2 border-stem-soft bg-white/90 px-4 py-3 text-center shadow-sm sm:flex-initial">
            <p className="font-[system-ui,Segoe_UI,sans-serif] text-sm font-semibold text-[var(--cherry)]">
              חלבון:{" "}
              <span className="text-lg font-bold tabular-nums text-[var(--stem)]">
                {totalProteinG}
              </span>
              <span className="text-sm font-semibold text-[var(--text)]/85">
                {" "}
                ג&apos;
              </span>
            </p>
          </div>
          <div className="min-w-[8.25rem] flex-1 rounded-xl border-2 border-stem-soft bg-white/90 px-4 py-3 text-center shadow-sm sm:flex-initial">
            <p className="font-[system-ui,Segoe_UI,sans-serif] text-sm font-semibold text-[var(--cherry)]">
              פחמימות:{" "}
              <span className="text-lg font-bold tabular-nums text-[var(--stem)]">
                {totalCarbsG}
              </span>
              <span className="text-sm font-semibold text-[var(--text)]/85">
                {" "}
                ג&apos;
              </span>
            </p>
          </div>
          <div className="min-w-[8.25rem] flex-1 rounded-xl border-2 border-stem-soft bg-white/90 px-4 py-3 text-center shadow-sm sm:flex-initial">
            <p className="font-[system-ui,Segoe_UI,sans-serif] text-sm font-semibold text-[var(--cherry)]">
              שומן:{" "}
              <span className="text-lg font-bold tabular-nums text-[var(--stem)]">
                {totalFatG}
              </span>
              <span className="text-sm font-semibold text-[var(--text)]/85">
                {" "}
                ג&apos;
              </span>
            </p>
          </div>
        </div>
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

      <motion.section
        className="glass-panel mb-6 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <p className="mb-3 text-center text-sm font-bold text-[var(--ui-home-progress-label)]">
          התקדמות יומית
        </p>
        <div className="h-3 overflow-hidden rounded-full border-2 border-[var(--border-cherry-soft)] bg-[#f8f8f8]">
          <motion.div
            className="progress-bar-cherry-stem h-full rounded-full"
            initial={{ width: 0 }}
            animate={{
              width: `${target > 0 ? Math.min(100, (total / target) * 100) : 0}%`,
            }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
          />
        </div>
        {showHarriga && (
          <motion.div
            className="mt-4 rounded-xl border-[3px] border-[#d4848c] bg-[#fff0f1] p-4 shadow-sm md:p-5"
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
        )}
      </motion.section>

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
          <button
            type="button"
            className={
              isDayClosed
                ? "w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-bold text-[var(--cherry)] shadow-sm sm:w-auto"
                : "btn-stem w-full rounded-xl px-4 py-3 text-sm font-bold sm:w-auto sm:min-w-[11rem]"
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
            עדיין אין רשומות — לחצי על הכפתור המרכזי ״הוספה״ בתפריט התחתון,
            ואז על ״פתיחת מסך הוספת מזון״ (המקלדת לא מסתירה את תוצאות החיפוש).
          </p>
        ) : (
          <ul className="space-y-3" data-dict-rev={dictTick}>
            {entries.map((item) => {
              const inDictionary = isFoodStarred(item.food);
              const mealOn = item.mealStarred === true;
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
                    <p className="flex flex-wrap items-center gap-1 font-semibold text-[var(--text)]">
                      {item.verified && (
                        <span
                          className="inline-flex shrink-0"
                          title="מאומת"
                          aria-label="מאומת"
                        >
                          <IconVerified className="h-4 w-4 text-[var(--stem)]" />
                        </span>
                      )}
                      <span>{item.food}</span>
                    </p>
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
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-icon-luxury"
                      title="סימון לשמירה כארוחה במילון"
                      aria-label="סימון לשמירה כארוחה במילון"
                      aria-pressed={mealOn}
                      disabled={isDayClosed}
                      onClick={() => toggleMealStar(item.id)}
                    >
                      <IconStar filled={mealOn} className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury"
                      title="שמירה למילון"
                      aria-label="שמירה למילון"
                      aria-pressed={inDictionary}
                      disabled={isDayClosed}
                      onClick={() => {
                        toggleDictionaryFromEntry(item);
                        setDictTick((t) => t + 1);
                      }}
                    >
                      <IconBookmark filled={inDictionary} className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury"
                      title="עריכת כמות"
                      aria-label="עריכת כמות"
                      disabled={isDayClosed}
                      onClick={() => openEdit(item)}
                    >
                      <IconPencil className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury"
                      title="שכפול"
                      aria-label="שכפול"
                      disabled={isDayClosed}
                      onClick={() => duplicateEntry(item)}
                    >
                      <IconDuplicate className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury btn-icon-luxury-danger"
                      title="מחיקה"
                      aria-label="מחיקה"
                      disabled={isDayClosed}
                      onClick={() => removeEntry(item.id)}
                    >
                      <IconTrash className="h-5 w-5" />
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
