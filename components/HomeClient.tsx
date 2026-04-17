"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { stepsForKcal, walkMinutesForKcal } from "@/lib/burnOffset";
import { formatWalkingMinutes } from "@/lib/formatWalkDuration";
import { getTodayKey } from "@/lib/dateKey";
import {
  type FoodUnit,
  type LogEntry,
  type MealPresetComponent,
  addMealPreset,
  getEntriesForDate,
  type UserProfile,
  isFoodStarred,
  loadProfile,
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

export function HomeClient() {
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
    persistEntries(entries.filter((x) => x.id !== id));
  }

  function duplicateEntry(item: LogEntry) {
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
    persistEntries(
      entries.map((e) =>
        e.id === id ? { ...e, mealStarred: !e.mealStarred } : e
      )
    );
  }

  function openMealModal() {
    setMealNameDraft("");
    setMealModalOpen(true);
  }

  function confirmCreateMeal() {
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
    setEditEntry(item);
    setEditQtyText(String(item.quantity));
    setEditUnit(item.unit);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editEntry) return;
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
      <div className="p-8 text-center text-lg text-[#333333]" dir="rtl">
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
                className="text-lg font-bold text-[#333333]"
              >
                שמירת ארוחה במילון
              </h2>
              <p className="text-sm text-[#333333]/85">
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
                  className="btn-gold flex-1 rounded-xl py-3 font-semibold"
                  onClick={confirmCreateMeal}
                  disabled={!mealNameDraft.trim()}
                >
                  שמירה
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[#FADADD] bg-white py-3 font-semibold text-[#333333]"
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
                className="text-lg font-bold text-[#333333]"
              >
                עריכת כמות
              </h2>
              <p className="text-sm text-[#333333]/90">{editEntry.food}</p>
              <div className="flex flex-wrap gap-3">
                <label className="min-w-[6rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
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
                  <span className="mb-1 block text-xs font-semibold text-[#333333]">
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
                        className={`shrink-0 cursor-pointer whitespace-nowrap rounded-[10px] px-3 py-2 text-sm font-semibold text-[#333333] ${
                          selected
                            ? "border-2 border-black bg-[#eee]"
                            : "border border-[#ccc] bg-white"
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
                  className="btn-gold flex-1 rounded-xl py-3 font-semibold disabled:opacity-50"
                  disabled={editLoading}
                  onClick={() => void saveEdit()}
                >
                  {editLoading ? "שומרים…" : "שמירה"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border-2 border-[#FADADD] bg-white py-3 font-semibold text-[#333333]"
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
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 border-y border-[#FADADD] py-4">
          <p className="text-center text-xl font-bold text-[#333333] md:text-2xl">
            יעד יומי: {target} קק״ל
          </p>
          <span className="hidden text-[#333333]/40 sm:inline" aria-hidden>
            |
          </span>
          <p className="text-center text-xl font-bold text-[#333333] md:text-2xl">
            {isViewingToday ? "נצרכו היום" : "נצרכו ביום הנבחר"}: {total} קק״ל
            <span className="mr-2 text-base font-semibold text-[#333333]/80">
              {" "}
              ({displayPercentage}%)
            </span>
          </p>
        </div>
        <div className="mx-auto mt-5 flex max-w-xl flex-wrap items-stretch justify-center gap-3 md:mt-6 md:gap-4">
          <div className="min-w-[8.25rem] flex-1 rounded-xl border border-[#e8cfd4] bg-[#fffafb] px-4 py-3 text-center shadow-sm sm:flex-initial">
            <p className="font-[system-ui,Segoe_UI,sans-serif] text-sm font-semibold text-[#333333]">
              חלבון:{" "}
              <span className="text-lg font-bold tabular-nums text-[#2a2a2a]">
                {totalProteinG}
              </span>
              <span className="text-sm font-semibold text-[#333333]/85">
                {" "}
                ג&apos;
              </span>
            </p>
          </div>
          <div className="min-w-[8.25rem] flex-1 rounded-xl border border-[#e8cfd4] bg-[#fffafb] px-4 py-3 text-center shadow-sm sm:flex-initial">
            <p className="font-[system-ui,Segoe_UI,sans-serif] text-sm font-semibold text-[#333333]">
              פחמימות:{" "}
              <span className="text-lg font-bold tabular-nums text-[#2a2a2a]">
                {totalCarbsG}
              </span>
              <span className="text-sm font-semibold text-[#333333]/85">
                {" "}
                ג&apos;
              </span>
            </p>
          </div>
          <div className="min-w-[8.25rem] flex-1 rounded-xl border border-[#e8cfd4] bg-[#fffafb] px-4 py-3 text-center shadow-sm sm:flex-initial">
            <p className="font-[system-ui,Segoe_UI,sans-serif] text-sm font-semibold text-[#333333]">
              שומן:{" "}
              <span className="text-lg font-bold tabular-nums text-[#2a2a2a]">
                {totalFatG}
              </span>
              <span className="text-sm font-semibold text-[#333333]/85">
                {" "}
                ג&apos;
              </span>
            </p>
          </div>
        </div>
      </header>

      <motion.div
        className="mb-8 flex justify-center px-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="max-w-[min(100%,20rem)] text-center">
          <p className="mb-2.5 text-base font-bold leading-snug tracking-wide text-[#1a1a1a] md:text-lg">
            יומן המעקב של
          </p>
          <h1 className="app-title relative rounded-2xl border border-[#FADADD]/90 bg-gradient-to-b from-white to-[#fffafb] px-4 py-3 text-[1.35rem] leading-snug shadow-[0_2px_14px_rgba(250,218,221,0.35)] md:px-5 md:py-3.5 md:text-2xl lg:text-[1.65rem]">
            אינטליגנציה קלורית
          </h1>
        </div>
      </motion.div>

      <motion.section
        className="glass-panel mb-6 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <p className="mb-3 text-center text-sm font-semibold text-[#333333]">
          התקדמות יומית
        </p>
        <div className="h-3 overflow-hidden rounded-full border border-[#FADADD] bg-[#fafafa]">
          <motion.div
            className="h-full rounded-full bg-[#FADADD]"
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
            <h3 className="text-center text-3xl font-extrabold leading-snug tracking-tight text-[#8b2e2e] md:text-4xl">
              מעל היעד – זה מצב זמני
            </h3>
            <p
              className="mt-5 text-[15px] font-medium leading-[1.75] tracking-[0.01em] text-[#333333] antialiased md:text-base md:leading-[1.8]"
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

      {starredForMealCount >= 2 && (
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            type="button"
            className="btn-gold w-full rounded-xl py-3 text-base font-semibold"
            onClick={openMealModal}
          >
            שמירה במילון מהפריטים המסומנים ({starredForMealCount})
          </button>
        </motion.div>
      )}

      <section className="glass-panel p-4">
        <h2 className="mb-3 text-xl font-bold text-[#333333]">
          {isViewingToday ? "היום ביומן" : `יומן — ${viewDateKey}`}
        </h2>
        {entries.length === 0 ? (
          <p className="text-[#333333]/85">
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
                  className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[#FADADD] bg-white px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1 font-semibold text-[#333333]">
                      {item.verified && (
                        <span
                          className="inline-flex shrink-0"
                          title="מאומת"
                          aria-label="מאומת"
                        >
                          <IconVerified className="h-4 w-4 text-[#d4a017]" />
                        </span>
                      )}
                      <span>{item.food}</span>
                    </p>
                    <p className="text-sm text-[#333333]/80">
                      {formatEntryTime(item.createdAt) ? (
                        <>
                          <span className="tabular-nums font-medium text-[#333333]">
                            {formatEntryTime(item.createdAt)}
                          </span>
                          {" · "}
                        </>
                      ) : null}
                      {formatQtyLabel(item.quantity, item.unit)} {item.unit} ·{" "}
                      {item.calories} קק״ל
                    </p>
                    <p className="text-xs text-[#333333]/65">
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
                      onClick={() => toggleMealStar(item.id)}
                    >
                      <IconStar
                        filled={mealOn}
                        className="h-5 w-5 text-[#333333]"
                      />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury"
                      title="שמירה למילון"
                      aria-label="שמירה למילון"
                      aria-pressed={inDictionary}
                      onClick={() => {
                        toggleDictionaryFromEntry(item);
                        setDictTick((t) => t + 1);
                      }}
                    >
                      <IconBookmark
                        filled={inDictionary}
                        className="h-5 w-5 text-[#333333]"
                      />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury"
                      title="עריכת כמות"
                      aria-label="עריכת כמות"
                      onClick={() => openEdit(item)}
                    >
                      <IconPencil className="h-5 w-5 text-[#333333]" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury"
                      title="שכפול"
                      aria-label="שכפול"
                      onClick={() => duplicateEntry(item)}
                    >
                      <IconDuplicate className="h-5 w-5 text-[#333333]" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury btn-icon-luxury-danger"
                      title="מחיקה"
                      aria-label="מחיקה"
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
