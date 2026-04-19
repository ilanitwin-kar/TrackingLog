"use client";

import { useRouter } from "next/navigation";
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

  function choose(v: AppVariant) {
    setAppVariant(v);
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

      {/* שמאל — גברים (כחול אוכמנייה עמוק); z גבוה יותר כדי שלא ייחתך על ידי שכבת הדובדבן ליד האלכסון */}
      <section
        className="absolute inset-0 z-[2] overflow-hidden"
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)", background: "#001F3F" }}
        aria-label="BLUE — מסלול לגברים"
      >
        {/* ממורכז עמוק במשולש השמאלי — שמאלה מהאלכסון כדי שלא ייחתך הכיתוב */}
        <div className="absolute left-[26%] top-[28%] -translate-x-1/2 -translate-y-1/2 px-4 pt-[max(3.5rem,env(safe-area-inset-top))] sm:left-[28%] sm:px-6">
          <div className="flex w-full max-w-[min(20rem,78vw)] flex-col items-center text-center sm:max-w-[22rem]">
            <SelectPathManVector className="h-[15.5rem] w-[15.5rem] drop-shadow-[0_22px_70px_rgba(0,0,0,0.55)] sm:h-[18rem] sm:w-[18rem]" />
            <div className="mt-4 flex items-center justify-center gap-3">
              <BlueberryMark
                tone="brand"
                className="h-9 w-10 drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)] sm:h-10 sm:w-11"
              />
              <div className="text-[2.35rem] font-semibold tracking-[-0.02em] text-white sm:text-[2.65rem]">
                BLUE
              </div>
            </div>
            <button
              type="button"
              onClick={() => choose("blueberry")}
              className="mt-4 inline-flex items-center justify-center rounded-2xl bg-[#1b4f7a] px-8 py-3 text-base font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)] transition hover:brightness-110 active:scale-[0.99]"
            >
              לגברים
            </button>
          </div>
        </div>
      </section>

      {/* ימין — נשים (דובדבן עמוק) */}
      <section
        className="absolute inset-0 z-[1] overflow-hidden"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)", background: "#C2185B" }}
        aria-label="Cherry — מסלול לנשים"
      >
        <div className="absolute left-[67%] top-[67%] -translate-x-1/2 -translate-y-1/2 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex w-full max-w-[22rem] flex-col items-center text-center">
            <SelectPathWomanVector className="h-[15.5rem] w-[15.5rem] drop-shadow-[0_22px_70px_rgba(0,0,0,0.45)] sm:h-[18rem] sm:w-[18rem]" />
            <div className="mt-4 flex items-center justify-center gap-3">
              <CherryMark className="h-9 w-10 drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)] sm:h-10 sm:w-11" />
              <div className="text-[2.35rem] font-semibold tracking-[-0.02em] text-white sm:text-[2.65rem]">
                CHERRY
              </div>
            </div>
            <button
              type="button"
              onClick={() => choose("cherry")}
              className="mt-4 inline-flex items-center justify-center rounded-2xl bg-[#ff5fa2] px-8 py-3 text-base font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.3)] transition hover:brightness-105 active:scale-[0.99]"
            >
              לנשים
            </button>
          </div>
        </div>
      </section>

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
