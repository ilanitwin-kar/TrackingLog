"use client";

import { motion } from "framer-motion";
import { useMemo, useEffect, useState } from "react";
import {
  buildCalorieAccumulationTable,
  FAT_KCAL_PER_G,
} from "@/lib/calorieAccumulation";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";
import { loadProfile, loadWeights } from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { getTodayKey } from "@/lib/dateKey";

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
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("cj-profile-updated", bump);
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
  const todayKey = getTodayKey();

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

      <motion.section
        className="mb-8 overflow-hidden rounded-2xl border-2 border-[#FADADD] bg-gradient-to-b from-[#fff5f7] to-white shadow-[0_8px_32px_rgba(250,218,221,0.45)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="border-b border-[#FADADD] bg-white/80 px-4 py-6 text-center sm:px-6">
          <p className="text-sm font-semibold text-[#333333]/80">
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
                      גירעון יומי
                      <span className="block text-[10px] font-semibold opacity-80">
                        (קק״ל)
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
                        {formatHeDate(row.dateKey)}
                      </td>
                      <td
                        className={`border-b border-[#FADADD]/60 px-2 py-2.5 font-medium tabular-nums sm:px-3 ${
                          (row.dateKey < todayKey
                            ? row.dailyBalanceKcal
                            : row.plannedDailyBankKcal) >= 0
                            ? "text-[#1f5f3a]"
                            : "text-[#8b2e2e]"
                        }`}
                      >
                        {(row.dateKey < todayKey
                          ? row.dailyBalanceKcal
                          : row.plannedDailyBankKcal) > 0
                          ? "+"
                          : ""}
                        {Math.round(
                          row.dateKey < todayKey
                            ? row.dailyBalanceKcal
                            : row.plannedDailyBankKcal
                        ).toLocaleString("he-IL")}
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

      <motion.div
        className="glass-panel space-y-5 p-5 text-[#333333]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
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
    </div>
  );
}
