"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { colors } from "@/lib/colors";
import { gf } from "@/lib/hebrewGenderUi";
import {
  allPantryDictionaryIds,
  countAtomicStep,
  defaultPantryState,
  isMcDonaldsPerMealProductName,
  isPerMealAromaEspressoBarProductName,
  loadMenuBuilderPantryState,
  pantryValidationIssues,
  saveMenuBuilderPantryState,
  skipPantryRawDryFreshFilters,
  type MenuBuilderPantryPersistedV1,
  type PantryAtomicStepId,
  type PantryValidationIssue,
  visiblePantryAtomicSteps,
} from "@/lib/menuBuilderPantry";
import { typography } from "@/lib/typography";
import {
  addExplorerFoodToDictionaryIfAbsent,
  loadDictionary,
  loadProfile,
} from "@/lib/storage";

type FoodItem = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  category: string;
};

/** בשר/דגים: לא להציג סימון «טרי» במובן לא מוכן לאכילה — לא חל על ירקות ופירות */
const EXCLUDE_FRESH_MARKER_STEPS: ReadonlySet<PantryAtomicStepId> = new Set([
  "meat_fresh",
  "meat_frozen",
  "meat_deli",
  "fish_fresh",
  "fish_frozen",
]);

function hasWholeWordHebrew(nameNorm: string, w: string): boolean {
  const he = /[\u0590-\u05FF]/;
  const before = (i: number) => (i <= 0 ? true : !he.test(nameNorm[i - 1]!));
  const after = (i: number, len: number) =>
    i + len >= nameNorm.length ? true : !he.test(nameNorm[i + len]!);
  let from = 0;
  for (;;) {
    const i = nameNorm.indexOf(w, from);
    if (i < 0) return false;
    if (before(i) && after(i, w.length)) return true;
    from = i + 1;
  }
}

/** אבקות/תערובות: לא להציג מוצר יבש שאינו מסומן כמוכן לאכילה */
function isPowdersCategoryExcludeNonReadyDry(name: string): boolean {
  const raw = name.trim();
  if (!raw) return true;
  const s = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const lower = s.toLowerCase();
  const signalsDry =
    lower.includes("מזון יבש") ||
    hasWholeWordHebrew(lower, "יבש") ||
    hasWholeWordHebrew(lower, "תערובת") ||
    hasWholeWordHebrew(lower, "אבקה");
  if (!signalsDry) return false;
  const hasReady =
    lower.includes("מוכן") ||
    lower.includes("מוכנים") ||
    hasWholeWordHebrew(lower, "מוכן");
  return !hasReady;
}

/** רק במסך מזווה בונה התפריט — מסנן מוצרים ששמם מרמז על מצב לא אכיל לפי הניסוח */
function isExcludedPantryExplorerName(
  name: string,
  stepId: PantryAtomicStepId,
  productDbCategory?: string,
): boolean {
  const s = name.trim();
  if (!s) return true;
  if (s.includes("לא מבושל")) return true;
  if (stepId !== "powders_mixes" && s.includes("מזון יבש")) return true;
  const he = /[\u0590-\u05FF]/;
  const before = (i: number) => (i <= 0 ? true : !he.test(s[i - 1]!));
  const after = (i: number, len: number) =>
    i + len >= s.length ? true : !he.test(s[i + len]!);
  const hasWord = (w: string) => {
    let from = 0;
    for (;;) {
      const i = s.indexOf(w, from);
      if (i < 0) return false;
      if (before(i) && after(i, w.length)) return true;
      from = i + 1;
    }
  };
  const skipDryFresh =
    stepId === "nuts_seeds_dried" ||
    stepId === "powders_mixes" ||
    skipPantryRawDryFreshFilters(productDbCategory ?? "");
  if (!skipDryFresh) {
    if (hasWord("יבש")) return true;
    if (EXCLUDE_FRESH_MARKER_STEPS.has(stepId) && hasWord("טרי")) return true;
  }
  return false;
}

function bumpPantryEvent() {
  try {
    window.dispatchEvent(new Event("cj-menu-builder-pantry-updated"));
  } catch {
    /* ignore */
  }
}

export default function MenuBuilderPantry() {
  const router = useRouter();
  const [state, setState] = useState<MenuBuilderPantryPersistedV1>(
    defaultPantryState(),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [incompleteModalOpen, setIncompleteModalOpen] = useState(false);
  const [modalIssues, setModalIssues] = useState<PantryValidationIssue[]>([]);
  const [guidedFixIds, setGuidedFixIds] = useState<PantryAtomicStepId[] | null>(
    null,
  );

  const [profileRev, setProfileRev] = useState(0);
  useEffect(() => {
    const bump = () => setProfileRev((x) => x + 1);
    window.addEventListener("cj-profile-updated", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("cj-profile-updated", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  void profileRev;
  const gender = loadProfile().gender;

  useEffect(() => {
    setState(loadMenuBuilderPantryState());
  }, []);

  const steps = useMemo(() => visiblePantryAtomicSteps(), []);

  useEffect(() => {
    setStepIndex((i) =>
      steps.length === 0 ? 0 : Math.min(i, Math.max(0, steps.length - 1)),
    );
  }, [steps.length]);

  const current = steps[stepIndex];

  /** מעבר קטגוריה — שדה חיפוש ריק ותוצאות מתאפסות */
  useEffect(() => {
    if (!current) return;
    setQ("");
    setDebouncedQ("");
    setItems([]);
    setLoading(false);
  }, [current?.id]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setDebouncedQ("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedQ(t), 280);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!current) return;
    const ac = new AbortController();
    (async () => {
      if (debouncedQ.length < 2) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedQ,
          category: current.dbCategory,
          sort: "caloriesAsc",
          page: "1",
          pageSize: "40",
          pantry: "1",
        });
        const res = await fetch(`/api/food-explorer?${params}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("fetch");
        const data = (await res.json()) as { items: FoodItem[] };
        const raw = data.items ?? [];
        const filtered = raw
          .filter(
            (row) =>
              !isExcludedPantryExplorerName(row.name, current.id, row.category),
          )
          .filter((row) => {
            if (current.id === "aroma_per_meal") {
              return isPerMealAromaEspressoBarProductName(row.name);
            }
            if (current.id === "mcdonalds_per_meal") {
              return isMcDonaldsPerMealProductName(row.name);
            }
            if (current.id === "powders_mixes") {
              return !isPowdersCategoryExcludeNonReadyDry(row.name);
            }
            return true;
          });
        if (!ac.signal.aborted) setItems(filtered);
      } catch {
        if (!ac.signal.aborted) setItems([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [debouncedQ, current]);

  const persist = useCallback((next: MenuBuilderPantryPersistedV1) => {
    setState(next);
    saveMenuBuilderPantryState(next);
    bumpPantryEvent();
  }, []);

  const explorerList = (id: PantryAtomicStepId): string[] =>
    state.explorerIdsByStep[id] ?? [];

  const addExplorerToStep = useCallback(
    (stepId: PantryAtomicStepId, row: FoodItem) => {
      const list = explorerList(stepId);
      if (list.includes(row.id)) return;
      const dictItem = addExplorerFoodToDictionaryIfAbsent({
        id: row.id,
        name: row.name,
        calories: row.calories,
        protein: row.protein,
        fat: row.fat,
        carbs: row.carbs,
        category: row.category,
      });
      const next: MenuBuilderPantryPersistedV1 = {
        ...state,
        explorerIdsByStep: {
          ...state.explorerIdsByStep,
          [stepId]: [...list, row.id],
        },
        dictionaryIdByExplorerId: {
          ...state.dictionaryIdByExplorerId,
          [row.id]: dictItem.id,
        },
      };
      persist(next);
    },
    [state, persist],
  );

  const removeFromStep = useCallback(
    (stepId: PantryAtomicStepId, explorerId: string) => {
      const list = (state.explorerIdsByStep[stepId] ?? []).filter(
        (x) => x !== explorerId,
      );
      const { [explorerId]: _t, ...restTreat } = state.treatMealByExplorerId;
      const next: MenuBuilderPantryPersistedV1 = {
        ...state,
        explorerIdsByStep: { ...state.explorerIdsByStep, [stepId]: list },
        treatMealByExplorerId: restTreat,
      };
      persist(next);
    },
    [state, persist],
  );

  const skipDairy = useCallback(() => {
    persist({
      ...state,
      dairySkipped: true,
      explorerIdsByStep: {
        ...state.explorerIdsByStep,
        dairy_milk: [],
        dairy_cheese: [],
      },
    });
  }, [state, persist]);

  const canAdvanceStep = useMemo(() => {
    if (!current) return false;
    const n = state.explorerIdsByStep[current.id]?.length ?? 0;
    return (
      current.allowAdvanceWithoutMin ||
      current.min === 0 ||
      n >= current.min
    );
  }, [current, state.explorerIdsByStep]);

  const isLastStep = stepIndex >= steps.length - 1;

  const handleContinue = useCallback(() => {
    if (!current) return;
    if (
      guidedFixIds &&
      guidedFixIds.length > 0 &&
      guidedFixIds[0] === current.id &&
      canAdvanceStep
    ) {
      const n = countAtomicStep(state, current.id);
      if (n >= current.min) {
        const rest = guidedFixIds.slice(1);
        setGuidedFixIds(rest.length ? rest : null);
        if (rest.length > 0) {
          const idx = steps.findIndex((s) => s.id === rest[0]);
          setStepIndex(idx >= 0 ? idx : 0);
        } else {
          setStepIndex(Math.max(0, steps.length - 1));
        }
        return;
      }
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [
    canAdvanceStep,
    current,
    guidedFixIds,
    state,
    steps,
    steps.length,
  ]);

  const handleFinish = useCallback(() => {
    const issues = pantryValidationIssues(state);
    if (issues.length === 0) {
      setGuidedFixIds(null);
      setIncompleteModalOpen(false);
      router.push("/menu-builder");
      return;
    }
    setModalIssues(issues);
    setGuidedFixIds(issues.map((x) => x.stepId));
    setIncompleteModalOpen(true);
  }, [router, state]);

  const confirmIncompleteModal = useCallback(() => {
    if (modalIssues.length === 0) {
      setIncompleteModalOpen(false);
      return;
    }
    const seq = modalIssues.map((x) => x.stepId);
    setGuidedFixIds(seq);
    const idx = steps.findIndex((s) => s.id === seq[0]);
    setStepIndex(idx >= 0 ? idx : 0);
    setIncompleteModalOpen(false);
  }, [modalIssues, steps]);

  const searchPlaceholder = current ? current.searchExamples : "";
  const searchInputTitle = current
    ? `${current.searchExamples} — ${gf(gender, "הקלידי לפחות שני תווים לחיפוש", "הקלד לפחות שני תווים לחיפוש")}`
    : "";

  if (!current) {
    return (
      <div
        className={`mx-auto max-w-lg px-4 pb-28 pt-8 ${typography.familyFood}`}
        dir="rtl"
      >
        <p className="text-center font-bold text-[var(--stem-deep)]">שגיאה</p>
        <Link href="/menu-builder/pantry" className="btn-stem mt-4 block text-center">
          התחלה מחדש
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto max-w-lg px-4 pb-28 pt-4 ${typography.familyFood}`}
      dir="rtl"
    >
      <p className="mb-1 text-center text-sm font-bold text-[var(--cherry)]">
        מזווה לבניית תפריט
      </p>
      <p className="mb-4 text-center text-sm font-semibold text-[var(--stem-deep)]">
        {current.title} · שלב {stepIndex + 1} מתוך {steps.length}
      </p>
      {guidedFixIds && guidedFixIds.length > 0 ? (
        <div
          className="mb-3 rounded-xl border-2 px-3 py-2 text-center text-xs font-bold"
          style={{
            borderColor: colors.cherry,
            backgroundColor: `${colors.cherry}14`,
            color: colors.stemDeep,
          }}
        >
          {`משלימים את הקטגוריות החסרות — נשארו עוד ${guidedFixIds.length.toLocaleString("he-IL")} קטגוריות לפני מעבר לבונה התפריט`}
        </div>
      ) : null}
      <p className="mb-3 text-sm leading-snug text-gray-700">{current.hint}</p>
      <p className="mb-2 text-sm font-bold text-[var(--stem-deep)]">
        נבחרו {state.explorerIdsByStep[current.id]?.length ?? 0}
        {current.min > 0 ? (
          <>
            {" "}
            · נדרש לפחות {current.min}
          </>
        ) : null}
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {current.allowAdvanceWithoutMin ? (
          <button
            type="button"
            className="rounded-xl border-2 px-3 py-2 text-sm font-bold"
            style={{ borderColor: colors.borderCherrySoft, color: colors.stemDeep }}
            onClick={() => {
              if (current.id === "dairy_milk") {
                skipDairy();
                return;
              }
              setStepIndex((i) => Math.min(i + 1, steps.length - 1));
            }}
          >
            דלג
          </button>
        ) : null}
      </div>

      <div className="mb-3 space-y-2 rounded-xl border-2 p-3" style={{ borderColor: colors.borderCherrySoft }}>
        <p className="text-xs font-bold text-[var(--stem)]">
          קטגוריה במאגר:{" "}
          <span className="font-semibold text-gray-800">
            {current.dbCategory}
          </span>
        </p>
        <input
          key={current.id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          title={searchInputTitle}
          autoComplete="off"
          className="w-full rounded-lg border-2 px-3 py-2 text-sm"
          style={{ borderColor: colors.borderCherrySoft }}
        />
        {loading ? (
          <p className="text-xs text-gray-600">טוען…</p>
        ) : debouncedQ.length < 2 ? (
          <p className="text-xs text-gray-600">
            {gf(gender, "הקלידי לפחות שני תווים לחיפוש", "הקלד לפחות שני תווים לחיפוש")}
          </p>
        ) : (
          <ul className="max-h-56 overflow-auto rounded-lg border border-dashed" style={{ borderColor: colors.borderCherrySoft }}>
            {items.length === 0 ? (
              <li className="px-2 py-3 text-sm text-gray-600">
                אין תוצאות (או סוננו פריטים שאינם מוכנים לאכילה לפי השם)
              </li>
            ) : null}
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed px-2 py-2 last:border-b-0"
                style={{ borderColor: colors.borderCherrySoft }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{row.name}</p>
                  <p className="text-xs text-gray-600">
                    {Math.round(row.calories)} קל׳ ל־100ג׳ · {row.category}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-[var(--stem)] px-3 py-1.5 text-xs font-extrabold text-white"
                  onClick={() => addExplorerToStep(current.id, row)}
                >
                  הוסף
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4 rounded-xl border-2 p-3" style={{ borderColor: colors.borderCherrySoft }}>
        <p className="mb-2 text-sm font-extrabold text-[var(--stem-deep)]">
          נבחרו בשלב זה
        </p>
        {(state.explorerIdsByStep[current.id]?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-600">עדיין ריק</p>
        ) : (
          <ul className="space-y-2">
            {(state.explorerIdsByStep[current.id] ?? []).map((exId) => {
              const dictId = state.dictionaryIdByExplorerId[exId];
              const label =
                dictId != null
                  ? loadDictionary().find((d) => d.id === dictId)?.food ?? exId
                  : exId;
              return (
                <li
                  key={exId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 flex-1 font-semibold">{label}</span>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-bold text-[var(--cherry)]"
                    onClick={() => removeFromStep(current.id, exId)}
                  >
                    {gf(gender, "הסירי", "הסר")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isLastStep ? (
        <p className="mb-4 text-center text-xs font-semibold leading-relaxed text-[var(--stem)]/80">
          {gf(
            gender,
            "זה השלב האחרון במזווה. לחיצה על «סיום» תעביר אותך לבונה התפריט אם כל הקטגוריות הנדרשות מלאות. אם חסר משהו — יוצג הסבר, ואז תועברי לקטגוריות החסרות אחת אחרי השנייה (כל פעם «המשך» אחרי שמילאת את המינימום).",
            "זה השלב האחרון במזווה. לחיצה על «סיום» תעביר אותך לבונה התפריט אם כל הקטגוריות הנדרשות מלאות. אם חסר משהו — יוצג הסבר, ואז תועבר לקטגוריות החסרות אחת אחרי השנייה (כל פעם «המשך» אחרי שמילאת את המינימום).",
          )}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border-2 px-4 py-3 text-sm font-bold"
          style={{ borderColor: colors.borderCherrySoft, color: colors.stemDeep }}
          disabled={stepIndex <= 0}
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
        >
          חזרה
        </button>
        {isLastStep ? (
          <button
            type="button"
            className="rounded-xl border-2 px-4 py-3 text-sm font-bold text-white"
            style={{ borderColor: colors.stemDeep, backgroundColor: colors.cherry }}
            onClick={() => handleFinish()}
          >
            סיום
          </button>
        ) : (
          <button
            type="button"
            className="rounded-xl border-2 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
            style={{ borderColor: colors.stemDeep, backgroundColor: colors.stem }}
            disabled={!canAdvanceStep}
            onClick={() => handleContinue()}
          >
            המשך
          </button>
        )}
      </div>

      {incompleteModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pantry-incomplete-title"
        >
          <div
            className="max-h-[min(32rem,85vh)] w-full max-w-md overflow-y-auto rounded-2xl border-2 bg-white p-5 shadow-xl"
            style={{ borderColor: colors.borderCherrySoft }}
          >
            <p
              id="pantry-incomplete-title"
              className="text-center text-lg font-extrabold text-[var(--stem-deep)]"
            >
              עוד קצת במזווה
            </p>
            <p className="mt-2 text-center text-sm font-semibold text-[var(--stem)]/85">
              {gf(
                gender,
                "חסרים מוצרים בקטגוריות הנדרשות. אחרי הכפתור למטה תתחילי למלא — ואז בכל קטגוריה לחצי «המשך» כדי לעבור לבאה ברשימה.",
                "חסרים מוצרים בקטגוריות הנדרשות. אחרי הכפתור למטה תתחיל למלא — ואז בכל קטגוריה לחץ «המשך» כדי לעבור לבאה ברשימה.",
              )}
            </p>
            <ul
              className="mt-4 space-y-2 rounded-xl border border-dashed p-3 text-sm font-semibold text-[var(--stem-deep)]"
              style={{ borderColor: colors.borderCherrySoft }}
            >
              {modalIssues.map((iss) => (
                <li key={iss.stepId} className="text-pretty leading-snug">
                  {iss.message}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-stem mt-5 w-full rounded-2xl py-3.5 text-center text-base font-extrabold text-white shadow-md"
              onClick={() => confirmIncompleteModal()}
            >
              מעבר לקטגוריה הראשונה
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl border-2 py-2.5 text-sm font-bold text-[var(--stem-deep)]"
              style={{ borderColor: colors.borderCherrySoft }}
              onClick={() => {
                setIncompleteModalOpen(false);
                setGuidedFixIds(null);
              }}
            >
              סגירה
            </button>
          </div>
        </div>
      ) : null}

      {allPantryDictionaryIds(state).length > 0 ? (
        <p className="mt-6 text-center text-xs text-gray-600">
          סך הכל {allPantryDictionaryIds(state).length} מוצרים נשמרו במילון האישי
        </p>
      ) : null}
    </div>
  );
}
