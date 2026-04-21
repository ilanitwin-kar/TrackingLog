"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  setAppVariant,
  type AppVariant,
} from "@/lib/appVariant";
import { BlueberryMark } from "@/components/BlueberryMark";
import { CherryMark } from "@/components/CherryMark";

/**
 * מסך בחירה ראשוני — 2 כרטיסים גדולים (פרימיום).
 */
export function PickThemeClient() {
  const router = useRouter();

  const copy = useMemo(() => {
    return {
      cherry: {
        title: "CHERRY",
        subtitle: "המסלול הנשי",
        tagline: "המסלול לגוף החלומות שלך",
        cta: "בואי נתחיל",
        bgFrom: "#7A0A2A",
        bgTo: "#C2185B",
      },
      blueberry: {
        title: "BLUE",
        subtitle: "המסלול הגברי",
        tagline: "המסלול לגוף החלומות שלך",
        cta: "בוא נתחיל",
        bgFrom: "#04152E",
        bgTo: "#003B7A",
      },
    } as const;
  }, []);

  function go(v: AppVariant) {
    setAppVariant(v);
    router.replace("/welcome");
  }

  return (
    <div className="min-h-dvh w-full bg-[radial-gradient(1200px_800px_at_50%_-20%,rgba(255,255,255,0.10),transparent_60%),linear-gradient(180deg,#060611,rgba(6,6,17,0.75))] px-4 py-10" dir="rtl">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
        <h1 className="text-center text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          בחירת מסלול
        </h1>

        <div className="mt-6 grid w-full grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {/* נשים */}
          <motion.button
            type="button"
            onClick={() => go("cherry")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            className="group relative w-full overflow-hidden rounded-[20px] p-[2px] text-start shadow-[0_18px_55px_rgba(0,0,0,0.35)]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
            }}
            aria-label="בחירה במסלול הנשי"
          >
            <div
              className="relative flex min-h-[18rem] w-full flex-col items-center justify-center gap-3 rounded-[18px] px-6 py-10 text-center text-white"
              style={{
                background: `linear-gradient(160deg, ${copy.cherry.bgFrom}, ${copy.cherry.bgTo})`,
              }}
            >
              <div className="absolute inset-0 opacity-20">
                <div className="absolute -top-20 -start-24 h-60 w-60 rounded-full bg-white/25 blur-3xl" />
                <div className="absolute -bottom-24 -end-24 h-60 w-60 rounded-full bg-black/35 blur-3xl" />
              </div>
              <div className="relative">
                <CherryMark className="mx-auto h-28 w-28 text-white/95 drop-shadow-[0_14px_40px_rgba(0,0,0,0.35)]" />
              </div>
              <div className="relative text-3xl font-extrabold tracking-tight">
                {copy.cherry.title}
              </div>
              <div className="relative text-sm font-bold text-white/85">
                {copy.cherry.subtitle}
              </div>
              <div className="relative text-sm font-semibold text-white/80">
                {copy.cherry.tagline}
              </div>
              <div className="relative mt-2 inline-flex items-center justify-center rounded-full bg-white/15 px-5 py-2 text-sm font-extrabold text-white backdrop-blur-sm transition group-hover:bg-white/20">
                {copy.cherry.cta}
              </div>
            </div>
          </motion.button>

          {/* גברים */}
          <motion.button
            type="button"
            onClick={() => go("blueberry")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            className="group relative w-full overflow-hidden rounded-[20px] p-[2px] text-start shadow-[0_18px_55px_rgba(0,0,0,0.35)]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
            }}
            aria-label="בחירה במסלול הגברי"
          >
            <div
              className="relative flex min-h-[18rem] w-full flex-col items-center justify-center gap-3 rounded-[18px] px-6 py-10 text-center text-white"
              style={{
                background: `linear-gradient(160deg, ${copy.blueberry.bgFrom}, ${copy.blueberry.bgTo})`,
              }}
            >
              <div className="absolute inset-0 opacity-20">
                <div className="absolute -top-20 -start-24 h-60 w-60 rounded-full bg-white/20 blur-3xl" />
                <div className="absolute -bottom-24 -end-24 h-60 w-60 rounded-full bg-black/35 blur-3xl" />
              </div>
              <div className="relative">
                <BlueberryMark className="mx-auto h-28 w-28 text-white/95 drop-shadow-[0_14px_40px_rgba(0,0,0,0.35)]" />
              </div>
              <div className="relative text-3xl font-extrabold tracking-tight">
                {copy.blueberry.title}
              </div>
              <div className="relative text-sm font-bold text-white/85">
                {copy.blueberry.subtitle}
              </div>
              <div className="relative text-sm font-semibold text-white/80">
                {copy.blueberry.tagline}
              </div>
              <div className="relative mt-2 inline-flex items-center justify-center rounded-full bg-white/15 px-5 py-2 text-sm font-extrabold text-white backdrop-blur-sm transition group-hover:bg-white/20">
                {copy.blueberry.cta}
              </div>
            </div>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
