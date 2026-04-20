"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  setAppVariant,
  type AppVariant,
} from "@/lib/appVariant";

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
        subtitle: "המסלול הנשי",
        cta: "בואי נתחיל",
        emoji: "🍒",
        bg: "#C2185B",
      },
      blueberry: {
        title: "BLUE",
        subtitle: "המסלול הגברי",
        cta: "בוא נתחיל",
        emoji: "🫐",
        bg: "#001F3F",
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

  const splitX = selected === "blueberry" ? 70 : selected === "cherry" ? 30 : 50;

  return (
    <div
      className="relative isolate min-h-dvh w-full overflow-hidden bg-[#000814]"
      dir="ltr"
    >
      <header className="pointer-events-none absolute inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex justify-center px-4">
        <h1
          dir="rtl"
          className="text-center text-xl font-extrabold tracking-tight text-white sm:text-2xl"
        >
          בחרו מסלול
        </h1>
      </header>

      {/* שמאל — גברים (Blueberry) */}
      <motion.section
        className="absolute inset-0 z-[2] overflow-hidden"
        style={{
          clipPath: `polygon(0 0, ${splitX}% 0, 0 100%)`,
          background: copy.blueberry.bg,
        }}
        aria-label="BLUE — מסלול לגברים"
        animate={{ opacity: selected === "cherry" ? 0.3 : 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        onClick={() => choose("blueberry")}
      >
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ left: selected === "blueberry" ? "50%" : "28%", top: selected === "blueberry" ? "52%" : "32%" }}
          animate={{
            scale: selected === "blueberry" ? 1.05 : 1,
            filter: selected === "blueberry" ? "saturate(1.05)" : "saturate(1)",
          }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
          <motion.div
            className="mx-auto flex size-28 items-center justify-center rounded-full border border-white/30 bg-white/15 shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur-md sm:size-32"
            animate={{
              y: [0, -10, 0],
              scale: selected === "blueberry" ? [1.06, 1.1, 1.06] : [1, 1.02, 1],
            }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          >
            <span className="text-5xl sm:text-6xl">{copy.blueberry.emoji}</span>
          </motion.div>
          <div className="mt-5 text-[3rem] font-extrabold tracking-[-0.03em] text-white sm:text-[3.4rem]">
            {copy.blueberry.title}
          </div>
          <div className="mt-1 text-xs font-medium tracking-wide text-white/80" dir="rtl">
            {copy.blueberry.subtitle}
          </div>
        </motion.div>
      </motion.section>

      {/* ימין — נשים (דובדבן עמוק) */}
      <motion.section
        className="absolute inset-0 z-[1] overflow-hidden"
        style={{
          clipPath: `polygon(${splitX}% 0, 100% 0, 100% 100%, 0 100%)`,
          background: copy.cherry.bg,
        }}
        aria-label="Cherry — מסלול לנשים"
        animate={{ opacity: selected === "blueberry" ? 0.3 : 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        onClick={() => choose("cherry")}
      >
        <motion.div
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ left: selected === "cherry" ? "50%" : "72%", top: selected === "cherry" ? "52%" : "70%" }}
          animate={{
            scale: selected === "cherry" ? 1.05 : 1,
            filter: selected === "cherry" ? "saturate(1.05)" : "saturate(1)",
          }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
          <motion.div
            className="mx-auto flex size-28 items-center justify-center rounded-full border border-white/30 bg-white/15 shadow-[0_18px_55px_rgba(0,0,0,0.3)] backdrop-blur-md sm:size-32"
            animate={{
              y: [0, -10, 0],
              scale: selected === "cherry" ? [1.06, 1.1, 1.06] : [1, 1.02, 1],
            }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          >
            <span className="text-5xl sm:text-6xl">{copy.cherry.emoji}</span>
          </motion.div>
          <div className="mt-5 text-[3rem] font-extrabold tracking-[-0.03em] text-white sm:text-[3.4rem]">
            {copy.cherry.title}
          </div>
          <div className="mt-1 text-xs font-medium tracking-wide text-white/80" dir="rtl">
            {copy.cherry.subtitle}
          </div>
        </motion.div>
      </motion.section>

      {/* אלכסון חד ונקי */}
      <svg
        className="pointer-events-none absolute inset-0 z-[6] h-full w-full"
        aria-hidden
      >
        <line
          x1={`${splitX}%`}
          y1="0"
          x2="0"
          y2="100%"
          stroke="#ffffff"
          strokeOpacity="0.14"
          strokeWidth={2}
          shapeRendering="crispEdges"
        />
      </svg>

      <AnimatePresence>
        {selected && (
          <motion.div
            className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[50] flex justify-center px-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.18 }}
          >
            <motion.button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                confirm();
              }}
              whileTap={{ scale: 0.98 }}
              className="w-full max-w-md rounded-full bg-white px-6 py-4 text-center text-base font-extrabold text-black shadow-[0_14px_35px_rgba(0,0,0,0.32)] backdrop-blur-sm transition hover:bg-white/95"
            >
              {selected === "cherry" ? copy.cherry.cta : copy.blueberry.cta}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
