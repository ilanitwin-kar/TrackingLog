"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BarcodeScanModal } from "@/components/BarcodeScanModal";
import { IconCaption } from "@/components/IconCaption";
import { IconPlusCircle, IconScanBarcode, IconVerified } from "@/components/Icons";
import { addDaysToDateKey, getTodayKey } from "@/lib/dateKey";
import {
  GEMINI_UNAVAILABLE_MSG,
  type GeminiInsightState,
  type HomeSuggestRow,
  sortHomeLocalRows,
} from "@/lib/foodSearchShared";
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
  saveDayLogEntries,
  saveFoodMemoryKey,
  upsertDictionaryFromScan,
} from "@/lib/storage";
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

function resolveDateKey(raw: string | null): string {
  const today = getTodayKey();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  if (raw > today) return today;
  return raw;
}

export function AddFoodClient() {
  const gender = loadProfile().gender;
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateKey = resolveDateKey(searchParams.get("date"));

  const [food, setFood] = useState("");

  const [debouncedFoodSearch, setDebouncedFoodSearch] = useState("");
  const [homeLocalRows, setHomeLocalRows] = useState<HomeSuggestRow[]>([]);
  const [homeSearchLoading, setHomeSearchLoading] = useState(false);
  const [worldRows, setWorldRows] = useState<HomeSuggestRow[]>([]);
  const [worldSearchLoading, setWorldSearchLoading] = useState(false);
  const [geminiInsight, setGeminiInsight] = useState<GeminiInsightState>({
    kind: "idle",
  });

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
  const [recentPicks, setRecentPicks] = useState<HomeSuggestRow[]>([]);

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

  const todayKey = getTodayKey();
  const canNextDay = dateKey < todayKey;

  const addFoodDateLabel = useMemo(() => {
    try {
      return new Date(`${dateKey}T12:00:00`).toLocaleDateString("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateKey;
    }
  }, [dateKey]);

  function goAddFoodByDelta(delta: number) {
    const next = addDaysToDateKey(dateKey, delta);
    if (next > todayKey) return;
    router.replace(`/add-food?date=${encodeURIComponent(next)}`);
  }

  function onPickAddFoodDate(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (v > todayKey) return;
    router.replace(`/add-food?date=${encodeURIComponent(v)}`);
  }

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
      setWorldRows([]);
      setWorldSearchLoading(false);
      setGeminiInsight({ kind: "idle" });
    }
  }, [food]);

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
      setWorldRows([]);
      setWorldSearchLoading(false);
      setGeminiInsight({ kind: "idle" });
      return;
    }
    const ac = new AbortController();
    setHomeSearchLoading(true);
    setGeminiInsight({ kind: "idle" });
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
            source: "local" as const,
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
          pageSize: "24",
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
        setWorldRows(sortHomeLocalRows(mapped, debouncedFoodSearch));
      } catch {
        if (!ac.signal.aborted) setWorldRows([]);
      } finally {
        if (!ac.signal.aborted) setWorldSearchLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedFoodSearch]);

  useEffect(() => {
    if (debouncedFoodSearch.length < 2) {
      setGeminiInsight({ kind: "idle" });
      return;
    }
    if (homeSearchLoading || worldSearchLoading) return;
    if (homeLocalRows.length > 0 || worldRows.length > 0) {
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
  }, [
    debouncedFoodSearch,
    homeSearchLoading,
    homeLocalRows.length,
    worldSearchLoading,
    worldRows.length,
  ]);

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
    if (!pickModalRow) return;
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
    if (applyPickModalRow(row)) {
      queueMicrotask(() => searchInputRef.current?.blur());
    }
  }

  function openPickModalFromRow(row: HomeSuggestRow) {
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
    setHomeLocalRows([]);
    setWorldRows([]);
    setHomeSearchLoading(false);
    setWorldSearchLoading(false);
    setGeminiInsight({ kind: "idle" });
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
        (row.source ?? "local") !== "openFoodFacts",
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
    const entry: LogEntry = {
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
    };
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    saveFoodMemoryKey(row.name.trim(), srv.qty, srv.unit, srv.gramsPerUnit);
    rememberFoodPick(row);
    setRecentPicks(loadRecentFoodPicks());
    setPickPressedDiary(true);
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
    const entry: LogEntry = {
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
    };
    const existing = getEntriesForDate(dateKey);
    saveDayLogEntries(dateKey, [entry, ...existing]);
    saveFoodMemoryKey(row.name.trim(), srv.qty, srv.unit, srv.gramsPerUnit);
    rememberFoodPick(row);
    setRecentPicks(loadRecentFoodPicks());
    setPickPressedDiary(true);
    setPickPressedDictionary(true);
    setPickPressedBothShortcut(true);
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
      const entry: LogEntry = {
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
      };
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
      router.push(`/?date=${encodeURIComponent(dateKey)}`);
    } finally {
      setManLoading(false);
    }
  }

  const homeLink = `/?date=${encodeURIComponent(dateKey)}`;

  const pickPreview = useMemo(() => {
    if (!pickModalRow) return null;
    return macrosFromPickRow(pickModalRow, pickEffectiveTotalGrams);
  }, [pickModalRow, pickEffectiveTotalGrams]);

  return (
    <div
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-gradient-to-b from-[#fff8fa] via-white to-[#f6faf3]"
      dir="rtl"
    >
      <header className="shrink-0 border-b-2 border-[var(--border-cherry-soft)] bg-white/95 px-3 py-3 shadow-sm backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-start gap-2">
          <Link
            href={homeLink}
            className="shrink-0 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[#fff5f7]"
          >
            חזרה
          </Link>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <h1 className="panel-title-cherry text-lg">הוסף מזון</h1>
            <div className="flex w-full max-w-[20rem] items-center justify-center gap-1.5">
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white text-xl font-bold leading-none text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.97]"
                aria-label="יום קודם ביומן"
                onClick={() => goAddFoodByDelta(-1)}
              >
                ‹
              </button>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                <label className="w-full max-w-[12rem] cursor-pointer">
                  <span className="sr-only">תאריך ביומן</span>
                  <input
                    type="date"
                    value={dateKey}
                    max={todayKey}
                    onChange={onPickAddFoodDate}
                    className="w-full cursor-pointer rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-1 py-1.5 text-center text-xs font-bold text-[var(--stem)] shadow-sm"
                  />
                </label>
                <p className="max-w-full truncate px-1 text-[10px] font-medium text-[var(--cherry)]/70">
                  {addFoodDateLabel}
                </p>
              </div>
              <button
                type="button"
                disabled={!canNextDay}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white text-xl font-bold leading-none text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="יום הבא ביומן"
                onClick={() => goAddFoodByDelta(1)}
              >
                ›
              </button>
            </div>
          </div>
          <div className="w-[4.25rem] shrink-0" aria-hidden />
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden px-3 pt-3">
        <label className="shrink-0">
          <span className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[var(--stem)]">
            <span>חיפוש</span>
            <button
              type="button"
              className="shrink-0 rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-2.5 py-1 text-xs font-bold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={openManualModal}
            >
              הוספה ידנית
            </button>
          </span>
          <p className="mb-2 text-[11px] font-medium text-[var(--cherry)]/65">
            {gender === "male" ? (
              <>
                לחץ <span className="font-bold">+</span> ליד מוצר כדי להוסיף ליומן{" "}
              </>
            ) : (
              <>
                לחצי <span className="font-bold">+</span> ליד מוצר כדי להוסיף ליומן{" "}
              </>
            )}
            (בחירת משקל בגרם).
          </p>
          <div className="relative">
            <input
              ref={searchInputRef}
              type="search"
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
              placeholder={gf(gender, "חפשי מזון…", "חפש מזון…")}
              className="input-luxury-search w-full ps-4 pe-[5.25rem] sm:pe-24"
            />
            <button
              type="button"
              className="absolute end-1.5 top-1/2 z-[11] flex min-h-[2.65rem] min-w-[4.25rem] -translate-y-1/2 flex-col items-center justify-center gap-0 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-1 py-0.5 text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              aria-label="סריקת ברקוד — פתיחת מצלמה לסריקת מוצר"
              title="סריקת ברקוד — מעבר למסך סריקה"
              onClick={() => {
                searchInputRef.current?.blur();
                setScanModalOpen(true);
              }}
            >
              <IconCaption label="ברקוד">
                <IconScanBarcode className="h-5 w-5 sm:h-6 sm:w-6" />
              </IconCaption>
            </button>
          </div>
        </label>

        {recentPicks.length > 0 && (
          <div className="mt-3 shrink-0">
            <p className="mb-1.5 text-xs font-bold text-[var(--cherry)]">
              נבחרו לאחרונה
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {recentPicks.map((r) => (
                <button
                  key={`${r.id}-${r.name}`}
                  type="button"
                  className="max-w-[11rem] shrink-0 truncate rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-start text-xs font-semibold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
                  title={r.name}
                  onClick={() => openPickModalFromRow(r)}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-6 [-webkit-overflow-scrolling:touch]">
          {!showResultsPanel ? (
            <p className="py-8 text-center text-sm text-[var(--cherry)]/70">
              {gf(
                gender,
                "הקלידי לפחות שתי אותיות כדי לראות תוצאות.",
                "הקלד לפחות שתי אותיות כדי לראות תוצאות."
              )}
            </p>
          ) : (
            <div className="space-y-3 rounded-xl border border-[var(--border-cherry-soft)] bg-white/90 p-2 shadow-sm">
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

              {searchPanelSync && (
                <>
                  <div>
                    <p className="px-2 pb-2 text-sm font-bold text-[var(--cherry)]">
                      מאגר אינטליגנציה קלורית
                    </p>
                    {homeSearchLoading && homeLocalRows.length === 0 ? (
                      <div
                        className="flex items-center gap-2 px-2 py-2 text-sm text-[var(--stem)]"
                        role="status"
                      >
                        <span
                          className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--border-cherry-soft)] border-t-[var(--cherry)]"
                          aria-hidden
                        />
                        טוען…
                      </div>
                    ) : homeLocalRows.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-[var(--cherry)]/65">
                        אין התאמות במאגר
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {homeLocalRows.map((s) => (
                          <li
                            key={`l-${s.id}`}
                            className="flex items-stretch gap-1.5"
                          >
                            <button
                              type="button"
                              className="suggestion-item flex min-w-0 flex-1 flex-col items-stretch gap-0.5 rounded-lg px-3 py-2.5 text-right transition hover:bg-[var(--cherry-muted)]"
                              onClick={() => setFood(s.name)}
                            >
                              <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 font-semibold text-[var(--stem)]">
                                <span>{s.name}</span>
                                {(s.source ?? "local") !== "openFoodFacts" && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-md border border-[#e6c65c]/80 bg-[#fff9e6] px-2 py-0.5"
                                    title="מאומת"
                                  >
                                    <span
                                      className="text-sm font-bold leading-none text-[#d4a017]"
                                      aria-hidden
                                    >
                                      ★
                                    </span>
                                    <IconVerified className="h-3.5 w-3.5 shrink-0 text-[#d4a017]" />
                                    <span className="text-[10px] font-extrabold tracking-wide text-[#b8860b]">
                                      מאומת
                                    </span>
                                  </span>
                                )}
                              </span>
                              {s.category != null && (
                                <span className="text-[11px] text-[var(--cherry)]/65">
                                  {s.category}
                                </span>
                              )}
                              {s.calories != null && (
                                <span className="text-[11px] text-[var(--cherry)]/75">
                                  קלוריות: {Math.round(s.calories)} · חלבון:{" "}
                                  {s.protein ?? "—"} · פחמימות:{" "}
                                  {s.carbs ?? "—"} · שומן: {s.fat ?? "—"}{" "}
                                  <span className="text-[var(--cherry)]/55">
                                    (ל־100 ג׳)
                                  </span>
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="flex min-w-[3.35rem] shrink-0 flex-col items-center justify-center rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-0.5 py-1 text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.98]"
                              aria-label={`הוספת «${s.name}» — בחירת כמות ויעד ליומן`}
                              title="הוספה ליומן — בחירת כמות"
                              onClick={(e) => openPickModal(s, e)}
                            >
                              <IconCaption label="הוספה">
                                <IconPlusCircle className="h-6 w-6 sm:h-7 sm:w-7" />
                              </IconCaption>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-t border-[var(--border-cherry-soft)] pt-2">
                    <p className="px-2 pb-2 text-sm font-bold text-[var(--cherry)]">
                      מאגר עולמי
                    </p>
                    {worldSearchLoading && worldRows.length === 0 ? (
                        <div
                          className="flex items-center gap-2 px-2 py-2 text-sm text-[var(--stem)]"
                          role="status"
                        >
                          <span
                            className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--border-cherry-soft)] border-t-[var(--cherry)]"
                            aria-hidden
                          />
                          טוען מאגר עולמי…
                        </div>
                      ) : worldRows.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-[var(--cherry)]/65">
                          לא נמצאו תוצאות במאגר העולמי.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {worldRows.map((s) => (
                            <li
                              key={`w-${s.id}`}
                              className="flex items-stretch gap-1.5"
                            >
                              <button
                                type="button"
                                className="suggestion-item flex min-w-0 flex-1 flex-col items-stretch gap-0.5 rounded-lg px-3 py-2.5 text-right transition hover:bg-[var(--cherry-muted)]"
                                onClick={() => setFood(s.name)}
                              >
                                <span className="font-semibold text-[var(--stem)]">
                                  {s.name}
                                </span>
                                {s.calories != null && (
                                  <span className="text-[11px] text-[var(--cherry)]/75">
                                    קלוריות: {Math.round(s.calories)} · חלבון:{" "}
                                    {s.protein ?? "—"} · פחמימות:{" "}
                                    {s.carbs ?? "—"} · שומן: {s.fat ?? "—"}{" "}
                                    <span className="text-[var(--cherry)]/55">
                                      (ל־100 ג׳)
                                    </span>
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                className="flex min-w-[3.35rem] shrink-0 flex-col items-center justify-center rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-0.5 py-1 text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.98]"
                                aria-label={`הוספת «${s.name}» — בחירת כמות ויעד ליומן`}
                                title="הוספה ליומן — בחירת כמות"
                                onClick={(e) => openPickModal(s, e)}
                              >
                                <IconCaption label="הוספה">
                                  <IconPlusCircle className="h-6 w-6 sm:h-7 sm:w-7" />
                                </IconCaption>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>

                  {!homeSearchLoading &&
                    homeLocalRows.length === 0 &&
                    !worldSearchLoading &&
                    worldRows.length === 0 && (
                      <div className="border-t border-[var(--border-cherry-soft)] pt-2">
                        <p className="px-2 pb-2 text-sm font-bold text-[var(--cherry)]">
                          השלמה חכמה
                        </p>
                        {geminiInsight.kind === "loading" && (
                          <div
                            className="flex items-center gap-2 px-2 py-2 text-sm text-[var(--stem)]"
                            role="status"
                          >
                            <span
                              className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--border-cherry-soft)] border-t-[var(--cherry)]"
                              aria-hidden
                            />
                            טוען…
                          </div>
                        )}
                        {geminiInsight.kind === "error" && (
                          <p className="px-2 py-1 text-xs text-[#a94444]">
                            {geminiInsight.message}
                          </p>
                        )}
                        {geminiInsight.kind === "notFood" && (
                          <p className="px-2 py-1 text-xs text-[var(--cherry)]/70">
                            לא זוהה כמזון.
                          </p>
                        )}
                        {geminiInsight.kind === "ok" && (
                          <div className="flex items-stretch gap-1.5 px-1">
                            <button
                              type="button"
                              className="suggestion-item flex min-w-0 flex-1 flex-col items-stretch gap-0.5 rounded-lg py-2 pe-3 ps-2 text-right hover:bg-[var(--cherry-muted)]"
                              onClick={() => setFood(geminiInsight.name)}
                            >
                              <span className="font-semibold text-[var(--stem)]">
                                {geminiInsight.name}
                              </span>
                              <span className="text-[11px] text-[var(--cherry)]/75">
                                קלוריות: {Math.round(geminiInsight.calories)} ·
                                חלבון: {Math.round(geminiInsight.protein)} ·
                                פחמימות: {Math.round(geminiInsight.carbs)} ·
                                שומן: {Math.round(geminiInsight.fat)}
                                <span className="text-[var(--cherry)]/55">
                                  {" "}
                                  (ל־100 ג׳ — הערכה)
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="flex min-w-[3.35rem] shrink-0 flex-col items-center justify-center rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-0.5 py-1 text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.98]"
                              aria-label={`הוספת «${geminiInsight.name}» — בחירת כמות ויעד ליומן`}
                              title="הוספה ליומן — בחירת כמות"
                              onClick={(e) =>
                                openPickModal(
                                  {
                                    id: "gemini",
                                    name: geminiInsight.name,
                                    verified: false,
                                    calories: geminiInsight.calories,
                                    protein: geminiInsight.protein,
                                    carbs: geminiInsight.carbs,
                                    fat: geminiInsight.fat,
                                  },
                                  e
                                )
                              }
                            >
                              <IconCaption label="הוספה">
                                <IconPlusCircle className="h-6 w-6 sm:h-7 sm:w-7" />
                              </IconCaption>
                            </button>
                          </div>
                        )}
                        {geminiInsight.kind === "idle" && (
                          <p className="px-2 py-1 text-[11px] text-[var(--cherry)]/55">
                            ממתין…
                          </p>
                        )}
                      </div>
                    )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

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
