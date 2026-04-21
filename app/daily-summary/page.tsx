"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Pie, PieChart, ResponsiveContainer, Cell } from "recharts";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { InfoCard } from "@/components/InfoCard";
import { dailyMacroTargetsGrams } from "@/lib/macroTargets";
import { getTodayKey } from "@/lib/dateKey";
import { getEntriesForDate, loadProfile, type LogEntry } from "@/lib/storage";
import { dailyCalorieTarget } from "@/lib/tdee";

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function sum(entries: LogEntry[], key: "proteinG" | "carbsG" | "fatG"): number {
  return entries.reduce((s, e) => s + (typeof e[key] === "number" ? (e[key] as number) : 0), 0);
}

export default function DailySummaryPage() {
  const profile = loadProfile();
  const gender = profile.gender;
  const [rev, setRev] = useState(0);

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

  const computedTarget: number = dailyCalorieTarget(
    profile.gender,
    profile.weightKg,
    profile.heightCm,
    profile.age,
    profile.deficit,
    profile.activity
  );

  const consumedKcal = useMemo(
    () => entries.reduce((s, e) => s + e.calories, 0),
    [entries]
  );
  const remaining = Math.max(0, computedTarget - consumedKcal);
  const over = Math.max(0, consumedKcal - computedTarget);

  const macroGoals = useMemo(() => dailyMacroTargetsGrams(computedTarget), [computedTarget]);
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

  const proteinTop = useMemo(() => {
    return [...entries]
      .filter((e) => typeof e.proteinG === "number" && (e.proteinG ?? 0) > 0)
      .sort((a, b) => (b.proteinG ?? 0) - (a.proteinG ?? 0))
      .slice(0, 8);
  }, [entries]);

  const [focusMacro, setFocusMacro] = useState<null | "protein" | "carbs" | "fat">(null);

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-8 md:pt-12" dir="rtl">
      <BackToMenuButton />

      <motion.h1
        className="heading-page mb-5 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        סיכום יומי
      </motion.h1>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <InfoCard
          gender={gender}
          icon={gender === "male" ? "🫐" : "🍒"}
          title="Cherry / Blue — הסיכום שלך"
          body="גרף הטבעת מציג צריכה מול יעד, ופסי המאקרו מתעדכנים אוטומטית לפי מה שהזנת ביומן."
          className="mb-5"
        />
      </motion.div>

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

      <motion.section
        className="glass-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <p className="text-center text-sm font-extrabold text-[var(--cherry)]">
          התחזית של {gender === "male" ? "Blue" : "Cherry"}
        </p>
        <p className="mt-2 text-center text-sm leading-relaxed text-[var(--stem)]/85">
          {(() => {
            const hour = new Date().getHours();
            const dayPct =
              computedTarget > 0 ? Math.round((consumedKcal / computedTarget) * 100) : 0;
            if (over > 0) {
              return gender === "male"
                ? "נראה שהיום חרגנו קצת, לא נורא! מחר יום חדש של אוכמניות. אולי נסגור ערב קל יותר."
                : "נראה שהיום חרגנו קצת, לא נורא! מחר יום חדש של דובדבנים. אולי נסגרי ערב קלילה יותר.";
            }
            if (hour >= 18 && remaining > 0) {
              return gender === "male"
                ? `נשארו לך עוד ${remaining} קלוריות — ואתה מנהל את היום כמו מקצוען. 🫐`
                : `נשאר לך עוד ${remaining} קלוריות — ואת מנהלת את היום כמו מקצוענית. 🍒`;
            }
            if (dayPct >= 80) {
              return gender === "male"
                ? `בקצב הזה אתה בדרך מדויקת ליעד היום. עוד קצת וסגרת יום חזק 🫐`
                : `בקצב הזה את בדרך מדויקת ליעד היום. עוד קצת וסגרת יום מושלם 🍒`;
            }
            return gender === "male"
              ? "Blue איתך — תוסיף עוד ארוחה אחת חכמה ותראה את הגרף קופץ יפה."
              : "Cherry איתך — עוד בחירה חכמה והיום נראה אפילו יותר נוצץ.";
          })()}
        </p>
      </motion.section>
    </div>
  );
}

