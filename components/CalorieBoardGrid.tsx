"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SAFE_DEFICIT_CAP_KCAL } from "@/lib/calorieAccumulation";
import { getDateKeysFromStartToToday, getTodayKey } from "@/lib/dateKey";
import {
  JOURNEY_FINAL_GOLD_MESSAGE,
  JOURNEY_TAP_REVEAL_HEADING,
  getJourneyMilestoneMessage,
  getDaysLeftAtSquare,
} from "@/lib/journeyMilestones";
import { getStoryDisplayForSquare } from "@/lib/storyReveal";
import { getTdeeKcalRoundedFromProfile } from "@/lib/goalMetrics";
import type { Gender } from "@/lib/tdee";
import {
  getEntriesForDate,
  loadDayJournalClosedMap,
  ensureJourneyStartDateKey,
  loadProfile,
  loadStoryRevealUnlock,
  toggleStoryRevealUnlock,
} from "@/lib/storage";
import { CelebrationFireworks } from "@/components/CelebrationFireworks";
import { useAppVariant } from "@/components/useAppVariant";
import { uiCloseJournalToUnlockCube } from "@/lib/hebrewGenderUi";

const fontBoard =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

const stem3d =
  "border-[color-mix(in_srgb,var(--stem)_42%,#9ca3af_58%)] bg-gradient-to-b from-[#e8f5e9] via-[#c8e6c9] to-[#7cb342] shadow-[inset_0_3px_6px_rgba(255,255,255,0.88),inset_0_-3px_8px_rgba(0,0,0,0.12),0_5px_0_rgba(61,107,40,0.42),0_8px_16px_rgba(74,124,35,0.22)]";
const cherry3d =
  "border-[color-mix(in_srgb,var(--cherry)_55%,#c91835_45%)] bg-gradient-to-b from-[#ffd6dc] via-[#f08090] to-[#9b1b30] shadow-[inset_0_3px_6px_rgba(255,255,255,0.75),inset_0_-3px_8px_rgba(0,0,0,0.14),0_5px_0_rgba(120,20,40,0.4),0_8px_18px_rgba(155,27,48,0.28)]";
const berry3d =
  "border-[color-mix(in_srgb,var(--cherry)_55%,#1d4ed8_45%)] bg-gradient-to-b from-[#bfdbfe] via-[#3b82f6] to-[#1e3a5f] shadow-[inset_0_3px_6px_rgba(255,255,255,0.78),inset_0_-3px_8px_rgba(0,0,0,0.16),0_5px_0_rgba(15,40,80,0.45),0_8px_18px_rgba(30,58,95,0.32)]";
const futureGrey3d =
  "border-[#9ca3af] bg-gradient-to-b from-[#eceef2] to-[#bfc2c9] shadow-[inset_0_3px_6px_rgba(255,255,255,0.85),inset_0_-3px_8px_rgba(0,0,0,0.14),0_5px_0_rgba(0,0,0,0.18),0_8px_16px_rgba(0,0,0,0.1)] cursor-not-allowed opacity-[0.93] saturate-[0.95]";

function closedDayHint(gender: Gender): string {
  return uiCloseJournalToUnlockCube(gender);
}

const UNSAFE_DEFICIT_MSG =
  "אכלת פחות מדי מהדרוש להגעה בטוחה ליעד";

function formatDayMonth(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

type GridModel = {
  dateKeys: string[];
  tdeeKcal: number;
  today: string;
  firstName: string;
  gender: Gender;
};

function buildGridModel(): GridModel | null {
  const p = loadProfile();
  const tdeeKcal = getTdeeKcalRoundedFromProfile(p);
  const startKey = ensureJourneyStartDateKey();
  const dateKeys = getDateKeysFromStartToToday(startKey);
  return {
    dateKeys,
    tdeeKcal,
    today: getTodayKey(),
    firstName: typeof p.firstName === "string" ? p.firstName.trim() : "",
    gender: p.gender === "male" ? "male" : "female",
  };
}

/** קובייה גבוהה יותר מריבוע — קריאות טובה יותר */
const cellShell =
  "relative flex w-full min-h-[6.85rem] min-w-0 max-w-full shrink-0 flex-col justify-between gap-1 overflow-hidden rounded-2xl border-2 px-2 py-2 text-center sm:min-h-[7.75rem] sm:px-2.5 sm:py-2.5";

export function CalorieBoardGrid({ profileRev = 0 }: { profileRev?: number }) {
  const appVariant = useAppVariant();
  const [goldMap, setGoldMap] = useState<Record<string, boolean>>({});
  const [board, setBoard] = useState<GridModel | null | undefined>(undefined);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [closedMap, setClosedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setBoard(buildGridModel());
    setClosedMap(loadDayJournalClosedMap());
  }, [profileRev]);

  useEffect(() => {
    const syncBoard = () => setBoard(buildGridModel());
    const syncClosed = () => setClosedMap(loadDayJournalClosedMap());
    const sync = () => {
      syncBoard();
      syncClosed();
    };
    window.addEventListener("cj-profile-updated", sync);
    window.addEventListener("cj-journal-closed-changed", syncClosed);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("cj-profile-updated", sync);
      window.removeEventListener("cj-journal-closed-changed", syncClosed);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    setGoldMap(loadStoryRevealUnlock());
  }, [profileRev, board?.dateKeys.length]);

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

  const { dateKeys, tdeeKcal, today, firstName, gender } = board;

  return (
    <section className={`space-y-4 overflow-visible ${fontBoard}`}>
      <div
        className="overflow-visible rounded-2xl border border-[var(--border-cherry-soft)] bg-gradient-to-b from-[#fffafd] to-[#f6faf3] p-2.5 sm:p-3.5"
        dir="rtl"
      >
        <h2 className="mb-3 border-b border-[var(--border-cherry-soft)]/50 px-1 pb-3 text-center text-[0.95rem] font-black leading-snug tracking-tight text-[var(--cherry)] sm:text-lg sm:pb-3.5 md:text-xl">
          {JOURNEY_TAP_REVEAL_HEADING}
        </h2>
        <div
          className="grid grid-cols-3 gap-2.5 overflow-visible sm:grid-cols-4 sm:gap-3"
          role="list"
          aria-label={`מפת התקדמות, ${dateKeys.length} משבצות`}
        >
          {dateKeys.map((dateKey, i) => {
            const isFuture = dateKey > today;
            const isClosed = closedMap[dateKey] === true;
            const entries = isFuture ? [] : getEntriesForDate(dateKey);
            const consumed = entries.reduce((s, e) => s + e.calories, 0);
            const deficit = tdeeKcal - consumed;

            const isGold = goldMap[String(i)] === true;
            const isLastSquare = i === dateKeys.length - 1;
            const storyText = getStoryDisplayForSquare(i, firstName, gender);
            const showStoryReveal = !isFuture && isClosed && isGold;
            const milestoneMsg = getJourneyMilestoneMessage(dateKeys.length, i);
            const daysLeftFromEnd = getDaysLeftAtSquare(dateKeys.length, i);

            const deficitRow =
              isFuture || !isClosed ? null : deficit > SAFE_DEFICIT_CAP_KCAL ? (
                <span
                  className="line-clamp-3 text-[10px] font-bold leading-tight text-[#7f1d1d] sm:text-[11px]"
                >
                  {UNSAFE_DEFICIT_MSG}
                </span>
              ) : deficit >= 0 && deficit <= SAFE_DEFICIT_CAP_KCAL ? (
                <span
                  className={`text-[clamp(0.8rem,2.6vw,1.05rem)] font-extrabold tabular-nums leading-tight sm:text-[clamp(0.95rem,2.8vw,1.15rem)] ${
                    isGold
                      ? appVariant === "blueberry"
                        ? "text-[#0c1a2e]"
                        : "text-[#3d0a12]"
                      : "text-[#1a3d0f]"
                  }`}
                >
                  {deficit > 0 ? "+" : ""}
                  {Math.round(deficit)} קק״ל
                </span>
              ) : (
                <span
                  className="text-[10px] font-bold tabular-nums leading-tight text-[#6b2f12] sm:text-[11px]"
                >
                  מעל התקציב ב־{Math.round(Math.abs(deficit))} קק״ל
                </span>
              );

            const goldMainText =
              isLastSquare && showStoryReveal
                ? JOURNEY_FINAL_GOLD_MESSAGE
                : storyText;

            const centerMuted =
              milestoneMsg != null ? (
                <span
                  dir="rtl"
                  className="line-clamp-4 w-full max-h-full overflow-hidden text-center text-[12px] font-extrabold leading-snug text-[#1a2e0f] sm:text-sm"
                >
                  {milestoneMsg}
                </span>
              ) : null;

            const futureLockedMuted =
              milestoneMsg != null ? (
                <span
                  dir="rtl"
                  className="line-clamp-4 w-full max-h-full overflow-hidden text-center text-[12px] font-extrabold leading-snug text-[#374151] sm:text-sm"
                >
                  {milestoneMsg}
                </span>
              ) : null;

            const centerBlock = (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5">
                {isFuture ? (
                  futureLockedMuted
                ) : !isClosed ? (
                  <span
                    dir="rtl"
                    className="line-clamp-4 w-full text-center text-[11px] font-bold leading-snug text-[#1a3d0f] sm:text-xs"
                  >
                    {closedDayHint(gender)}
                  </span>
                ) : showStoryReveal ? (
                  <span
                    dir="rtl"
                    className={`line-clamp-3 w-full max-h-full overflow-hidden text-center text-[clamp(0.95rem,2.8vw,1.35rem)] font-black leading-tight tracking-tight sm:text-[clamp(1.05rem,3vw,1.5rem)] sm:leading-tight ${
                      isGold
                        ? appVariant === "blueberry"
                          ? "text-[#0a1628]"
                          : "text-[#1f060c]"
                        : "text-[#14280a]"
                    }`}
                  >
                    {goldMainText}
                  </span>
                ) : (
                  centerMuted
                )}
              </div>
            );

            const dateStyle = isFuture
              ? "text-[#374151]"
              : isGold
                ? appVariant === "blueberry"
                  ? "text-[#0c1a2e]"
                  : "text-[#3d0a12]"
                : "text-[#1a3d0f]";

            const innerTop = (
              <>
                <span
                  className={`shrink-0 truncate text-sm font-extrabold tracking-tight sm:text-base ${dateStyle}`}
                >
                  {formatDayMonth(dateKey)}
                </span>
                <span className="shrink-0 text-[11px] font-bold leading-none text-[var(--stem)]/90 sm:text-xs">
                  {daysLeftFromEnd} ימים ליעד
                </span>
                <div className="min-h-[2.5rem] shrink-0 px-0.5 sm:min-h-[2.75rem]">
                  {deficitRow}
                </div>
              </>
            );

            if (isFuture) {
              return (
                <div
                  key={`${dateKey}-${i}`}
                  role="listitem"
                  aria-disabled
                  tabIndex={-1}
                  className={`${cellShell} ${fontBoard} ${futureGrey3d}`}
                >
                  {innerTop}
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5">
                    {futureLockedMuted}
                  </div>
                </div>
              );
            }

            const palette3d = isGold
              ? appVariant === "blueberry"
                ? berry3d
                : cherry3d
              : stem3d;

            const interactive = isClosed;
            const commonClass = `${cellShell} ${fontBoard} ${palette3d} ${
              interactive
                ? "cursor-pointer transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cherry)] focus-visible:ring-offset-2 active:shadow-[inset_0_4px_10px_rgba(0,0,0,0.15)]"
                : "cursor-default opacity-[0.97]"
            }`;

            if (!interactive) {
              return (
                <div
                  key={`${dateKey}-${i}`}
                  role="listitem"
                  className={commonClass}
                >
                  {innerTop}
                  {centerBlock}
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
                aria-label={`${formatDayMonth(dateKey)}, גירעון לאחר סגירת יום`}
                className={commonClass}
                onClick={() => {
                  if (isLastSquare && isGold) {
                    setCelebrationOpen(true);
                    return;
                  }
                  setGoldMap(toggleStoryRevealUnlock(i));
                }}
              >
                {innerTop}
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
