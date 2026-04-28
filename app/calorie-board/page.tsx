"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { CalorieBoardGrid } from "@/components/CalorieBoardGrid";
import {
  buildCalorieAccumulationTable,
  FAT_KCAL_PER_G,
} from "@/lib/calorieAccumulation";

export default function CalorieBoardPage() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("cj-profile-updated", bump);
    window.addEventListener("cj-journal-closed-changed", bump);
    window.addEventListener("storage", bump);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("cj-profile-updated", bump);
      window.removeEventListener("cj-journal-closed-changed", bump);
      window.removeEventListener("storage", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const accumulation = useMemo(
    () => buildCalorieAccumulationTable(),
    [rev]
  );

  const totalFat =
    accumulation.totalAccumulatedKcal / FAT_KCAL_PER_G;
  const showAccumulation = accumulation.hasAnyClosedDay;

  return (
    <div
      className="mx-auto max-w-lg px-4 py-8 pb-28 md:py-12 md:pb-32"
      dir="rtl"
    >
      <motion.h1
        className="heading-page mb-6 text-center text-2xl md:text-3xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        לוח צבירת הקלוריות שלי
      </motion.h1>

      <motion.section
        className="page-hero-surface mb-8 rounded-2xl border-2 border-[var(--border-cherry-soft)] px-4 py-6 text-center sm:px-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="text-base font-semibold text-[var(--cherry)] sm:text-lg">
          סה״כ הון קלורי שנצבר:{" "}
          <span className="font-[system-ui] text-2xl font-extrabold tabular-nums text-[var(--ui-hero-metric)] sm:text-3xl">
            {showAccumulation
              ? accumulation.totalAccumulatedKcal.toLocaleString("he-IL")
              : "0"}
          </span>{" "}
          <span className="text-xl font-bold text-[var(--ui-hero-metric-unit)]/90">
            קק״ל
          </span>
        </p>
        {showAccumulation ? (
          <p className="mt-3 text-sm font-medium text-[var(--stem)]/90">
            {totalFat.toLocaleString("he-IL", {
              maximumFractionDigits: 1,
              minimumFractionDigits: 0,
            })}{" "}
            גרם שומן שהתפוגגו
          </p>
        ) : (
          <p className="mt-3 text-sm font-medium text-[var(--stem)]/75">
            ההון יוצג אחרי סגירת היום הראשון ביומן.
          </p>
        )}
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
