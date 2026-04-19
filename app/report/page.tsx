"use client";

import { motion } from "framer-motion";
import { useMemo, useEffect, useState, useCallback } from "react";
import {
  buildCalorieAccumulationTable,
  FAT_KCAL_PER_G,
} from "@/lib/calorieAccumulation";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";
import { loadProfile, loadWeights } from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { InfoCard } from "@/components/InfoCard";
import {
  strategicReportIntroBody,
  strategicReportIntroTitle,
  strategicReportShareButtonLabel,
} from "@/lib/hebrewGenderUi";
import { buildStrategicReportShareWhatsAppText } from "@/lib/strategicReportShare";

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
    window.addEventListener("cj-journal-closed-changed", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("cj-profile-updated", bump);
      window.removeEventListener("cj-journal-closed-changed", bump);
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
    const totalKgToLose = Math.max(0, start - profile.goalWeightKg);
    const weightProgressPct =
      totalKgToLose > 0
        ? Math.min(100, (lost / totalKgToLose) * 100)
        : lost > 0
          ? 100
          : 0;

    return {
      profile,
      start,
      current,
      lost,
      remaining,
      kcalToBurn: Math.round(kcalToBurn),
      daysToGoal,
      totalKgToLose,
      weightProgressPct,
    };
  }, [rev]);

  const totalFat = accumulation.totalAccumulatedKcal / FAT_KCAL_PER_G;
  const showAccumulation = accumulation.hasAnyClosedDay;
  const closedDaysCount = accumulation.rows.length;
  const gender = metrics.profile.gender;

  const shareWhatsApp = useCallback(() => {
    const text = buildStrategicReportShareWhatsAppText(
      accumulation.totalAccumulatedKcal,
      closedDaysCount
    );
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [accumulation.totalAccumulatedKcal, closedDaysCount]);

  const metricCardClass =
    "rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-3 py-3 shadow-sm";

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-8 md:py-12" dir="rtl">
      <BackToMenuButton />
      <motion.h1
        className="heading-page mb-5 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        דוח אסטרטגי
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <InfoCard
          gender={gender}
          icon="🏆"
          title={strategicReportIntroTitle()}
          body={strategicReportIntroBody(gender)}
        />
      </motion.div>

      {/* כספת הון — מספר בולט */}
      <motion.section
        className="relative mb-8 overflow-hidden rounded-3xl border-2 border-amber-400/45 bg-gradient-to-b from-[#1a1510]/[0.06] via-amber-50/90 to-[#fff9e6] shadow-[0_12px_40px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.85)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(180,140,40,0.25) 6px, rgba(180,140,40,0.25) 7px)",
          }}
        />
        <div className="relative px-4 py-8 text-center sm:px-8 sm:py-10">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-900/70">
            הון מצטבר
          </p>
          <p
            className="mt-3 font-black tabular-nums leading-none text-[#c9a227] drop-shadow-sm sm:mt-4"
            style={{ fontSize: "clamp(2.75rem, 10vw, 4.25rem)" }}
          >
            {showAccumulation
              ? accumulation.totalAccumulatedKcal.toLocaleString("he-IL")
              : "0"}
            <span className="ms-2 text-[0.42em] font-extrabold text-[#2d6a3e]">
              קק״ל
            </span>
          </p>
          <p className="mt-4 text-sm font-semibold text-[var(--stem)]/85">
            הון שנצבר מסגירת ימים ביומן
          </p>
          {showAccumulation ? (
            <p className="mt-2 text-sm font-medium text-[var(--stem)]/75">
              שקול שומן מצטבר:{" "}
              <span className="font-semibold text-[#2d6a3e]">
                {totalFat.toLocaleString("he-IL", {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 0,
                })}{" "}
                ג׳
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm font-medium text-[var(--stem)]/70">
              ההון יוצג אחרי סגירת היום הראשון ביומן.
            </p>
          )}
        </div>
      </motion.section>

      {/* כרטיסיות נתונים + פס משקל */}
      <motion.section
        className="mb-8 space-y-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <h2 className="text-center text-sm font-bold text-[var(--cherry)]">
          מסלול היעד במשקל
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className={metricCardClass}>
            <p className="text-xs font-semibold text-[var(--cherry)]">
              ירידה מתחילת המעקב
            </p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--stem)]">
              {metrics.lost.toFixed(1)} ק״ג
            </p>
          </div>
          <div className={metricCardClass}>
            <p className="text-xs font-semibold text-[var(--cherry)]">
              נותר ליעד ({metrics.profile.goalWeightKg} ק״ג)
            </p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--stem)]">
              {metrics.remaining.toFixed(1)} ק״ג
            </p>
          </div>
          <div className={metricCardClass}>
            <p className="text-xs font-semibold text-[var(--cherry)]">
              קלוריות לשריפה (עד היעד)
            </p>
            <p className="mt-1 text-lg font-extrabold tabular-nums leading-tight text-[var(--stem)]">
              {metrics.kcalToBurn.toLocaleString("he-IL")} קק״ל
            </p>
          </div>
          <div className={metricCardClass}>
            <p className="text-xs font-semibold text-[var(--cherry)]">
              ספירה לאחור ליעד
            </p>
            {metrics.daysToGoal != null ? (
              <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--stem)]">
                ~{metrics.daysToGoal} ימים
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-[var(--cherry)]/80">
                לא ניתן לחשב
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[var(--stem)]">
            <span>התקדמות מול יעד המשקל</span>
            <span className="tabular-nums text-[var(--cherry)]">
              {Math.round(metrics.weightProgressPct)}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#f0f0f0]">
            <motion.div
              className="h-full rounded-full bg-[var(--cherry)]"
              initial={{ width: 0 }}
              animate={{ width: `${metrics.weightProgressPct}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--stem)]/75">
            {metrics.totalKgToLose > 0
              ? `${metrics.lost.toFixed(1)} ק״ג מתוך ${metrics.totalKgToLose.toFixed(1)} ק״ג ליעד (מנקודת ההתחלה)`
              : "אין פער משקל ליעד מנקודת ההתחלה — או שהיעד עודכן."}
          </p>
        </div>
      </motion.section>

      {/* טבלת צבירה */}
      <motion.section
        className="page-hero-surface mb-8 overflow-hidden rounded-2xl border-2 border-[var(--border-cherry-soft)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="border-b border-[var(--border-cherry-soft)] bg-white/85 px-3 py-3 text-center sm:px-4">
          <p className="text-sm font-bold text-[var(--cherry)]">
            פירוט ימים סגורים
          </p>
        </div>
        <div className="p-3 sm:p-4">
          {accumulation.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--cherry)]/75">
              אין עדיין ימים סגורים ביומן — הצבירה מתעדכנת רק אחרי סגירת יום.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-cherry-soft)] bg-white">
              <table className="w-full min-w-[20rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-cherry-faint text-[var(--cherry)]">
                    <th className="border-b border-[var(--border-cherry-soft)] px-2 py-3 text-right font-bold sm:px-3">
                      תאריך
                    </th>
                    <th className="border-b border-[var(--border-cherry-soft)] px-2 py-3 text-right font-bold sm:px-3">
                      גירעון יומי
                      <span className="block text-[10px] font-semibold opacity-80">
                        (קק״ל)
                      </span>
                    </th>
                    <th className="border-b border-[var(--border-cherry-soft)] px-2 py-3 text-right font-bold sm:px-3">
                      צבירה כללית
                      <span className="block text-[10px] font-semibold opacity-80">
                        (קק״ל)
                      </span>
                    </th>
                    <th className="border-b border-[var(--border-cherry-soft)] px-2 py-3 text-right font-bold sm:px-3">
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
                      className={i % 2 === 0 ? "bg-white" : "bg-[#fffafb]"}
                    >
                      <td className="border-b border-[var(--border-cherry-soft)] px-2 py-2.5 text-[var(--stem)] sm:px-3">
                        {formatHeDate(row.dateKey)}
                      </td>
                      <td
                        className={`border-b border-[var(--border-cherry-soft)] px-2 py-2.5 font-medium tabular-nums sm:px-3 ${
                          row.dailyBalanceKcal >= 0
                            ? "text-[#1f5f3a]"
                            : "text-[#8b2e2e]"
                        }`}
                      >
                        {row.dailyBalanceKcal > 0 ? "+" : ""}
                        {Math.round(row.dailyBalanceKcal).toLocaleString(
                          "he-IL"
                        )}
                      </td>
                      <td className="border-b border-[var(--border-cherry-soft)] px-2 py-2.5 font-semibold tabular-nums text-[var(--stem)] sm:px-3">
                        {Math.round(row.accumulatedKcal).toLocaleString("he-IL")}
                      </td>
                      <td className="border-b border-[var(--border-cherry-soft)] px-2 py-2.5 tabular-nums text-[var(--cherry)]/90 sm:px-3">
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
        className="sticky bottom-4 z-10 sm:static sm:bottom-auto"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <button
          type="button"
          className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-gradient-to-b from-[#22c55e] to-[#15803d] px-4 py-4 text-base font-extrabold text-white shadow-[0_10px_30px_rgba(21,128,61,0.35)] transition hover:brightness-105 active:scale-[0.99]"
          onClick={shareWhatsApp}
        >
          <span className="text-2xl" aria-hidden>
            📲
          </span>
          {strategicReportShareButtonLabel(gender)}
        </button>
      </motion.div>
    </div>
  );
}
