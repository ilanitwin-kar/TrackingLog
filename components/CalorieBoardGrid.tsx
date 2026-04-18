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

/** משבצת פתוחה — ירוק גבעול תלת־ממדי */
const stem3d =
  "border-[color-mix(in_srgb,var(--stem)_42%,#9ca3af_58%)] bg-gradient-to-b from-[#e8f5e9] via-[#c8e6c9] to-[#7cb342] shadow-[inset_0_3px_6px_rgba(255,255,255,0.88),inset_0_-3px_8px_rgba(0,0,0,0.12),0_5px_0_rgba(61,107,40,0.42),0_8px_16px_rgba(74,124,35,0.22)]";
/** לחיצה / נפתח — דובדבן */
const cherry3d =
  "border-[color-mix(in_srgb,var(--cherry)_55%,#c91835_45%)] bg-gradient-to-b from-[#ffd6dc] via-[#f08090] to-[#9b1b30] shadow-[inset_0_3px_6px_rgba(255,255,255,0.75),inset_0_-3px_8px_rgba(0,0,0,0.14),0_5px_0_rgba(120,20,40,0.4),0_8px_18px_rgba(155,27,48,0.28)]";
const futureGrey3d =
  "border-[#9ca3af] bg-gradient-to-b from-[#eceef2] to-[#bfc2c9] shadow-[inset_0_3px_6px_rgba(255,255,255,0.85),inset_0_-3px_8px_rgba(0,0,0,0.14),0_5px_0_rgba(0,0,0,0.18),0_8px_16px_rgba(0,0,0,0.1)] cursor-not-allowed opacity-[0.93] saturate-[0.95]";

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
        className={`py-10 text-center text-base font-semibold text-[var(--cherry)]/75 ${fontBoard}`}
        aria-busy
      >
        טוען מפת דרך…
      </section>
    );
  }

  if (board === null) {
    return (
      <section
        className={`rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-8 text-center shadow-[0_6px_24px_rgba(250,218,221,0.35)] ${fontBoard}`}
      >
        <p className="text-base font-bold text-[var(--cherry)]">
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
        className="overflow-visible rounded-2xl border border-[var(--border-cherry-soft)] bg-gradient-to-b from-[#fffafd] to-[#f6faf3] p-2 sm:p-3"
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
                <span
                  className={`text-[9px] font-semibold tabular-nums leading-none sm:text-[10px] ${
                    isGold
                      ? "text-[#3d0a12]/95"
                      : "text-[#1b3d0f]/95"
                  }`}
                >
                  {actualDeficitKcal > 0 ? "+" : ""}
                  {Math.round(actualDeficitKcal)} קק״ל
                </span>
              ) : showReveal ? (
                <span
                  className={`text-[9px] font-medium tabular-nums sm:text-[10px] ${
                    isGold ? "text-[#4a0a14]/80" : "text-[#2d5016]/80"
                  }`}
                >
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
                className="line-clamp-4 w-full max-h-full overflow-hidden text-center text-[10px] font-bold leading-snug text-[#1a2e0f] sm:text-[11px]"
              >
                {milestoneMsg ?? JOURNEY_LOCKED_PLACEHOLDER}
              </span>
            );

            const futureLockedMuted = (
              <span
                dir="rtl"
                className="line-clamp-4 w-full max-h-full overflow-hidden text-center text-[10px] font-bold leading-snug text-[#374151] sm:text-[11px]"
              >
                {milestoneMsg ?? JOURNEY_LOCKED_PLACEHOLDER}
              </span>
            );

            const centerBlock = (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5">
                {showReveal ? (
                  <span
                    dir="rtl"
                    className={`line-clamp-3 w-full max-h-full overflow-hidden text-center text-[clamp(0.95rem,2.8vw,1.35rem)] font-black leading-tight tracking-tight sm:text-[clamp(1.05rem,3vw,1.5rem)] sm:leading-tight ${
                      isGold ? "text-[#1f060c]" : "text-[#14280a]"
                    }`}
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
                    {futureLockedMuted}
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
                className={`relative flex ${cellFixed} flex-col items-stretch justify-between gap-0.5 rounded-2xl border-2 px-1.5 py-1.5 text-center transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cherry)] focus-visible:ring-offset-2 active:shadow-[inset_0_4px_10px_rgba(0,0,0,0.15)] ${fontBoard} ${
                  isGold ? cherry3d : stem3d
                } `}
                onClick={() => {
                  if (isLastSquare && isGold) {
                    setCelebrationOpen(true);
                    return;
                  }
                  setGoldMap(toggleStoryRevealUnlock(i));
                }}
              >
                <span
                  className={`shrink-0 truncate text-xs font-bold tracking-tight sm:text-sm ${
                    isGold ? "text-[#3d0a12]" : "text-[#1a3d0f]"
                  }`}
                >
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
