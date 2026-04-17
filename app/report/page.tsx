"use client";

import { motion } from "framer-motion";
import { useMemo, useEffect, useState } from "react";
import {
  buildCalorieAccumulationTable,
  FAT_KCAL_PER_G,
} from "@/lib/calorieAccumulation";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";
import { isDayJournalClosed, loadProfile, loadWeights } from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";

const KCAL_PER_KG = 7700;

function formatHeDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ReportPage() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("cj-profile-updated", bump);
    window.addEventListener("cj-story-reveal-updated", bump);
    window.addEventListener("cj-day-journal-closed", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("cj-profile-updated", bump);
      window.removeEventListener("cj-story-reveal-updated", bump);
      window.removeEventListener("cj-day-journal-closed", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const accumulation = useMemo(() => buildCalorieAccumulationTable(), [rev]);

  const metrics = useMemo(() => {
    const profile = loadProfile();
    const weights = loadWeights();
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const current =
      sorted.length > 0 ? sorted[sorted.length - 1].kg : profile.weightKg;
    const start = sorted.length > 0 ? sorted[0].kg : profile.weightKg;
    const lost = Math.max(0, start - current);
    const remaining = Math.max(0, current - profile.goalWeightKg);
    const kcalToBurn = remaining * KCAL_PER_KG;
    const daysToGoal = getDaysRemainingToGoal();

    return {
      profile,
      start,
      current,
      lost,
      remaining,
      kcalToBurn: Math.round(kcalToBurn),
      daysToGoal,
    };
  }, [rev]);

  const totalFat = accumulation.totalAccumulatedKcal / FAT_KCAL_PER_G;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:py-12" dir="rtl">
      <BackToMenuButton />
      <motion.h1
        className="mb-6 text-center text-3xl font-extrabold text-[#333333] md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        דוח אסטרטגי
      </motion.h1>

      <motion.div
        className="glass-panel mb-8 space-y-5 p-5 text-[#333333]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        aria-labelledby="report-summary-heading"
      >
        <h2 id="report-summary-heading" className="sr-only">
          סיכום אסטרטגי
        </h2>
        <div>
          <p className="text-sm font-semibold text-[#333333]/85">
            סה״כ ירידה מתחילת המעקב
          </p>
          <p className="text-2xl font-extrabold text-[#333333]">
            {metrics.lost.toFixed(1)} ק״ג
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-[#333333]/85">
            נותר ליעד ({metrics.profile.goalWeightKg} ק״ג)
          </p>
          <p className="text-2xl font-extrabold text-[#333333]">
            {metrics.remaining.toFixed(1)} ק״ג
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-[#333333]/85">
            סה״כ קלוריות לשריפה
          </p>
          <p className="text-2xl font-extrabold text-[#333333]">
            {metrics.kcalToBurn.toLocaleString("he-IL")} קק״ל
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[#333333]/85">
            ספירה לאחור ליעד
          </p>
          {metrics.daysToGoal != null ? (
            <p className="text-2xl font-extrabold text-[#333333]">
              בערך {metrics.daysToGoal} ימים
            </p>
          ) : (
            <p className="text-lg font-medium text-[#333333]/85">
              לא ניתן לחשב
            </p>
          )}
        </div>

        <p className="border-t border-[#FADADD] pt-3 text-sm text-[#333333]/85">
          משקל נוכחי: {metrics.current} ק״ג
        </p>
      </motion.div>

      <motion.section
        className="mb-8 overflow-hidden rounded-2xl border-2 border-[#FADADD] bg-gradient-to-b from-[#fff5f7] to-white shadow-[0_8px_32px_rgba(250,218,221,0.45)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        aria-labelledby="report-table-heading"
      >
        <div className="border-b border-[#FADADD] bg-white/80 px-4 py-4 text-center sm:px-6">
          <h2
            id="report-table-heading"
            className="text-base font-bold text-[#333333]"
          >
            פירוט ימים
          </h2>
          <p className="mt-1 text-xs font-medium text-[#333333]/70">
            צבירה לפי ימים שסגרת את היומן ופתחת את הקובייה בלוח
          </p>
        </div>

        <div className="p-3 sm:p-4">
          {accumulation.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#333333]/75">
              אין עדיין ימים עם רישום ביומן.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#FADADD] bg-white">
              <table className="w-full min-w-[20rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-[#FADADD]/45 text-[#333333]">
                    <th className="border-b border-[#FADADD] px-2 py-3 text-right font-bold sm:px-3">
                      תאריך
                    </th>
                    <th className="border-b border-[#FADADD] px-2 py-3 text-right font-bold sm:px-3">
                      פער יומי
                      <span className="block text-[10px] font-semibold opacity-80">
                        לפי סגירת יומן · צריכה − TDEE (קק״ל)
                      </span>
                    </th>
                    <th className="border-b border-[#FADADD] px-2 py-3 text-right font-bold sm:px-3">
                      צבירה כללית
                      <span className="block text-[10px] font-semibold opacity-80">
                        (קק״ל)
                      </span>
                    </th>
                    <th className="border-b border-[#FADADD] px-2 py-3 text-right font-bold sm:px-3">
                      שווה ערך בשומן
                      <span className="block text-[10px] font-semibold opacity-80">
                        (גרם)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accumulation.rows.map((row, i) => (
                    <tr
                      key={row.dateKey}
                      className={
                        i % 2 === 0 ? "bg-white" : "bg-[#fffafb]"
                      }
                    >
                      <td className="border-b border-[#FADADD]/60 px-2 py-2.5 text-[#333333] sm:px-3">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {formatHeDate(row.dateKey)}
                          {isDayJournalClosed(row.dateKey) ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-[#1f5f3a]/25 bg-[#ecfdf3] px-2 py-0.5 text-[#166534]"
                              title="היומן נסגר ליום זה (במסך הבית)"
                              aria-label="יומן נסגר ליום זה"
                            >
                              <span
                                className="text-[11px] font-bold leading-none"
                                aria-hidden
                              >
                                {"\u2713"}
                              </span>
                              <span className="text-[10px] font-semibold leading-tight sm:text-[11px]">
                                יומן נסגר
                              </span>
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td
                        className={`border-b border-[#FADADD]/60 px-2 py-2.5 font-medium tabular-nums sm:px-3 ${
                          row.dailyBalanceKcal == null
                            ? "text-[#333333]/45"
                            : row.dailyBalanceKcal < 0
                              ? "text-[#1f5f3a]"
                              : row.dailyBalanceKcal > 0
                                ? "text-[#8b2e2e]"
                                : "text-[#333333]"
                        }`}
                      >
                        {row.dailyBalanceKcal == null ? (
                          "—"
                        ) : (
                          <>
                            {row.dailyBalanceKcal > 0 ? "+" : ""}
                            {Math.round(row.dailyBalanceKcal).toLocaleString(
                              "he-IL"
                            )}
                          </>
                        )}
                      </td>
                      <td className="border-b border-[#FADADD]/60 px-2 py-2.5 font-semibold tabular-nums text-[#333333] sm:px-3">
                        {Math.round(row.accumulatedKcal).toLocaleString("he-IL")}
                      </td>
                      <td className="border-b border-[#FADADD]/60 px-2 py-2.5 tabular-nums text-[#333333]/95 sm:px-3">
                        {row.fatEquivalentG.toLocaleString("he-IL", {
                          maximumFractionDigits: 1,
                          minimumFractionDigits: 0,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section
        className="mb-8 overflow-hidden rounded-2xl border-2 border-[#FADADD] bg-gradient-to-b from-[#fff5f7] to-white shadow-[0_8px_32px_rgba(250,218,221,0.45)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        aria-labelledby="report-accumulation-heading"
      >
        <div className="px-4 py-6 text-center sm:px-6">
          <p
            id="report-accumulation-heading"
            className="text-sm font-semibold text-[#333333]/80"
          >
            הון מצטבר (קלוריות חסכון מצטברות)
          </p>
          <p className="mt-2 font-[system-ui,Segoe_UI,sans-serif] text-4xl font-extrabold tracking-tight text-[#2a2a2a] sm:text-5xl">
            {accumulation.totalAccumulatedKcal.toLocaleString("he-IL")}{" "}
            <span className="text-2xl font-bold text-[#333333]/85 sm:text-3xl">
              קק״ל
            </span>
          </p>
          <p className="mt-2 text-sm font-medium text-[#333333]/75">
            שקול שומן מצטבר:{" "}
            <span className="font-semibold text-[#333333]">
              {totalFat.toLocaleString("he-IL", {
                maximumFractionDigits: 1,
                minimumFractionDigits: 0,
              })}{" "}
              ג׳
            </span>
          </p>
        </div>
      </motion.section>
    </div>
  );
}
