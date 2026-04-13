"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { CalorieBoardGrid } from "@/components/CalorieBoardGrid";
import {
  buildCalorieAccumulationTable,
  FAT_KCAL_PER_G,
} from "@/lib/calorieAccumulation";
import { loadProfile, loadWeights } from "@/lib/storage";

const KCAL_PER_KG = 7700;

export default function CalorieBoardPage() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("cj-profile-updated", bump);
    window.addEventListener("cj-story-reveal-updated", bump);
    window.addEventListener("cj-day-journal-closed", bump);
    window.addEventListener("storage", bump);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("cj-profile-updated", bump);
      window.removeEventListener("cj-story-reveal-updated", bump);
      window.removeEventListener("cj-day-journal-closed", bump);
      window.removeEventListener("storage", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const { accumulation, kcalToBurn, remainingKcalToBurn } = useMemo(() => {
    const acc = buildCalorieAccumulationTable();
    const profile = loadProfile();
    const weights = loadWeights();
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const current =
      sorted.length > 0 ? sorted[sorted.length - 1].kg : profile.weightKg;
    const remainingKg = Math.max(0, current - profile.goalWeightKg);
    const burn = Math.round(remainingKg * KCAL_PER_KG);
    const afterBank = Math.max(0, burn + acc.totalAccumulatedKcal);
    return {
      accumulation: acc,
      kcalToBurn: burn,
      remainingKcalToBurn: afterBank,
    };
  }, [rev]);

  const totalFat =
    accumulation.totalAccumulatedKcal / FAT_KCAL_PER_G;

  return (
    <div
      className="mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 md:pb-32"
      dir="rtl"
    >
      <BackToMenuButton />

      <motion.h1
        className="mb-6 text-center text-2xl font-extrabold text-[#333333] md:text-3xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        לוח צבירת הקלוריות שלי
      </motion.h1>

      <motion.section
        className="mb-8 rounded-2xl border-2 border-[#FADADD] bg-gradient-to-b from-[#fff8fa] to-white px-4 py-6 text-center shadow-[0_8px_28px_rgba(250,218,221,0.4)] sm:px-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="text-sm font-semibold text-[#333333]/80">
          סך קלוריות לשריפה (עד היעד הסופי)
        </p>
        <p className="mt-1 font-[system-ui] text-3xl font-extrabold tabular-nums text-[#2a2a2a] sm:text-4xl">
          {remainingKcalToBurn.toLocaleString("he-IL")}{" "}
          <span className="text-xl font-bold text-[#333333]/90 sm:text-2xl">{"\u05e7\u05e7\u05f4\u05dc"}</span>
        </p>
        <p className="mt-2 text-xs font-medium text-[#333333]/70">
          חוב התחלתי:{" "}
          <span className="font-[system-ui] font-semibold tabular-nums text-[#333333]">
            {kcalToBurn.toLocaleString("he-IL")}
          </span>{" "}
          {"\u05e7\u05e7\u05f4\u05dc"} · סכום פערים מקוביות שנפתחו (אחרי סגירת יומן):{" "}
          <span className="font-[system-ui] font-semibold tabular-nums text-[#333333]">
            {accumulation.totalAccumulatedKcal > 0 ? "+" : ""}
            {accumulation.totalAccumulatedKcal.toLocaleString("he-IL")}
          </span>{" "}
          {"\u05e7\u05e7\u05f4\u05dc"} — שלילי מקטין את החוב, חיובי מגדיל (חריגה)
        </p>
        <p className="mt-2 text-xs font-semibold text-[#333333]/75">
          יעד יומי (קלוריות לאכילה):{" "}
          <span className="font-[system-ui] tabular-nums">
            {accumulation.dailyTargetKcal.toLocaleString("he-IL")}
          </span>{" "}
          {"\u05e7\u05e7\u05f4\u05dc"} · גירעון מתוכנן (TDEE − יעד):{" "}
          <span className="font-[system-ui] tabular-nums">
            {(
              accumulation.tdeeKcal - accumulation.dailyTargetKcal
            ).toLocaleString("he-IL")}
          </span>{" "}
          {"\u05e7\u05e7\u05f4\u05dc"}
        </p>
        <p className="mt-3 text-sm font-medium text-[#333333]/85">
          {totalFat.toLocaleString("he-IL", {
            maximumFractionDigits: 1,
            minimumFractionDigits: 0,
          })}{" "}
          גרם שומן שהתפוגגו
        </p>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <CalorieBoardGrid profileRev={rev} />
      </motion.div>
    </div>
  );
}
