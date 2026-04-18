"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CherryMark } from "@/components/CherryMark";
import { BlueberryMark } from "@/components/BlueberryMark";
import {
  PickThemeFigureMan,
  PickThemeFigureWoman,
} from "@/components/PickThemeFigures";
import {
  hasChosenAppVariant,
  setAppVariant,
  type AppVariant,
} from "@/lib/appVariant";

/**
 * מסך בחירה ראשוני — אלכסון: שמאל BLUE (גברים), ימין צ'רי (נשים).
 * חשוב: מסך ב־dir=ltr כדי ש־justify-start/end יתיישרו פיזית (אחרת RTL על ההורה הופך פינות).
 */
export function PickThemeClient() {
  const router = useRouter();

  useEffect(() => {
    if (hasChosenAppVariant()) {
      router.replace("/");
    }
  }, [router]);

  function choose(v: AppVariant) {
    setAppVariant(v);
    router.replace("/welcome");
  }

  return (
    <div
      className="relative isolate min-h-dvh w-full overflow-hidden bg-[#0f172a]"
      dir="ltr"
    >
      <div
        dir="rtl"
        className="pointer-events-none absolute start-0 end-0 top-[max(0.5rem,env(safe-area-inset-top))] z-30 flex justify-center px-3"
      >
        <p className="max-w-[min(92vw,24rem)] rounded-2xl bg-[#0c1222]/92 px-5 py-2.5 text-center text-[1.05rem] font-extrabold leading-snug text-amber-50 shadow-[0_6px_24px_rgba(0,0,0,0.45)] ring-2 ring-amber-200/35 backdrop-blur-[6px] sm:px-6 sm:py-3 sm:text-xl md:text-2xl">
          בחרו מסלול
        </p>
      </div>

      {/* שמאל — BLUE (משולש עליון־שמאלי): רקע בהיר, כותרות כחול עמוק, אייקונים פלדה */}
      <button
        type="button"
        dir="ltr"
        className="absolute inset-0 z-[1] flex cursor-pointer items-start justify-start border-0 bg-gradient-to-br from-[#f4f7fd] via-[#e2ecfc] to-[#93c5fd] p-5 pt-[max(3.25rem,env(safe-area-inset-top))] transition hover:brightness-[1.03] active:brightness-[0.98] sm:p-7 sm:pt-[max(3.5rem,env(safe-area-inset-top))]"
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        aria-label="BLUE — מסלול לגברים, אינטליגנציה קלורית"
        onClick={() => choose("blueberry")}
      >
        <div className="pointer-events-none flex max-w-[min(92vw,20rem)] flex-row items-center gap-3 self-start sm:gap-4">
          <PickThemeFigureMan className="h-[4.5rem] w-[2.65rem] shrink-0 text-[#4a5568] opacity-95 drop-shadow-[0_2px_12px_rgba(71,85,105,0.2)] sm:h-[5.25rem] sm:w-[3rem]" />
          <div
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
            dir="rtl"
          >
            <BlueberryMark
              tone="steel"
              className="h-[4.5rem] w-[5.25rem] drop-shadow-[0_4px_16px_rgba(71,85,105,0.22)] sm:h-24 sm:w-28"
            />
            <span className="font-[system-ui] text-3xl font-black tracking-tight text-[#071426] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)] sm:text-4xl">
              BLUE
            </span>
            <span className="text-xs font-bold text-[#1e3a5f] sm:text-sm">
              בלו
            </span>
            <span className="max-w-[12rem] text-[11px] font-semibold leading-snug text-[#475569] sm:text-xs">
              אינטליגנציה קלורית
            </span>
            <span className="mt-0.5 rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-[#0f172a] shadow-[0_2px_8px_rgba(30,58,95,0.12)] ring-1 ring-[#94a3b8]/55 backdrop-blur-[2px] sm:text-sm">
              לגברים
            </span>
          </div>
        </div>
      </button>

      {/* ימין — צ'רי (משולש תחתון־ימני) */}
      <button
        type="button"
        dir="ltr"
        className="absolute inset-0 z-[1] flex cursor-pointer items-end justify-end border-0 bg-gradient-to-tl from-[#881337] via-[#f43f5e] to-[#fecdd3] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition hover:brightness-[1.05] active:brightness-[0.97] sm:p-7"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
        aria-label="צ'רי Cherry — מסלול לנשים, אינטליגנציה קלורית"
        onClick={() => choose("cherry")}
      >
        <div className="pointer-events-none flex max-w-[min(92vw,20rem)] flex-row items-center gap-3 self-end sm:gap-4">
          <div
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
            dir="rtl"
          >
            <CherryMark className="h-[4.5rem] w-[5.25rem] drop-shadow-[0_4px_12px_rgba(127,29,29,0.35)] sm:h-24 sm:w-28" />
            <span className="font-[system-ui] text-3xl font-black tracking-tight text-white drop-shadow-sm sm:text-4xl">
              צ&apos;רי
            </span>
            <span className="text-xs font-semibold text-[#fff1f2] sm:text-sm">
              Cherry
            </span>
            <span className="max-w-[12rem] text-[11px] font-semibold leading-snug text-[#ffe4e6] sm:text-xs">
              אינטליגנציה קלורית
            </span>
            <span className="mt-0.5 rounded-full bg-[#881337]/45 px-3 py-1 text-xs font-bold text-white ring-1 ring-[#fda4af]/90 sm:text-sm">
              לנשים
            </span>
          </div>
          <PickThemeFigureWoman className="h-[4.5rem] w-[2.65rem] shrink-0 text-[#fff5f5] opacity-95 drop-shadow-[0_2px_10px_rgba(127,29,29,0.4)] sm:h-[5.25rem] sm:w-[3rem]" />
        </div>
      </button>

      {/* קו אלכסון — תואם בדיוק ל־clip-path (מימין למעלה לשמאל למטה) */}
      <svg
        className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
        aria-hidden
      >
        <line
          x1="100%"
          y1="0"
          x2="0"
          y2="100%"
          stroke="#475569"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
