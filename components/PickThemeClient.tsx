"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  SelectPathManVector,
  SelectPathWomanVector,
} from "@/components/SelectPathVectors";
import { BlueberryMark } from "@/components/BlueberryMark";
import { CherryMark } from "@/components/CherryMark";
import {
  setAppVariant,
  type AppVariant,
} from "@/lib/appVariant";
import { DevAdminQuickEntry } from "@/components/DevAdminQuickEntry";

/**
 * מסך בחירה ראשוני — אלכסון: שמאל BLUE (גברים), ימין צ'רי (נשים).
 * חשוב: מסך ב־dir=ltr כדי ש־justify-start/end יתיישרו פיזית (אחרת RTL על ההורה הופך פינות).
 */
export function PickThemeClient() {
  const router = useRouter();
  const [selected, setSelected] = useState<AppVariant | null>(null);

  const copy = useMemo(() => {
    return {
      cherry: {
        title: "CHERRY",
        subtitle: "לשון נקבה · ורוד רך",
        cta: "בואי נתחיל",
        emoji: "🍒",
        bg: "#C2185B",
        btn: "#ff5fa2",
      },
      blueberry: {
        title: "BLUE",
        subtitle: "לשון זכר · כחול רך",
        cta: "בוא נתחיל",
        emoji: "🫐",
        bg: "#001F3F",
        btn: "#1b4f7a",
      },
    } as const;
  }, []);

  function choose(v: AppVariant) {
    setSelected(v);
  }

  function confirm() {
    if (!selected) return;
    setAppVariant(selected);
    router.replace("/welcome");
  }

  return (
    <div
      className="relative isolate min-h-dvh w-full overflow-hidden bg-[#000814]"
      dir="ltr"
    >
      <header className="pointer-events-none absolute inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex justify-center px-4">
        <h1
          dir="rtl"
          className="text-center text-xl font-semibold tracking-tight text-white sm:text-2xl"
        >
          בחרו מסלול
        </h1>
      </header>

      {/* שמאל — גברים (Blueberry) */}
      <motion.section
        className="absolute inset-0 z-[2] overflow-hidden"
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)", background: copy.blueberry.bg }}
        aria-label="BLUE — מסלול לגברים"
        animate={{
          opacity: selected === "cherry" ? 0.25 : 1,
          filter: selected === "cherry" ? "saturate(0.85)" : "saturate(1)",
        }}
        transition={{ duration: 0.25 }}
        onClick={() => choose("blueberry")}
      >
        {/* ממורכז עמוק במשולש השמאלי — שמאלה מהאלכסון כדי שלא ייחתך הכיתוב */}
        <div className="absolute left-[26%] top-[28%] -translate-x-1/2 -translate-y-1/2 px-4 pt-[max(3.5rem,env(safe-area-inset-top))] sm:left-[28%] sm:px-6">
          <div className="flex w-full max-w-[min(20rem,78vw)] flex-col items-center text-center sm:max-w-[22rem]">
            <motion.div
              className="flex size-24 items-center justify-center rounded-full bg-white/95 shadow-[0_14px_35px_rgba(0,0,0,0.35)] sm:size-28"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            >
              <span className="text-4xl sm:text-5xl">{copy.blueberry.emoji}</span>
            </motion.div>
            <SelectPathManVector className="mt-4 h-[13.25rem] w-[13.25rem] drop-shadow-[0_22px_70px_rgba(0,0,0,0.55)] sm:h-[15.25rem] sm:w-[15.25rem]" />
            <div className="mt-4 flex items-center justify-center gap-3">
              <BlueberryMark
                tone="brand"
                className="h-9 w-10 drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)] sm:h-10 sm:w-11"
              />
              <div className="text-[2.35rem] font-semibold tracking-[-0.02em] text-white sm:text-[2.65rem]">
                BLUE
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold text-white/80" dir="rtl">
              {copy.blueberry.subtitle}
            </p>
            <AnimatePresence>
              {selected === "blueberry" && (
                <motion.button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirm();
                  }}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-[#1b4f7a] px-8 py-3 text-base font-extrabold text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)] transition hover:brightness-110 active:scale-[0.99]"
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                >
                  {copy.blueberry.cta}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      {/* ימין — נשים (דובדבן עמוק) */}
      <motion.section
        className="absolute inset-0 z-[1] overflow-hidden"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)", background: copy.cherry.bg }}
        aria-label="Cherry — מסלול לנשים"
        animate={{
          opacity: selected === "blueberry" ? 0.25 : 1,
          filter: selected === "blueberry" ? "saturate(0.85)" : "saturate(1)",
        }}
        transition={{ duration: 0.25 }}
        onClick={() => choose("cherry")}
      >
        <div className="absolute left-[67%] top-[67%] -translate-x-1/2 -translate-y-1/2 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex w-full max-w-[22rem] flex-col items-center text-center">
            <motion.div
              className="flex size-24 items-center justify-center rounded-full bg-white/95 shadow-[0_14px_35px_rgba(0,0,0,0.3)] sm:size-28"
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            >
              <span className="text-4xl sm:text-5xl">{copy.cherry.emoji}</span>
            </motion.div>
            <SelectPathWomanVector className="mt-4 h-[13.25rem] w-[13.25rem] drop-shadow-[0_22px_70px_rgba(0,0,0,0.45)] sm:h-[15.25rem] sm:w-[15.25rem]" />
            <div className="mt-4 flex items-center justify-center gap-3">
              <CherryMark className="h-9 w-10 drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)] sm:h-10 sm:w-11" />
              <div className="text-[2.35rem] font-semibold tracking-[-0.02em] text-white sm:text-[2.65rem]">
                CHERRY
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold text-white/85" dir="rtl">
              {copy.cherry.subtitle}
            </p>
            <AnimatePresence>
              {selected === "cherry" && (
                <motion.button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirm();
                  }}
                  className="mt-4 inline-flex items-center justify-center rounded-2xl bg-[#ff5fa2] px-8 py-3 text-base font-extrabold text-white shadow-[0_12px_28px_rgba(0,0,0,0.3)] transition hover:brightness-105 active:scale-[0.99]"
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                >
                  {copy.cherry.cta}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      {/* אלכסון חד ונקי */}
      <svg
        className="pointer-events-none absolute inset-0 z-[6] h-full w-full"
        aria-hidden
      >
        <line
          x1="100%"
          y1="0"
          x2="0"
          y2="100%"
          stroke="#ffffff"
          strokeOpacity="0.14"
          strokeWidth={2}
          shapeRendering="crispEdges"
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[45] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto w-full max-w-md">
          <DevAdminQuickEntry
            variant="pickDark"
            buttonLabel="כניסת מנהלת — דילוג על פרטים (פיתוח)"
          />
        </div>
      </div>
    </div>
  );
}
