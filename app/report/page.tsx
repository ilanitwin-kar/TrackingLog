"use client";

import { motion } from "framer-motion";
import { useMemo, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  buildCalorieAccumulationTable,
  FAT_KCAL_PER_G,
} from "@/lib/calorieAccumulation";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";
import { getJourneyStartDateKey, loadProfile, loadWeights } from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import {
  gf,
  strategicReportIntroBody,
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

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T12:00:00`);
  const b = new Date(`${toKey}T12:00:00`);
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export default function ReportPage() {
  const [rev, setRev] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllWins, setShowAllWins] = useState(false);

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
      weights: sorted,
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
  const journeyStart = getJourneyStartDateKey();
  const todayKey = new Date().toISOString().slice(0, 10);
  const daysSinceStart = journeyStart ? daysBetweenDateKeys(journeyStart, todayKey) : 0;
  const winsRows = accumulation.rows;
  const winsVisibleRows = showAllWins ? winsRows : winsRows.slice(-30);
  const winsAvgContributionKcal =
    winsRows.length > 0 ? accumulation.totalAccumulatedKcal / winsRows.length : 0;

  const shareWhatsApp = useCallback(() => {
    const text = buildStrategicReportShareWhatsAppText(
      accumulation.totalAccumulatedKcal,
      closedDaysCount
    );
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [accumulation.totalAccumulatedKcal, closedDaysCount]);

  const copyShareText = useCallback(async () => {
    const text = buildStrategicReportShareWhatsAppText(
      accumulation.totalAccumulatedKcal,
      closedDaysCount
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }, [accumulation.totalAccumulatedKcal, closedDaysCount]);

  const metricCardClass =
    "rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-3 py-3 shadow-sm";

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-8 md:py-12" dir="rtl">
      <BackToMenuButton label="חזרה למסך הבית" href="/" />
      <motion.h1
        className="heading-page mb-5 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="inline-flex items-center justify-center gap-2">
          <span>מרכז ההישגים</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--border-cherry-soft)] bg-white text-base font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
            aria-label="הסבר"
            title="הסבר"
            onClick={() => setHelpOpen((x) => !x)}
          >
            ?
          </button>
          <span aria-hidden className="ms-1">
            🏆
          </span>
        </span>
      </motion.h1>

      {helpOpen ? (
        <motion.div
          className="mb-6 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-3 text-right shadow-[0_8px_24px_var(--panel-shadow-soft)]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm leading-relaxed text-[var(--text)]/85">
            {strategicReportIntroBody(gender)}
          </p>
        </motion.div>
      ) : null}

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
          <p className="inline-flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight text-[var(--cherry)] sm:text-3xl">
            <span>סיפור ההצלחה שלך</span>
            <span aria-hidden>🍒</span>
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
            {gf(
              gender,
              "גלי כמה קלוריות שרפת מתחילת התהליך",
              "גלה כמה קלוריות שרפת מתחילת התהליך"
            )}
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
            <div className="mt-4 flex flex-col items-center gap-3">
              <p className="text-sm font-semibold text-[var(--stem)]/85">
                {gf(
                  gender,
                  `עברו ${daysSinceStart} ימים מאז שהתחלת — ירדת ${metrics.lost.toFixed(1)} ק״ג, ונשארו ${metrics.remaining.toFixed(1)} ק״ג להגיע לגוף החלומות שלך.`,
                  `עברו ${daysSinceStart} ימים מאז שהתחלת — ירדת ${metrics.lost.toFixed(1)} ק״ג, ונשארו ${metrics.remaining.toFixed(1)} ק״ג להגיע לגוף החלומות שלך.`
                )}
              </p>
              <p className="text-sm font-extrabold text-[var(--cherry)]">
                {gf(
                  gender,
                  "סגרי היום את היום הראשון — ותתחילי לכתוב את סיפור ההצלחה שלך.",
                  "סגור היום את היום הראשון — ותתחיל לכתוב את סיפור ההצלחה שלך."
                )}
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-2 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
              >
                לסגירת יום ראשון ביומן
              </Link>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section
        className="glass-panel mb-8 p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
      >
        <h2 className="panel-title-cherry mb-2 text-center text-lg">
          מה עושים עכשיו?
        </h2>
        <ul className="space-y-2 text-sm text-[var(--text)]/85">
          <li>
            <span className="font-extrabold text-[var(--cherry)]">סוגרים יום ביומן</span>{" "}
            כדי לבנות התקדמות מצטברת.
          </li>
          <li>
            <span className="font-extrabold text-[var(--cherry)]">מוסיפים שקילה</span>{" "}
            כדי שהמסלול והתחזית יהיו מדויקים יותר.
          </li>
          <li>
            <span className="font-extrabold text-[var(--cherry)]">שיתוף</span>{" "}
            עוזר לשמור על מוטיבציה — במיוחד כשיש רצף.
          </li>
        </ul>
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

        {(() => {
          const today = new Date();
          const from = new Date(today);
          from.setDate(from.getDate() - 29);
          const fromKey = from.toISOString().slice(0, 10);
          const weights30 = (metrics.weights ?? []).filter((w) => w.date >= fromKey);
          const sorted30 = [...weights30].sort((a, b) =>
            a.date.localeCompare(b.date)
          );
          const hasGraph = sorted30.length >= 2;
          if (!hasGraph) {
            return (
              <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-[var(--text)]/80">
                  {gf(
                    gender,
                    "כדי לראות גרף משקל ל־30 ימים אחרונים — הוסיפי לפחות שתי שקילות.",
                    "כדי לראות גרף משקל ל־30 ימים אחרונים — הוסף לפחות שתי שקילות."
                  )}
                </p>
                <Link
                  href="/weight"
                  className="mt-3 inline-flex items-center justify-center rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-2 text-sm font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
                >
                  {gf(gender, "הוסיפי משקל", "הוסף משקל")}
                </Link>
              </div>
            );
          }

          const pad = 12;
          const w = 640;
          const h = 160;
          const xs = sorted30.map((_, i) =>
            sorted30.length <= 1
              ? pad
              : pad + (i * (w - pad * 2)) / (sorted30.length - 1)
          );
          const ysData = sorted30.map((x) => x.kg);
          const minY = Math.min(...ysData, metrics.profile.goalWeightKg);
          const maxY = Math.max(...ysData, metrics.profile.goalWeightKg);
          const range = Math.max(0.4, maxY - minY);
          const yMin = minY - range * 0.15;
          const yMax = maxY + range * 0.15;
          const yFor = (kg: number) =>
            pad + ((yMax - kg) * (h - pad * 2)) / (yMax - yMin);

          const points = sorted30.map((p, i) => ({
            x: xs[i]!,
            y: yFor(p.kg),
            kg: p.kg,
            date: p.date,
          }));
          const d = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
            .join(" ");
          const goalY = yFor(metrics.profile.goalWeightKg);
          const last = points[points.length - 1]!;
          const first = points[0]!;
          const delta = last.kg - first.kg;
          const trendLabel =
            delta < -0.05
              ? gf(gender, "מגמה: ירידה", "מגמה: ירידה")
              : delta > 0.05
                ? gf(gender, "מגמה: עליה", "מגמה: עליה")
                : gf(gender, "מגמה: שמירה", "מגמה: שמירה");

          return (
            <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-[var(--cherry)]">
                  גרף משקל — 30 ימים אחרונים
                </p>
                <p className="text-xs font-semibold text-[var(--stem)]/80">
                  {trendLabel}
                </p>
              </div>
              <svg
                viewBox={`0 0 ${w} ${h}`}
                className="h-36 w-full"
                role="img"
                aria-label="גרף משקל ל־30 ימים אחרונים"
              >
                <defs>
                  <linearGradient id="wLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="var(--cherry)" stopOpacity="0.55" />
                    <stop offset="1" stopColor="var(--stem)" stopOpacity="0.55" />
                  </linearGradient>
                </defs>

                <rect
                  x="0"
                  y="0"
                  width={w}
                  height={h}
                  rx="16"
                  fill="rgba(255,255,255,0.0)"
                />

                <line
                  x1={pad}
                  y1={goalY}
                  x2={w - pad}
                  y2={goalY}
                  stroke="var(--cherry)"
                  strokeOpacity="0.22"
                  strokeDasharray="6 6"
                  strokeWidth="2"
                />

                <path d={d} fill="none" stroke="url(#wLine)" strokeWidth="4" />

                {points.map((p, idx) => (
                  <circle
                    key={`${p.date}-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r={idx === points.length - 1 ? 7 : 5}
                    fill={idx === points.length - 1 ? "var(--cherry)" : "white"}
                    stroke="var(--cherry)"
                    strokeWidth="2.5"
                  />
                ))}
              </svg>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-[var(--text)]/70">
                <span>
                  התחלה: {first.kg.toFixed(1)} ק״ג
                </span>
                <span>
                  היום: {last.kg.toFixed(1)} ק״ג
                </span>
                <span>
                  יעד: {metrics.profile.goalWeightKg.toFixed(1)} ק״ג
                </span>
              </div>
            </div>
          );
        })()}

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
                נוסיף תחזית אחרי עוד כמה נתונים
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
              ? `${metrics.lost.toFixed(1)} ק״ג מתוך ${metrics.totalKgToLose.toFixed(1)} ק״ג ליעד`
              : "אין פער משקל ליעד — או שהיעד עודכן."}
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
          <p className="inline-flex items-center justify-center gap-2 text-lg font-extrabold text-[var(--cherry)] sm:text-xl">
            <span aria-hidden>🏆</span>
            <span>הניצחונות שלך</span>
          </p>
        </div>
        <div className="p-3 sm:p-4">
          {winsRows.length > 0 ? (
            <div className="mb-3 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-3 py-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-[var(--cherry)]">
                  סיכום קצר
                </p>
                {winsRows.length > 30 ? (
                  <button
                    type="button"
                    className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                    onClick={() => setShowAllWins((x) => !x)}
                    aria-pressed={showAllWins}
                  >
                    {showAllWins ? "הצג 30 אחרונים" : `הצג הכל (${winsRows.length})`}
                  </button>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-[var(--stem)]/75">
                    ימים סגורים
                  </p>
                  <p className="mt-0.5 text-base font-extrabold tabular-nums text-[var(--cherry)]">
                    {winsRows.length}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-[var(--stem)]/75">
                    סה״כ מצטבר
                  </p>
                  <p className="mt-0.5 text-base font-extrabold tabular-nums text-[var(--cherry)]">
                    {Math.round(accumulation.totalAccumulatedKcal).toLocaleString("he-IL")} קק״ל
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-[var(--stem)]/75">
                    ממוצע ליום
                  </p>
                  <p className="mt-0.5 text-base font-extrabold tabular-nums text-[var(--cherry)]">
                    {Math.round(winsAvgContributionKcal).toLocaleString("he-IL")} קק״ל
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border-cherry-soft)] bg-white px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-[var(--stem)]/75">
                    ירידה משוערת
                  </p>
                  <p className="mt-0.5 text-base font-extrabold tabular-nums text-[var(--cherry)]">
                    {Math.round(totalFat).toLocaleString("he-IL")} ג׳
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-[var(--stem)]/70">
                {showAllWins
                  ? "מציג את כל הימים שסגרת ביומן."
                  : "מציג 30 ימים אחרונים (אפשר להציג הכל)."}
              </p>
            </div>
          ) : null}
          {accumulation.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--cherry)]/75">
              כשתסגרי ימים ביומן, יופיע כאן הפירוט וההתקדמות המצטברת שלך.
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
                      סה״כ מצטבר
                      <span className="block text-[10px] font-semibold opacity-80">
                        (קק״ל)
                      </span>
                    </th>
                    <th className="border-b border-[var(--border-cherry-soft)] px-2 py-3 text-right font-bold sm:px-3">
                      ירידה משוערת
                      <span className="block text-[10px] font-semibold opacity-80">
                        (גרם)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {winsVisibleRows.map((row, i) => (
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
        <div className="grid grid-cols-2 gap-2">
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
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-4 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
            onClick={copyShareText}
          >
            <span aria-hidden>{copied ? "✓" : "📋"}</span>
            {copied
              ? gf(gender, "הועתק", "הועתק")
              : gf(gender, "העתקת טקסט", "העתקת טקסט")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
