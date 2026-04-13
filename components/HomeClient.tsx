"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  startTransition,
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
  closeDayJournal,
  getFoodMemory,
  getEntriesForDate,
  type UserProfile,
  isDayJournalClosed,
  isFoodStarred,
  loadProfile,
  saveDayLogEntries,
  saveFoodMemoryKey,
  toggleDictionaryFromEntry,
} from "@/lib/storage";
import { optionalMacroGram, sumMacroGrams } from "@/lib/macroGrams";
import { SEARCH_DEBOUNCE_MS } from "@/lib/searchDebounce";
import { getRandomMessage } from "@/lib/celebrationMessages";
import { uiNetworkErrorRetry } from "@/lib/hebrewGenderUi";
import { dailyCalorieTarget, type Gender } from "@/lib/tdee";
import { CelebrationConfetti } from "./Fireworks";
import {
  IconBookmark,
  IconCalendar,
  IconDuplicate,
  IconPencil,
  IconPlusCircle,
  IconScanBarcode,
  IconStar,
  IconTrash,
  IconVerified,
} from "./Icons";
import { BarcodeScanModal } from "./BarcodeScanModal";
import { ManualFoodModal } from "./ManualFoodModal";
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
const NON_GRAM_FRACTS = [...FRACTION_VALUES, 1] as const;

type HomeSuggestRow = {
  id: string;
  name: string;
  verified: boolean;
  category?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
};

/** Lower = better. Tier: word-start → after-space substring → any partial. */
function homeLocalSearchRank(
  name: string,
  query: string
): [number, number, string] {
  const q = query.trim();
  const n = name.trim();
  if (!q) return [99, 0, n];
  const words = n.split(/\s+/).filter(Boolean);
  const startIdx = words.findIndex((w) => w.startsWith(q));
  if (startIdx >= 0) {
    return [0, startIdx, n];
  }
  if (n.includes(` ${q}`)) {
    return [1, 0, n];
  }
  if (n.includes(q)) {
    return [2, 0, n];
  }
  return [3, 0, n];
}

type GeminiInsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "notFood" }
  | {
      kind: "ok";
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };

function sortHomeLocalRows(
  rows: HomeSuggestRow[],
  query: string
): HomeSuggestRow[] {
  const q = query.trim();
  return [...rows].sort((a, b) => {
    const [ta, sa, na] = homeLocalSearchRank(a.name, q);
    const [tb, sb, nb] = homeLocalSearchRank(b.name, q);
    if (ta !== tb) return ta - tb;
    if (sa !== sb) return sa - sb;
    return na.localeCompare(nb, "he");
  });
}

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

function snapToFraction(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return [...NON_GRAM_FRACTS].reduce((best, v) =>
    Math.abs(v - n) < Math.abs(best - n) ? v : best
  );
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


const MIXKIT_CLICK_SOUND_URL =
  "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3";

const GEMINI_UNAVAILABLE_MSG = "שירות הניתוח זמנית לא זמין";

export function HomeClient() {
  const [food, setFood] = useState("");
  const [quantityText, setQuantityText] = useState("100");
  const quantity = useMemo(() => {
    const n = parseFloat(quantityText.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 100;
  }, [quantityText]);
  const [unit, setUnit] = useState<FoodUnit>("גרם");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dictTick, setDictTick] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [debouncedFoodSearch, setDebouncedFoodSearch] = useState("");
  const [homeLocalRows, setHomeLocalRows] = useState<HomeSuggestRow[]>([]);
  const [homeSearchLoading, setHomeSearchLoading] = useState(false);
  const [geminiInsight, setGeminiInsight] = useState<GeminiInsightState>({
    kind: "idle",
  });

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
  const foodSearchInputRef = useRef<HTMLInputElement>(null);
  const addFromSearchRef = useRef(false);
  const clickAudioRef = useRef<HTMLAudioElement | null>(null);
  const glowClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const addSuccessClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [glowEntryId, setGlowEntryId] = useState<string | null>(null);
  const [addBtnPulse, setAddBtnPulse] = useState(false);
  const [addFromSearchSuccess, setAddFromSearchSuccess] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const prevUnitRef = useRef<FoodUnit>("גרם");
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

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [manualFoodOpen, setManualFoodOpen] = useState(false);
  const [journalRev, setJournalRev] = useState(0);

  useEffect(() => {
    const bump = () => setJournalRev((r) => r + 1);
    window.addEventListener("cj-day-journal-closed", bump);
    return () => window.removeEventListener("cj-day-journal-closed", bump);
  }, []);

  useEffect(() => {
    const a = new Audio(MIXKIT_CLICK_SOUND_URL);
    a.preload = "auto";
    clickAudioRef.current = a;
    return () => {
      clickAudioRef.current = null;
      if (glowClearTimeoutRef.current) {
        clearTimeout(glowClearTimeoutRef.current);
      }
      if (addSuccessClearTimeoutRef.current) {
        clearTimeout(addSuccessClearTimeoutRef.current);
      }
    };
  }, []);

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
  const dayJournalClosed = useMemo(
    () => isDayJournalClosed(viewDateKey),
    [viewDateKey, journalRev]
  );

  const triggerCelebration = useCallback((type: "half" | "full") => {
    const g: Gender = profile?.gender === "male" ? "male" : "female";
    const message = getRandomMessage(type, g);
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
  }, [profile?.gender]);

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

  const searchPanelSync =
    debouncedFoodSearch.length >= 2 && debouncedFoodSearch === food.trim();
  const debouncePending =
    food.trim().length >= 2 && debouncedFoodSearch !== food.trim();

  const showSuggestions =
    !suggestionsDismissed &&
    food.trim().length >= 2 &&
    (debouncePending || searchPanelSync);

  const blockFoodFormOverlay =
    mealModalOpen ||
    editOpen ||
    celebration.show ||
    scanModalOpen ||
    manualFoodOpen;

  useEffect(() => {
    if (celebration.show) {
      foodSearchInputRef.current?.blur();
      setSuggestionsDismissed(true);
    }
  }, [celebration.show]);

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

  useEffect(() => {
    if (food.trim().length < 2) {
      setHomeLocalRows([]);
      setHomeSearchLoading(false);
      setGeminiInsight({ kind: "idle" });
    }
  }, [food]);

  /** בזמן הקלדה לפני סנכרון debounce — לא להציג ניתוח AI של שאילתה קודמת */
  useEffect(() => {
    const t = food.trim();
    if (t.length < 2) return;
    if (t !== debouncedFoodSearch) {
      setGeminiInsight({ kind: "idle" });
    }
  }, [food, debouncedFoodSearch]);

  useEffect(() => {
    if (debouncedFoodSearch.length < 2) {
      setHomeLocalRows([]);
      setHomeSearchLoading(false);
      return;
    }
    const ac = new AbortController();
    setHomeSearchLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          q: debouncedFoodSearch,
          sort: "caloriesAsc",
          category: "הכל",
          page: "1",
          pageSize: "40",
        });
        const resL = await fetch(`/api/food-explorer?${params}`, {
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;

        if (resL.ok) {
          const data = (await resL.json()) as {
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
            verified: true,
            category: i.category,
            calories: i.calories,
            protein: i.protein,
            fat: i.fat,
            carbs: i.carbs,
          }));
          setHomeLocalRows(sortHomeLocalRows(mapped, debouncedFoodSearch));
        } else {
          setHomeLocalRows([]);
        }
      } catch {
        if (!ac.signal.aborted) {
          setHomeLocalRows([]);
        }
      } finally {
        if (!ac.signal.aborted) setHomeSearchLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedFoodSearch]);

  useEffect(() => {
    if (debouncedFoodSearch.length < 2) {
      setGeminiInsight({ kind: "idle" });
      return;
    }
    const ac = new AbortController();
    setGeminiInsight({ kind: "loading" });
    void (async () => {
      try {
        const res = await fetch("/api/gemini-food-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: debouncedFoodSearch }),
          signal: ac.signal,
        });
        const data = (await res.json()) as {
          result?: {
            name: string;
            calories: number;
            protein: number;
            carbs: number;
            fat: number;
          } | null;
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setGeminiInsight({
            kind: "error",
            message: GEMINI_UNAVAILABLE_MSG,
          });
          return;
        }
        if (data.result == null) {
          setGeminiInsight({ kind: "notFood" });
          return;
        }
        setGeminiInsight({ kind: "ok", ...data.result });
      } catch {
        if (!ac.signal.aborted) {
          setGeminiInsight({
            kind: "error",
            message: GEMINI_UNAVAILABLE_MSG,
          });
        }
      }
    })();
    return () => ac.abort();
  }, [debouncedFoodSearch]);

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

  const [debouncedFoodMemory, setDebouncedFoodMemory] = useState("");
  useEffect(() => {
    const t = food.trim();
    if (t.length === 0) {
      setDebouncedFoodMemory("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedFoodMemory(t), 400);
    return () => window.clearTimeout(id);
  }, [food]);

  useEffect(() => {
    const t = debouncedFoodMemory.trim();
    if (t.length < 2) return;
    if (t !== food.trim()) return;
    const mem = getFoodMemory(t);
    if (mem) {
      setUnit(mem.unit);
      if (mem.unit === "גרם") {
        setQuantityText(String(Math.max(1, Math.round(mem.quantity))));
      } else {
        setQuantityText(String(snapToFraction(mem.quantity)));
      }
    }
  }, [debouncedFoodMemory, food]);

  function handleUnitChange(next: FoodUnit) {
    const prev = prevUnitRef.current;
    setUnit(next);
    if (next !== "גרם") {
      setQuantityText("1");
    } else if (prev !== "גרם") {
      setQuantityText("100");
    }
  }

  useEffect(() => {
    prevUnitRef.current = unit;
  }, [unit]);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    const name = food.trim();
    if (!name) {
      setError("הקלידי שם מזון");
      return;
    }
    const q = clampQuantity(quantity, unit);
    setQuantityText(String(q));
    const fromSearchPick = addFromSearchRef.current;
    if (fromSearchPick) {
      const audio = clickAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ food: name, quantity: q, unit }),
      });
      const data = (await res.json()) as {
        calories?: number;
        note?: string;
        error?: string;
        verified?: boolean;
        proteinG?: number;
        carbsG?: number;
        fatG?: number;
        protein?: number;
        carbohydrates?: number;
        fat?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "שגיאה");
        return;
      }
      const kcal = data.calories ?? 0;
      saveFoodMemoryKey(name, q, unit);
      const proteinG = optionalMacroGram(data.proteinG ?? data.protein);
      const carbsG = optionalMacroGram(data.carbsG ?? data.carbohydrates);
      const fatG = optionalMacroGram(data.fatG ?? data.fat);
      const entry: LogEntry = {
        id: uid(),
        food: name,
        calories: kcal,
        quantity: q,
        unit,
        createdAt: new Date().toISOString(),
        mealStarred: false,
        verified: data.verified === true,
        proteinG,
        carbsG,
        fatG,
      };
      persistEntries([entry, ...entries]);
      setNote(data.note ?? null);
      setSuggestionsDismissed(false);
      setFood("");
      if (fromSearchPick) {
        addFromSearchRef.current = false;
        if (glowClearTimeoutRef.current) {
          clearTimeout(glowClearTimeoutRef.current);
        }
        if (addSuccessClearTimeoutRef.current) {
          clearTimeout(addSuccessClearTimeoutRef.current);
        }
        setGlowEntryId(entry.id);
        glowClearTimeoutRef.current = setTimeout(() => {
          setGlowEntryId(null);
          glowClearTimeoutRef.current = null;
        }, 800);
        setAddFromSearchSuccess(true);
        addSuccessClearTimeoutRef.current = setTimeout(() => {
          setAddFromSearchSuccess(false);
          addSuccessClearTimeoutRef.current = null;
        }, 1200);
      }
    } catch {
      const g: Gender = profile?.gender === "male" ? "male" : "female";
      setError(uiNetworkErrorRetry(g));
    } finally {
      setLoading(false);
    }
  }

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
    foodSearchInputRef.current?.blur();
    setSuggestionsDismissed(true);
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

  function pickSuggestion(suggestionName: string) {
    addFromSearchRef.current = true;
    setSuggestionsDismissed(true);
    setFood(suggestionName);
    queueMicrotask(() => foodSearchInputRef.current?.blur());
  }

  function onFoodChange(value: string) {
    addFromSearchRef.current = false;
    setFood(value);
    startTransition(() => {
      setSuggestionsDismissed(false);
    });
  }

  function openEdit(item: LogEntry) {
    foodSearchInputRef.current?.blur();
    setSuggestionsDismissed(true);
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
    <div className="mx-auto max-w-lg px-4 pb-8 pt-6 md:pt-10" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ProfileMenu />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-[#FADADD] bg-white px-3 py-2 text-sm font-semibold text-[#333333] shadow-sm">
          <IconCalendar className="h-5 w-5 shrink-0 text-[#333333]" aria-hidden />
          <span className="sr-only">בחירת תאריך ליומן</span>
          <input
            type="date"
            className="max-w-[11rem] cursor-pointer bg-transparent font-[inherit] text-[#333333] outline-none"
            value={viewDateKey}
            max={getTodayKey()}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setViewDateKey(v);
            }}
          />
        </label>
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
        className="mb-8 text-center"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="app-title text-4xl md:text-5xl lg:text-6xl">
          סופרים קלוריות
        </h1>
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

      <form
        onSubmit={handleAdd}
        className={`glass-panel relative z-0 mb-6 space-y-4 overflow-visible p-4 ${
          blockFoodFormOverlay ? "pointer-events-none select-none" : ""
        }`}
        aria-hidden={blockFoodFormOverlay ? true : undefined}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#333333]">
            חיפוש מזון — המילון שלך + ניתוח AI (Gemini)
          </span>
          <div className="search-field-wrap relative w-full">
            <input
              ref={foodSearchInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={food}
              onChange={(e) => onFoodChange(e.target.value)}
              onFocus={(e) => {
                // Makes it easy to clear and type a new search.
                if (e.currentTarget.value) e.currentTarget.select();
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="חפשי מזון…"
              className="input-luxury-search w-full ps-12 pe-[5.75rem] sm:pe-24"
              aria-controls={showSuggestions ? "food-suggestions" : undefined}
            />
            <div className="absolute end-2 top-1/2 z-[11] flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#fadadd] bg-white text-[#333333] shadow-sm transition hover:bg-[#fadadd]/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5c8d4]"
                aria-label="הוספת מזון ידנית"
                title="הוספת מזון ידנית"
                onClick={() => {
                  foodSearchInputRef.current?.blur();
                  setSuggestionsDismissed(true);
                  setManualFoodOpen(true);
                }}
              >
                <IconPlusCircle className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#fadadd] bg-white text-[#333333] shadow-sm transition hover:bg-[#fadadd]/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5c8d4]"
                aria-label="סריקת ברקוד"
                title="סריקת ברקוד"
                onClick={() => {
                  foodSearchInputRef.current?.blur();
                  setSuggestionsDismissed(true);
                  setScanModalOpen(true);
                }}
              >
                <IconScanBarcode className="h-6 w-6" />
              </button>
            </div>
            {showSuggestions && (
              <div
                id="food-suggestions"
                className="suggestions-panel max-h-[min(70vh,28rem)] w-full overflow-y-auto"
              >
                {debouncePending && (
                  <p
                    className="px-3 py-2 text-xs text-[#333333]/70"
                    role="status"
                  >
                    ממתינים לסיום הקלדה…
                  </p>
                )}

                {searchPanelSync && (
                  <div className="space-y-3 py-1">
                    <div>
                      <p className="px-3 pb-1 text-sm font-bold text-[#333333]">
                        מהמילון שלך
                      </p>
                      {homeSearchLoading && homeLocalRows.length === 0 ? (
                        <div
                          className="flex items-center gap-2 px-3 py-2 text-sm text-[#333333]"
                          role="status"
                        >
                          <span
                            className="inline-block size-4 animate-spin rounded-full border-2 border-[#FADADD] border-t-[#c45c74]"
                            aria-hidden
                          />
                          טוען מהמילון…
                        </div>
                      ) : homeLocalRows.length === 0 ? (
                        <p className="px-3 py-1 text-xs text-[#333333]/65">
                          אין התאמות מקומיות
                        </p>
                      ) : (
                        <ul className="space-y-0.5">
                          {homeLocalRows.map((s) => (
                            <li key={`l-${s.id}`}>
                              <button
                                type="button"
                                className="suggestion-item flex w-full flex-col items-stretch gap-0.5 px-3 py-2 text-right"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickSuggestion(s.name)}
                              >
                                <span className="flex items-center justify-end gap-2 font-semibold text-[#333333]">
                                  <span>{s.name}</span>
                                  <span title="מאומת" aria-label="מאומת">
                                    <IconVerified className="h-4 w-4 shrink-0 text-[#d4a017]" />
                                  </span>
                                </span>
                                {s.category != null && (
                                  <span className="text-[11px] text-[#333333]/65">
                                    {s.category}
                                  </span>
                                )}
                                {s.calories != null && (
                                  <span className="text-[11px] text-[#333333]/75">
                                    קלוריות: {Math.round(s.calories)} · חלבון:{" "}
                                    {s.protein ?? "—"} · פחמימות: {s.carbs ?? "—"}{" "}
                                    · שומן: {s.fat ?? "—"}
                                    <span className="text-[#333333]/55">
                                      {" "}
                                      (ל־100 ג׳)
                                    </span>
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="border-t border-[#FADADD]/80 pt-2">
                      <p className="px-3 pb-1 text-sm font-bold text-[#333333]">
                        ניתוח אינטליגנציה קלורית (AI)
                      </p>
                      {geminiInsight.kind === "loading" && (
                        <div
                          className="flex items-center gap-2 px-3 py-2 text-sm text-[#333333]"
                          role="status"
                        >
                          <span
                            className="inline-block size-4 animate-spin rounded-full border-2 border-[#FADADD] border-t-[#c45c74]"
                            aria-hidden
                          />
                          מנתח נתונים…
                        </div>
                      )}
                      {geminiInsight.kind === "error" && (
                        <p className="px-3 py-1 text-xs text-[#a94444]">
                          {geminiInsight.message}
                        </p>
                      )}
                      {geminiInsight.kind === "notFood" && (
                        <p className="px-3 py-1 text-xs text-[#333333]/70">
                          לא זוהה כמזון (לפי AI)
                        </p>
                      )}
                      {geminiInsight.kind === "ok" && (
                        <div className="px-3 py-1">
                          <button
                            type="button"
                            className="suggestion-item flex w-full flex-col items-stretch gap-0.5 py-2 text-right"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickSuggestion(geminiInsight.name)}
                          >
                            <span className="font-semibold text-[#333333]">
                              {geminiInsight.name}
                            </span>
                            <span className="text-[11px] text-[#333333]/75">
                              קלוריות: {Math.round(geminiInsight.calories)} ·
                              חלבון: {Math.round(geminiInsight.protein)} ·
                              פחמימות: {Math.round(geminiInsight.carbs)} · שומן:{" "}
                              {Math.round(geminiInsight.fat)}
                              <span className="text-[#333333]/55">
                                {" "}
                                (ל־100 ג׳ — הערכה AI)
                              </span>
                            </span>
                          </button>
                        </div>
                      )}
                      {geminiInsight.kind === "idle" && (
                        <p className="px-3 py-1 text-[11px] text-[#333333]/55">
                          ממתין לניתוח…
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="min-w-[6rem] flex-1">
            <span className="mb-1 block text-xs font-semibold text-[#333333]">
              כמות
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={quantityText}
              onFocus={(e) => {
                if (e.currentTarget.value.trim() === "0") {
                  setQuantityText("");
                }
                e.currentTarget.select();
              }}
              onChange={(e) => {
                if ((e.nativeEvent as InputEvent).isComposing) return;
                const raw = e.target.value;
                if (raw.trim() === "") {
                  setQuantityText("");
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
                setQuantityText(normalized);
              }}
              onBlur={() => {
                const n = parseFloat(quantityText.replace(",", "."));
                if (!Number.isFinite(n)) return;
                setQuantityText(String(clampQuantity(n, unit)));
              }}
              className="input-luxury-dark w-full"
            />
            {unit !== "גרם" && (
              <div className="mt-2 flex min-w-0 flex-nowrap justify-start gap-2 overflow-x-auto pb-1">
                {FRACTION_DECIMAL_ROWS.map(([num, label]) => {
                  const selected = approxEq(quantity, num);
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
                        setQuantityText(String(clampQuantity(num, unit)))
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </label>
          <label className="min-w-[8rem] flex-[2]">
            <span className="mb-1 block text-xs font-semibold text-[#333333]">
              יחידה
            </span>
            <select
              value={unit}
              onChange={(e) =>
                handleUnitChange(e.target.value as FoodUnit)
              }
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

        {note && (
          <p className="border-r-2 border-[#FADADD] pr-2 text-sm text-[#333333]">
            {note}
          </p>
        )}
        {error && (
          <p className="text-sm font-semibold text-[#a94444]">{error}</p>
        )}

        <motion.button
          type="submit"
          disabled={loading}
          className={`btn-gold relative w-full rounded-xl py-4 text-lg font-bold transition-[box-shadow,background-color,color] duration-200 disabled:opacity-50 ${
            addBtnPulse
              ? "ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-[#fffafb]"
              : ""
          } ${
            addFromSearchSuccess
              ? "bg-emerald-600/95 text-white shadow-[0_0_20px_rgba(16,185,129,0.45)]"
              : ""
          }`}
          whileTap={{ scale: 0.98 }}
          onPointerDown={() => {
            if (addFromSearchRef.current) {
              setAddBtnPulse(true);
              window.setTimeout(() => setAddBtnPulse(false), 200);
            }
          }}
        >
          {loading ? (
            "מחשבים…"
          ) : addFromSearchSuccess ? (
            <span className="flex items-center justify-center gap-2">
              <span className="text-xl leading-none" aria-hidden>
                ✓
              </span>
              נוסף ליומן
            </span>
          ) : (
            "הוספה ליומן"
          )}
        </motion.button>
      </form>

      <section className="glass-panel p-4">
        <h2 className="mb-3 text-xl font-bold text-[#333333]">
          {isViewingToday ? "היום ביומן" : `יומן — ${viewDateKey}`}
        </h2>
        {entries.length === 0 ? (
          <p className="text-[#333333]/85">
            עדיין אין רשומות — התחילי מכאן למעלה
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
                  className={`flex flex-col gap-2 rounded-xl border-2 border-[#FADADD] bg-white px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 ${
                    glowEntryId === item.id ? "glow-effect" : ""
                  }`}
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
                      {formatQtyLabel(item.quantity, item.unit)} {item.unit} ·{" "}
                      {item.calories} קק״ל
                    </p>
                    {(item.proteinG != null ||
                      item.carbsG != null ||
                      item.fatG != null) && (
                      <p className="mt-1 text-[11px] leading-snug text-[#333333]/65">
                        {item.proteinG != null && (
                          <>
                            ח {item.proteinG} גרם
                            {(item.carbsG != null || item.fatG != null)
                              ? " · "
                              : ""}
                          </>
                        )}
                        {item.carbsG != null && (
                          <>
                            פחם {item.carbsG} גרם
                            {item.fatG != null ? " · " : ""}
                          </>
                        )}
                        {item.fatG != null && (
                          <>
                            שומן {item.fatG} גרם
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full flex-wrap items-start justify-start gap-2 sm:w-auto sm:shrink-0 sm:items-center sm:justify-end">
                    <button
                      type="button"
                      className="btn-icon-luxury flex flex-col items-center justify-center gap-1"
                      title="סימון לשמירה כארוחה במילון"
                      aria-label="סימון לשמירה כארוחה במילון"
                      aria-pressed={mealOn}
                      onClick={() => toggleMealStar(item.id)}
                    >
                      <IconStar
                        filled={mealOn}
                        className="h-5 w-5 text-[#333333]"
                      />
                      <span className="text-[10px] font-semibold text-[#333333]/80 sm:hidden">
                        ארוחה
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury flex flex-col items-center justify-center gap-1"
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
                      <span className="text-[10px] font-semibold text-[#333333]/80 sm:hidden">
                        מילון
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury flex flex-col items-center justify-center gap-1"
                      title="עריכת כמות"
                      aria-label="עריכת כמות"
                      onClick={() => openEdit(item)}
                    >
                      <IconPencil className="h-5 w-5 text-[#333333]" />
                      <span className="text-[10px] font-semibold text-[#333333]/80 sm:hidden">
                        עריכה
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury flex flex-col items-center justify-center gap-1"
                      title="שכפול"
                      aria-label="שכפול"
                      onClick={() => duplicateEntry(item)}
                    >
                      <IconDuplicate className="h-5 w-5 text-[#333333]" />
                      <span className="text-[10px] font-semibold text-[#333333]/80 sm:hidden">
                        שכפול
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-icon-luxury btn-icon-luxury-danger flex flex-col items-center justify-center gap-1"
                      title="מחיקה"
                      aria-label="מחיקה"
                      onClick={() => removeEntry(item.id)}
                    >
                      <IconTrash className="h-5 w-5" />
                      <span className="text-[10px] font-semibold text-[#333333]/80 sm:hidden">
                        מחיקה
                      </span>
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
        {viewDateKey <= getTodayKey() ? (
          <motion.button
            type="button"
            className="btn-gold mt-4 w-full rounded-xl border-2 border-[#8b2942] bg-gradient-to-b from-[#ffe4e8] to-[#ffd0d8] py-4 text-lg font-bold text-[#4a1522] shadow-[0_6px_20px_rgba(200,100,120,0.35)] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={dayJournalClosed}
            whileTap={{ scale: dayJournalClosed ? 1 : 0.98 }}
            onClick={() => {
              const r = closeDayJournal(viewDateKey);
              if (r.ok && r.gapKcal !== undefined) {
                const g = r.gapKcal;
                const sign = g > 0 ? "+" : "";
                setNote(
                  `היומן נסגר. פער (צריכה − TDEE): ${sign}${g.toLocaleString("he-IL")} ${"\u05e7\u05e7\u05f4\u05dc"}.`
                );
                setError(null);
                setJournalRev((x) => x + 1);
              } else {
                setNote(null);
                setError(r.message ?? "לא ניתן לסגור את היומן");
              }
            }}
          >
            {dayJournalClosed
              ? "היומן נסגר ליום זה"
              : isViewingToday
                ? "סגירת יומן"
                : `סגירת יומן — ${viewDateKey}`}
          </motion.button>
        ) : null}
      </section>

      <BarcodeScanModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onApplyToHome={(name, noteMsg) => {
          setFood(name);
          setSuggestionsDismissed(true);
          setNote(noteMsg);
          setError(null);
        }}
      />
      <ManualFoodModal
        open={manualFoodOpen}
        onClose={() => setManualFoodOpen(false)}
        dateKey={viewDateKey}
        gender={profile?.gender === "male" ? "male" : "female"}
        onSuccess={(msg) => {
          setEntries(getEntriesForDate(viewDateKey));
          setDictTick((t) => t + 1);
          setNote(msg);
          setError(null);
        }}
      />
    </div>
  );
}
