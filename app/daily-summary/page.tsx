"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Pie, PieChart, ResponsiveContainer, Cell } from "recharts";
import { InfoCard } from "@/components/InfoCard";
import { dailyMacroTargetsGramsForProfile } from "@/lib/macroTargets";
import {
  addDaysToDateKey,
  getCalendarWeekDateKeys,
  getTodayKey,
} from "@/lib/dateKey";
import {
  getEntriesForDate,
  getJourneyStartDateKey,
  loadDayLogs,
  loadProfile,
  type LogEntry,
} from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";
import { dailyCalorieTarget } from "@/lib/tdee";

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function sum(entries: LogEntry[], key: "proteinG" | "carbsG" | "fatG"): number {
  return entries.reduce((s, e) => s + (typeof e[key] === "number" ? (e[key] as number) : 0), 0);
}

function maxDateKey(a: string, b: string): string {
  return a >= b ? a : b;
}

function getMonthRangeKeys(todayKey: string): { startKey: string; endKey: string; keys: string[] } {
  const m = todayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { startKey: todayKey, endKey: todayKey, keys: [todayKey] };
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const startKey = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // last day of this month
  const endKey = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  const keys: string[] = [];
  let k = startKey;
  for (let i = 0; i < 40; i++) {
    keys.push(k);
    if (k === endKey) break;
    k = addDaysToDateKey(k, 1);
  }
  return { startKey, endKey, keys };
}

function formatHeMonthTitle(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

type ScopedPeriod = {
  label: string;
  title: string;
  totalDays: number;
  totalTarget: number;
  totalConsumed: number;
  remaining: number;
  over: number;
  days: { dateKey: string; consumed: number; diff: number }[];
  keys?: string[];
  pastKeys?: string[];
};

export default function DailySummaryPage() {
  const profile = loadProfile();
  const gender = profile.gender;
  const [rev, setRev] = useState(0);
  const [scope, setScope] = useState<"day" | "week" | "month">("day");
  const brandName = gender === "male" ? "Blue" : "Cherry";

  const dateKey = getTodayKey();

  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    window.addEventListener("cj-profile-updated", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
      window.removeEventListener("cj-profile-updated", bump);
    };
  }, []);

  const entries = useMemo(() => {
    void rev;
    return getEntriesForDate(dateKey);
  }, [rev, dateKey]);

  const computedTarget: number = dailyCalorieTarget(profile);

  const dayLogs = useMemo(() => {
    void rev;
    return loadDayLogs();
  }, [rev]);

  const weekKeys = useMemo(() => getCalendarWeekDateKeys(dateKey), [dateKey]);
  const monthRange = useMemo(() => getMonthRangeKeys(dateKey), [dateKey]);
  const monthKeys = monthRange.keys;
  const journeyStartKey = useMemo(() => getJourneyStartDateKey(), [rev]);

  const consumedKcal = useMemo(
    () => entries.reduce((s, e) => s + e.calories, 0),
    [entries]
  );
  const remaining = Math.max(0, computedTarget - consumedKcal);
  const over = Math.max(0, consumedKcal - computedTarget);

  const scoped: ScopedPeriod = useMemo(() => {
    if (scope === "day") {
      return {
        label: "היום",
        title: "מאזן היום",
        totalDays: 1,
        totalTarget: computedTarget,
        totalConsumed: consumedKcal,
        remaining: Math.max(0, computedTarget - consumedKcal),
        over: Math.max(0, consumedKcal - computedTarget),
        days: [{ dateKey, consumed: consumedKcal, diff: computedTarget - consumedKcal }],
      };
    }

    const baseKeys =
      scope === "week" ? weekKeys : monthKeys;
    const periodTitle =
      scope === "week"
        ? "מאזן השבוע (א׳–ש׳)"
        : `מאזן החודש (${formatHeMonthTitle(dateKey)})`;
    const startKey = journeyStartKey
      ? maxDateKey(journeyStartKey, baseKeys[0] ?? dateKey)
      : (baseKeys[0] ?? dateKey);
    const keys = baseKeys.filter((k) => k >= startKey);
    const pastKeys = keys.filter((k) => k <= dateKey);
    const fromTodayKeys = keys.filter((k) => k >= dateKey);

    const days = keys.map((k) => {
      const list = dayLogs[k] ?? [];
      const consumed = list.reduce((s, e) => s + e.calories, 0);
      const diff = computedTarget - consumed;
      return { dateKey: k, consumed, diff };
    });
    // For week/month, the UI shows "from today until end of period" (including today).
    const totalConsumed = Math.max(0, consumedKcal);
    const totalTarget = computedTarget * fromTodayKeys.length;
    const remaining = Math.max(0, totalTarget - totalConsumed);
    const over = Math.max(0, totalConsumed - totalTarget);

    return {
      label: scope === "week" ? "השבוע" : "החודש",
      title: periodTitle,
      totalDays: fromTodayKeys.length,
      totalTarget,
      totalConsumed,
      remaining,
      over,
      days,
      keys,
      pastKeys,
    };
  }, [
    scope,
    computedTarget,
    consumedKcal,
    dateKey,
    weekKeys,
    monthKeys,
    dayLogs,
    journeyStartKey,
  ]);

  function fixSuggestion(remainingKcal: number, overKcal: number, periodDays: number): string {
    if (overKcal <= 0) {
      return gf(
        gender,
        "את מאוזנת מול היעד — המשיכי ככה. אם בא לך, נסי לשמור על עוד יום “סגור” אחד בתקופה.",
        "אתה מאוזן מול היעד — המשך ככה. אם בא לך, נסה לשמור על עוד יום “סגור” אחד בתקופה."
      );
    }
    const over = Math.abs(Math.round(overKcal));
    const divisor = Math.max(2, Math.min(4, periodDays));
    const per = Math.ceil(over / divisor);
    return gf(
      gender,
      `את מעל היעד בכ־${over.toLocaleString("he-IL")} קק״ל. כדי לאזן, מספיק לקזז כ־${per.toLocaleString("he-IL")} קק״ל ב־${divisor} ימים הקרובים (או לפזר איך שנוח).`,
      `אתה מעל היעד בכ־${over.toLocaleString("he-IL")} קק״ל. כדי לאזן, מספיק לקזז כ־${per.toLocaleString("he-IL")} קק״ל ב־${divisor} ימים הקרובים (או לפזר איך שנוח).`
    );
  }

  const macroGoals = useMemo(
    () =>
      dailyMacroTargetsGramsForProfile(
        computedTarget,
        profile.weightKg,
        profile.gender
      ),
    [computedTarget, profile.weightKg, profile.gender]
  );
  const protein = useMemo(() => sum(entries, "proteinG"), [entries]);
  const carbs = useMemo(() => sum(entries, "carbsG"), [entries]);
  const fat = useMemo(() => sum(entries, "fatG"), [entries]);

  const donutData = useMemo(() => {
    if (computedTarget <= 0) return [];
    if (over > 0) {
      return [
        { name: "נצרכו", value: computedTarget },
        { name: "חריגה", value: over },
      ];
    }
    return [
      { name: "נצרכו", value: consumedKcal },
      { name: "נותרו", value: remaining },
    ];
  }, [computedTarget, consumedKcal, remaining, over]);

  // colors are driven by CSS vars (Cherry/Blueberry)

  const periodMacros = useMemo(() => {
    if (scope === "day") return null;
    const effectiveKeys = scoped.keys?.filter((k) => k >= dateKey) ?? [];
    if (effectiveKeys.length < 1) return null;

    let p = 0;
    let c = 0;
    let f = 0;
    // "From today" — include only today's entries for consumption.
    for (const k of effectiveKeys.filter((k) => k <= dateKey)) {
      const list = dayLogs[k] ?? [];
      for (const e of list) {
        if (typeof e.proteinG === "number") p += e.proteinG;
        if (typeof e.carbsG === "number") c += e.carbsG;
        if (typeof e.fatG === "number") f += e.fatG;
      }
    }
    const totalDays = scoped.totalDays;
    const goals = {
      proteinG: macroGoals.proteinG * totalDays,
      carbsG: macroGoals.carbsG * totalDays,
      fatG: macroGoals.fatG * totalDays,
    };
    return {
      protein: { val: p, goal: goals.proteinG },
      carbs: { val: c, goal: goals.carbsG },
      fat: { val: f, goal: goals.fatG },
    };
  }, [scope, scoped, dayLogs, macroGoals]);

  const proteinTop = useMemo(() => {
    return [...entries]
      .filter((e) => typeof e.proteinG === "number" && (e.proteinG ?? 0) > 0)
      .sort((a, b) => (b.proteinG ?? 0) - (a.proteinG ?? 0))
      .slice(0, 8);
  }, [entries]);

  const [focusMacro, setFocusMacro] = useState<null | "protein" | "carbs" | "fat">(null);

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-8 md:pt-12" dir="rtl">
      <motion.h1
        className="heading-page mb-5 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        סיכום
      </motion.h1>

      <div className="mb-5 flex flex-wrap justify-center gap-2">
        {(
          [
            ["day", "יום"],
            ["week", "שבוע"],
            ["month", "חודש"],
          ] as const
        ).map(([id, label]) => {
          const on = scope === id;
          return (
            <button
              key={id}
              type="button"
              className={`rounded-full border-2 px-4 py-2 text-xs font-extrabold transition ${
                on
                  ? "border-[var(--border-cherry-soft)] bg-cherry-faint text-[var(--cherry)]"
                  : "border-[var(--border-cherry-soft)] bg-white text-[var(--stem)]/85 hover:bg-[var(--cherry-muted)]"
              }`}
              onClick={() => setScope(id)}
              aria-pressed={on}
            >
              {label}
            </button>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <InfoCard
          gender={gender}
          icon={gender === "male" ? "🫐" : "🍒"}
          title={`${brandName} — הסיכום שלך`}
          body="גרף הטבעת מציג צריכה מול יעד, ופסי המאקרו מתעדכנים אוטומטית לפי מה שהזנת ביומן."
          className="mb-5"
        />
      </motion.div>

      {scope === "day" ? (
      <motion.section
        className="glass-panel mb-5 p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mx-auto w-full max-w-md">
          <div className="relative mx-auto h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={72}
                  outerRadius={100}
                  paddingAngle={2}
                  isAnimationActive
                >
                  {donutData.map((d, idx) => (
                    <Cell
                      key={`${d.name}-${idx}`}
                      fill={
                        d.name === "חריגה"
                          ? "#b91c1c"
                          : d.name === "נותרו"
                            ? "rgba(15,23,42,0.08)"
                            : "var(--cherry)"
                      }
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-xs font-bold text-[var(--stem)]/75">
                {over > 0 ? "מעל היעד" : "נותרו בתקציב"}
              </p>
              <p className="mt-1 text-4xl font-black tabular-nums text-[var(--cherry)]">
                {over > 0 ? `+${over}` : remaining}
              </p>
              <p className="text-sm font-semibold text-[var(--stem)]">קק״ל</p>
              <p className="mt-2 text-xs font-medium tabular-nums text-[var(--stem)]/80">
                {consumedKcal} / {computedTarget} קק״ל
              </p>
            </div>
          </div>
        </div>
      </motion.section>
      ) : null}

      {scope !== "day" ? (
        <motion.section
          className="glass-panel mb-5 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-center text-lg font-extrabold text-[var(--cherry)]">
            {scoped.title}
          </p>

          <div className="mx-auto mt-4 w-full max-w-md">
            <div className="relative mx-auto h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      scoped.over > 0
                        ? [
                            { name: "נצרכו", value: scoped.totalTarget },
                            { name: "חריגה", value: scoped.over },
                          ]
                        : [
                            { name: "נצרכו", value: scoped.totalConsumed },
                            { name: "נותרו", value: scoped.remaining },
                          ]
                    }
                    dataKey="value"
                    nameKey="name"
                    innerRadius={72}
                    outerRadius={100}
                    paddingAngle={2}
                    isAnimationActive
                  >
                    {(scoped.over > 0
                      ? [
                          { name: "נצרכו", value: scoped.totalTarget },
                          { name: "חריגה", value: scoped.over },
                        ]
                      : [
                          { name: "נצרכו", value: scoped.totalConsumed },
                          { name: "נותרו", value: scoped.remaining },
                        ]
                    ).map((d, idx) => (
                      <Cell
                        key={`${d.name}-${idx}`}
                        fill={
                          d.name === "חריגה"
                            ? "#b91c1c"
                            : d.name === "נותרו"
                              ? "rgba(15,23,42,0.08)"
                              : "var(--cherry)"
                        }
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-bold text-[var(--stem)]/75">
                  {scoped.over > 0 ? "מעל היעד" : `נותרו בתקציב ${scoped.label}`}
                </p>
                <p className="mt-1 text-4xl font-black tabular-nums text-[var(--cherry)]">
                  {scoped.over > 0 ? `+${Math.round(scoped.over)}` : Math.round(scoped.remaining)}
                </p>
                <p className="text-sm font-semibold text-[var(--stem)]">קק״ל</p>
                <p className="mt-2 text-xs font-medium tabular-nums text-[var(--stem)]/80">
                  {Math.round(scoped.totalConsumed).toLocaleString("he-IL")} /{" "}
                  {Math.round(scoped.totalTarget).toLocaleString("he-IL")} קק״ל
                </p>
              </div>
            </div>
          </div>

          {periodMacros ? (
            <div className="mt-5 space-y-2">
              <p className="text-center text-sm font-extrabold text-[var(--cherry)]">
                מאקרו ל{scope === "week" ? "שבוע" : "חודש"}
              </p>
              {(
                [
                  ["protein", "חלבון", periodMacros.protein.val, periodMacros.protein.goal] as const,
                  ["carbs", "פחמימות", periodMacros.carbs.val, periodMacros.carbs.goal] as const,
                  ["fat", "שומן", periodMacros.fat.val, periodMacros.fat.goal] as const,
                ] as const
              ).map(([key, label, val, goal]) => {
                const pct = clampPct(goal > 0 ? (val / goal) * 100 : 0);
                return (
                  <div
                    key={key}
                    className="w-full rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-3 py-3 text-start shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--stem)]">{label}</p>
                      <p className="text-sm font-extrabold tabular-nums text-[var(--cherry)]">
                        {Math.round(val)}ג / {Math.round(goal)}ג
                      </p>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                      <div
                        className="h-full rounded-full bg-[var(--cherry)] transition-[width] duration-500 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-3 text-right shadow-sm">
            <p className="text-sm font-extrabold text-[var(--cherry)]">מה עושים עכשיו?</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text)]/85">
              {fixSuggestion(scoped.remaining, scoped.over, scoped.totalDays)}
            </p>
          </div>
        </motion.section>
      ) : null}

      {scope === "day" ? (
        <motion.section
          className="glass-panel mb-5 space-y-3 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
        >
          <p className="text-center text-sm font-extrabold text-[var(--cherry)]">
            מאקרו היום
          </p>

        {(
          [
            ["protein", "חלבון", protein, macroGoals.proteinG] as const,
            ["carbs", "פחמימות", carbs, macroGoals.carbsG] as const,
            ["fat", "שומן", fat, macroGoals.fatG] as const,
          ] as const
        ).map(([key, label, val, goal]) => {
          const pct = clampPct(goal > 0 ? (val / goal) * 100 : 0);
          return (
            <button
              key={key}
              type="button"
              className="w-full rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-3 py-3 text-start shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={() =>
                setFocusMacro((cur) => (cur === key ? null : key))
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[var(--stem)]">{label}</p>
                <p className="text-sm font-extrabold tabular-nums text-[var(--cherry)]">
                  {Math.round(val)}ג / {Math.round(goal)}ג
                </p>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                <div
                  className="h-full rounded-full bg-[var(--cherry)] transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs font-semibold text-[var(--stem)]/70">
                לחיצה תציג פירוט
              </p>
            </button>
          );
        })}

        {focusMacro === "protein" && proteinTop.length > 0 && (
          <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 p-4">
            <p className="text-sm font-extrabold text-[var(--cherry)]">
              מה תרם הכי הרבה לחלבון היום
            </p>
            <ul className="mt-3 space-y-2">
              {proteinTop.map((e) => (
                <li
                  key={`p-${e.id}`}
                  className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-[var(--stem)]">{e.food}</p>
                  <p className="text-xs text-[var(--stem)]/75">
                    חלבון {Math.round(e.proteinG ?? 0)}ג · {e.calories} קק״ל
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {focusMacro && focusMacro !== "protein" && (
          <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 p-4 text-sm text-[var(--stem)]/85">
            בקרוב: פירוט קליקבילי גם ל{focusMacro === "carbs" ? "פחמימות" : "שומן"}.
          </div>
        )}
        </motion.section>
      ) : null}

      <motion.section
        className="glass-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <p className="text-center text-sm font-extrabold text-[var(--cherry)]">
          התחזית של {brandName}
        </p>
        <p className="mt-2 text-center text-sm leading-relaxed text-[var(--stem)]/85">
          {(() => {
            const hour = new Date().getHours();
            const active =
              scope === "day"
                ? {
                    label: "היום",
                    target: computedTarget,
                    consumed: consumedKcal,
                    remaining,
                    over,
                  }
                : {
                    label: scoped.label,
                    target: scoped.totalTarget,
                    consumed: scoped.totalConsumed,
                    remaining: Math.round(scoped.remaining),
                    over: scoped.over,
                  };
            const pct =
              active.target > 0 ? Math.round((active.consumed / active.target) * 100) : 0;
            if (active.over > 0) {
              return gender === "male"
                ? "נראה שהיום חרגנו קצת, לא נורא! מחר יום חדש של אוכמניות. אולי נסגור ערב קל יותר."
                : "נראה שהיום חרגנו קצת, לא נורא! מחר יום חדש של דובדבנים. אולי נסגרי ערב קלילה יותר.";
            }
            if (hour >= 18 && active.remaining > 0) {
              const periodText =
                scope === "day" ? "" : scope === "week" ? " לשבוע הזה" : " לחודש הזה";
              return gender === "male"
                ? `נשארו לך עוד ${active.remaining} קלוריות${periodText} — ואתה מנהל את זה כמו מקצוען. 🫐`
                : `נשאר לך עוד ${active.remaining} קלוריות${periodText} — ואת מנהלת את זה כמו מקצוענית. 🍒`;
            }
            if (pct >= 80) {
              return gender === "male"
                ? `בקצב הזה אתה בדרך מדויקת ליעד היום. עוד קצת וסגרת יום חזק 🫐`
                : `בקצב הזה את בדרך מדויקת ליעד היום. עוד קצת וסגרת יום מושלם 🍒`;
            }
            return gender === "male"
              ? `${brandName} איתך — תוסיף עוד ארוחה אחת חכמה ותראה את הגרף קופץ יפה.`
              : `${brandName} איתך — עוד בחירה חכמה והיום נראה אפילו יותר נוצץ.`;
          })()}
        </p>
      </motion.section>
    </div>
  );
}

