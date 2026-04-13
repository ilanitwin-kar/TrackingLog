"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getCalorieBoardDateSequence, getTodayKey } from "@/lib/dateKey";
import {
  JOURNEY_FINAL_GOLD_MESSAGE,
  JOURNEY_LOCKED_PLACEHOLDER,
  getJourneyMilestoneMessage,
} from "@/lib/journeyMilestones";
import { getStoryDisplayForSquare } from "@/lib/storyReveal";
import {
  getDaysRemainingToGoal,
  getTdeeKcalRoundedFromProfile,
} from "@/lib/goalMetrics";
import type { Gender } from "@/lib/tdee";
import {
  getEntriesForDate,
  loadProfile,
  loadStoryRevealUnlock,
  toggleStoryRevealUnlock,
} from "@/lib/storage";
import { CelebrationFireworks } from "@/components/CelebrationFireworks";
const fontBoard =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

const grey3d =
  "border-[#9ca3af] bg-gradient-to-b from-[#eceef2] to-[#bfc2c9] shadow-[inset_0_3px_6px_rgba(255,255,255,0.85),inset_0_-3px_8px_rgba(0,0,0,0.14),0_5px_0_rgba(0,0,0,0.18),0_8px_16px_rgba(0,0,0,0.1)]";
const gold3d =
  "border-amber-500/90 bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-500 shadow-[0_0_22px_rgba(234,179,8,0.9),inset_0_3px_8px_rgba(255,255,255,0.5),0_5px_0_rgba(161,98,7,0.45)]";
const futureGrey3d = `${grey3d} cursor-not-allowed opacity-[0.93] saturate-[0.95]`;

function formatDayMonth(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

type GridModel = {
  /** תואם ל־getDaysRemainingToGoal (לוגיקת TDEE / יעד) */
  daysRemaining: number;
  dateKeys: string[];
  tdeeKcal: number;
  today: string;
  firstName: string;
  gender: Gender;
};

function buildGridModel(): GridModel | null {
  const daysRemaining = getDaysRemainingToGoal();
  if (daysRemaining == null || daysRemaining < 1) {
    return null;
  }
  const dateKeys = getCalorieBoardDateSequence(daysRemaining);
  if (dateKeys.length !== daysRemaining) {
    return null;
  }
  const p = loadProfile();
  const tdeeKcal = getTdeeKcalRoundedFromProfile(p);
  return {
    daysRemaining,
    dateKeys,
    tdeeKcal,
    today: getTodayKey(),
    firstName: typeof p.firstName === "string" ? p.firstName.trim() : "",
    gender: p.gender === "male" ? "male" : "female",
  };
}

export function CalorieBoardGrid({ profileRev = 0 }: { profileRev?: number }) {
  const [goldMap, setGoldMap] = useState<Record<string, boolean>>({});
  const [board, setBoard] = useState<GridModel | null | undefined>(undefined);
  const [celebrationOpen, setCelebrationOpen] = useState(false);

  useEffect(() => {
    setBoard(buildGridModel());
  }, [profileRev]);

  useEffect(() => {
    const sync = () => setBoard(buildGridModel());
    window.addEventListener("cj-profile-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("cj-profile-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    setGoldMap(loadStoryRevealUnlock());
  }, [profileRev, board?.daysRemaining]);

  if (board === undefined) {
    return (
      <section
        className={`py-10 text-center text-base font-semibold text-[#333333]/75 ${fontBoard}`}
        aria-busy
      >
        טוען מפת דרך…
      </section>
    );
  }

  if (board === null) {
    return (
      <section
        className={`rounded-2xl border-2 border-[#FADADD] bg-white/90 px-4 py-8 text-center shadow-[0_6px_24px_rgba(250,218,221,0.35)] ${fontBoard}`}
      >
        <p className="text-base font-bold text-[#333333]">
          אין עדיין מפת דרך להצגה
        </p>
      </section>
    );
  }

  const { dateKeys, daysRemaining, tdeeKcal, today, firstName, gender } =
    board;

  /** כל המשבצות — אותו גודל (ריבוע), תוכן בתוך המסגרת בלי הרחבה */
  const cellFixed =
    "aspect-square w-full min-h-0 min-w-0 max-w-full shrink-0 overflow-hidden";

  return (
    <section className={`space-y-4 overflow-visible ${fontBoard}`}>
      <div
        className="overflow-visible rounded-2xl border border-[#FADADD]/90 bg-gradient-to-b from-[#fffafd] to-[#faf8f9] p-2 sm:p-3"
        dir="rtl"
      >
        <div
          className="grid grid-cols-4 gap-2.5 overflow-visible sm:gap-3"
          role="list"
          aria-label={`מפת התקדמות, ${daysRemaining} משבצות`}
        >
          {dateKeys.map((dateKey, i) => {
            const isFuture = dateKey > today;
            const entries = isFuture ? [] : getEntriesForDate(dateKey);
            const hasData = entries.length > 0;
            const consumed = entries.reduce((s, e) => s + e.calories, 0);
            /** גירעון בפועל ליום: TDEE − צריכה (רק כשיש רישום לאותו תאריך) */
            const actualDeficitKcal = hasData ? tdeeKcal - consumed : null;

            const isGold = goldMap[String(i)] === true;
            const isLastSquare = i === dateKeys.length - 1;
            const storyText = getStoryDisplayForSquare(i, firstName, gender);
            const showReveal = !isFuture && isGold;
            const milestoneMsg = getJourneyMilestoneMessage(
              daysRemaining,
              i
            );

            const deficitGoldOnly =
              showReveal && hasData && actualDeficitKcal !== null ? (
                <span className="text-[9px] font-semibold tabular-nums leading-none text-[#78350f]/90 sm:text-[10px]">
                  {actualDeficitKcal > 0 ? "+" : ""}
                  {Math.round(actualDeficitKcal)} קק״ל
                </span>
              ) : showReveal ? (
                <span className="text-[9px] font-medium tabular-nums text-[#92400e]/75 sm:text-[10px]">
                  —
                </span>
              ) : null;

            const goldMainText =
              isLastSquare && showReveal
                ? JOURNEY_FINAL_GOLD_MESSAGE
                : storyText;

            const lockedMuted = (
              <span
                dir="rtl"
                className="line-clamp-4 w-full max-h-full overflow-hidden text-center text-[10px] font-bold leading-snug text-black sm:text-[11px]"
              >
                {milestoneMsg ?? JOURNEY_LOCKED_PLACEHOLDER}
              </span>
            );

            const centerBlock = (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5">
                {showReveal ? (
                  <span
                    dir="rtl"
                    className="line-clamp-3 w-full max-h-full overflow-hidden text-center text-[clamp(0.95rem,2.8vw,1.35rem)] font-black leading-tight tracking-tight text-[#1a1200] sm:text-[clamp(1.05rem,3vw,1.5rem)] sm:leading-tight"
                  >
                    {goldMainText}
                  </span>
                ) : (
                  lockedMuted
                )}
              </div>
            );

            if (isFuture) {
              return (
                <div
                  key={`${dateKey}-${i}`}
                  role="listitem"
                  aria-disabled
                  tabIndex={-1}
                  className={`relative flex ${cellFixed} flex-col items-stretch justify-between gap-0.5 rounded-2xl border-2 px-1.5 py-1.5 text-center ${fontBoard} ${futureGrey3d}`}
                >
                  <span className="shrink-0 truncate text-xs font-bold tracking-tight text-[#374151] sm:text-sm">
                    {formatDayMonth(dateKey)}
                  </span>
                  <div className="min-h-[12px] shrink-0" aria-hidden />
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5">
                    {lockedMuted}
                  </div>
                </div>
              );
            }

            return (
              <motion.button
                key={`${dateKey}-${i}`}
                type="button"
                role="listitem"
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
                aria-pressed={isGold}
                aria-label={`${formatDayMonth(dateKey)}${
                  showReveal && hasData
                    ? `, גירעון ${Math.round(actualDeficitKcal!)} קק״ל`
                    : ""
                }${isLastSquare && isGold ? ", חגיגת סיום" : ""}`}
                className={`relative flex ${cellFixed} flex-col items-stretch justify-between gap-0.5 rounded-2xl border-2 px-1.5 py-1.5 text-center transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:shadow-[inset_0_4px_10px_rgba(0,0,0,0.15)] ${fontBoard} ${
                  isGold ? gold3d : grey3d
                } `}
                onClick={() => {
                  if (isLastSquare && isGold) {
                    setCelebrationOpen(true);
                    return;
                  }
                  setGoldMap(toggleStoryRevealUnlock(i));
                }}
              >
                <span className="shrink-0 truncate text-xs font-bold tracking-tight text-[#1f2937] sm:text-sm">
                  {formatDayMonth(dateKey)}
                </span>
                {deficitGoldOnly != null ? (
                  <div className="shrink-0">{deficitGoldOnly}</div>
                ) : (
                  <div className="min-h-[12px] shrink-0" aria-hidden />
                )}
                {centerBlock}
              </motion.button>
            );
          })}
        </div>
      </div>

      <CelebrationFireworks
        open={celebrationOpen}
        onClose={() => setCelebrationOpen(false)}
        gender={gender}
      />
    </section>
  );
}
