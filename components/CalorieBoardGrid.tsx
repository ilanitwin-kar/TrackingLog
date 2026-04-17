"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getCalorieBoardPastDateKeysBeforeForwardWindow } from "@/lib/calorieBoardPastKeys";
import { getCalorieBoardDateSequence, getTodayKey } from "@/lib/dateKey";
import {
  JOURNEY_FINAL_GOLD_MESSAGE,
  getJourneyMilestoneMessage,
} from "@/lib/journeyMilestones";
import { formatClosedDayCalorieGapPhrase } from "@/lib/calorieGapMessageHe";
import {
  uiCloseJournalOnHome,
  uiCloseJournalToUnlockCube,
  uiTapOnCube,
} from "@/lib/hebrewGenderUi";
import {
  getStoryDisplayForSquare,
  getWordForSquareIndex,
} from "@/lib/storyReveal";
import {
  getCalorieBoardTotalDays,
  getTdeeKcalRoundedFromProfile,
} from "@/lib/goalMetrics";
import type { Gender } from "@/lib/tdee";
import {
  ensureStoryRevealDateMigration,
  isDayJournalClosed,
  loadDayJournalClosedMap,
  loadProfile,
  loadStoryRevealUnlock,
  toggleStoryRevealUnlock,
} from "@/lib/storage";
import { CelebrationFireworks } from "@/components/CelebrationFireworks";
const fontBoard =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";
/** גופן שמציג עברית בצורה אמינה על רקע זהב (Calibri ראשון עלול להשאיר תאים “ריקים”) */
const fontBoardStoryGold =
  "font-[system-ui,'Segoe_UI',Arial,'Helvetica_Neue',sans-serif]";

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
  /** משבצות לפני חלון המסלול (היום ואילך) — ימי עבר עם רישום / סגירה / זהב */
  pastCount: number;
  /** מספר משבצות במסלול מהיום ליעד (כמו getCalorieBoardTotalDays) */
  forwardDayCount: number;
  dateKeys: string[];
  tdeeKcal: number;
  today: string;
  firstName: string;
  gender: Gender;
};

function buildGridModel(): GridModel | null {
  const forwardDayCount = getCalorieBoardTotalDays();
  if (forwardDayCount == null || forwardDayCount < 1) {
    return null;
  }
  const forwardKeys = getCalorieBoardDateSequence(forwardDayCount);
  if (forwardKeys.length !== forwardDayCount) {
    return null;
  }
  const pastKeys = getCalorieBoardPastDateKeysBeforeForwardWindow(forwardKeys);
  const dateKeys = [...pastKeys, ...forwardKeys];
  ensureStoryRevealDateMigration(dateKeys);
  const p = loadProfile();
  const tdeeKcal = getTdeeKcalRoundedFromProfile(p);
  return {
    pastCount: pastKeys.length,
    forwardDayCount,
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
    window.addEventListener("cj-day-journal-closed", sync);
    return () => {
      window.removeEventListener("cj-profile-updated", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("cj-day-journal-closed", sync);
    };
  }, []);

  useEffect(() => {
    setGoldMap(loadStoryRevealUnlock());
  }, [profileRev, board?.dateKeys.length]);

  useEffect(() => {
    const sync = () => setGoldMap(loadStoryRevealUnlock());
    window.addEventListener("cj-story-reveal-updated", sync);
    window.addEventListener("cj-day-journal-closed", sync);
    return () => {
      window.removeEventListener("cj-story-reveal-updated", sync);
      window.removeEventListener("cj-day-journal-closed", sync);
    };
  }, []);

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

  const { dateKeys, pastCount, forwardDayCount, today, firstName, gender } =
    board;
  const totalCells = dateKeys.length;
  const closedMap = loadDayJournalClosedMap();

  /** בלי overflow-hidden / ריבוע קטן ב-md — אחרת שורת הסיפור והפער נחתכים לגמרי */
  const cellFixed =
    "min-h-[11.5rem] w-full min-w-0 max-w-full shrink-0 sm:min-h-[11rem] md:min-h-[12.5rem]";

  return (
    <section className={`space-y-4 overflow-visible ${fontBoard}`}>
      <div
        className="overflow-visible rounded-2xl border border-[#FADADD]/90 bg-gradient-to-b from-[#fffafd] to-[#faf8f9] p-2 sm:p-3"
        dir="rtl"
      >
        <div
          className="grid grid-cols-2 gap-3 overflow-visible sm:grid-cols-3 sm:gap-3 md:grid-cols-4"
          role="list"
          aria-label={`מפת התקדמות, ${totalCells} משבצות`}
        >
          {dateKeys.map((dateKey, i) => {
            const isFuture = dateKey > today;
            const forwardIndex = i - pastCount;
            const isPastSlot = forwardIndex < 0;
            const dayNum =
              forwardIndex >= 0
                ? forwardDayCount - forwardIndex
                : null;
            const journalClosed = isDayJournalClosed(dateKey);
            const isGold = journalClosed && goldMap[dateKey] === true;
            const isLastSquare = i === dateKeys.length - 1;
            const storyTextRaw =
              forwardIndex >= 0
                ? getStoryDisplayForSquare(forwardIndex, firstName, gender)
                : "";
            const storyText =
              forwardIndex >= 0
                ? storyTextRaw.trim().length > 0
                  ? storyTextRaw.trim()
                  : forwardIndex === 0
                    ? firstName.trim() ||
                      (gender === "male" ? "אתה" : "את")
                    : getWordForSquareIndex(
                        Math.max(0, forwardIndex - 1),
                        gender
                      )
                : "עוד צעד בדרך שלך";
            const showReveal = !isFuture && isGold;
            const milestoneMsg =
              forwardIndex >= 0
                ? getJourneyMilestoneMessage(forwardDayCount, forwardIndex)
                : null;
            const gapKcal = closedMap[dateKey]?.gapKcal;
            const gapRounded =
              gapKcal != null ? Math.round(gapKcal) : null;

            const lockedHint = isFuture
              ? milestoneMsg ??
                `יום ${dayNum ?? forwardDayCount} · ` +
                  "\u05ea\u05d0\u05e8\u05d9\u05da \u05e2\u05ea\u05d9\u05d3\u05d9"
              : journalClosed
                ? milestoneMsg ?? uiTapOnCube(gender)
                : isPastSlot
                  ? milestoneMsg ?? uiCloseJournalToUnlockCube(gender)
                  : milestoneMsg ?? uiCloseJournalOnHome(dayNum!, gender);

            const gapLine =
              showReveal && gapRounded != null ? (
                <p
                  dir="rtl"
                  className={`mb-1 max-w-full shrink-0 px-0.5 text-center text-[0.95rem] font-black leading-snug text-black sm:text-[1.1rem] md:text-[1.2rem] ${fontBoardStoryGold}`}
                >
                  {formatClosedDayCalorieGapPhrase(gapRounded, gender)}
                </p>
              ) : null;

            const centerBlock = (
              <div
                className={`flex min-h-0 flex-1 flex-col items-center justify-center px-0.5 ${
                  showReveal ? "overflow-visible" : "overflow-hidden"
                }`}
              >
                {showReveal ? (
                  <>
                    {gapLine != null ? gapLine : null}
                    <span
                      dir="rtl"
                      className={`line-clamp-6 w-full shrink-0 break-words text-center text-[clamp(1.1rem,4vw,1.75rem)] font-extrabold leading-snug tracking-tight text-slate-950 sm:text-[clamp(1.05rem,3.2vw,1.55rem)] [text-shadow:0_1px_0_rgba(255,255,255,0.9),0_0_1px_rgba(255,255,255,0.5)] ${fontBoardStoryGold}`}
                    >
                      {isLastSquare && showReveal
                        ? JOURNEY_FINAL_GOLD_MESSAGE
                        : storyText}
                    </span>
                  </>
                ) : (
                  <span
                    dir="rtl"
                    className="line-clamp-8 w-full max-h-full overflow-hidden text-center text-sm font-semibold leading-snug text-[#374151] sm:text-base"
                  >
                    {lockedHint}
                  </span>
                )}
              </div>
            );

            const headerBlock = isPastSlot ? (
              <div className="shrink-0 text-center leading-tight">
                <div className="text-xs font-bold text-[#4b5563] sm:text-sm">
                  יום מהעבר
                </div>
                <div className="truncate text-base font-black tabular-nums text-black sm:text-lg md:text-xl">
                  {formatDayMonth(dateKey)}
                </div>
              </div>
            ) : dayNum != null ? (
              <div className="shrink-0 text-center leading-tight">
                <div className="text-base font-black tabular-nums text-black sm:text-lg md:text-xl">
                  יום {dayNum.toLocaleString("he-IL")}
                </div>
                <div className="truncate text-sm font-black tracking-tight text-black sm:text-base md:text-lg">
                  {formatDayMonth(dateKey)}
                </div>
              </div>
            ) : null;
            const goldHeaderSpacer = (
              <div className="min-h-[2.25rem] shrink-0" aria-hidden />
            );

            if (isFuture) {
              return (
                <div
                  key={`${dateKey}-${i}`}
                  role="listitem"
                  aria-disabled
                  tabIndex={-1}
                  className={`relative flex ${cellFixed} flex-col items-stretch justify-between gap-1 rounded-2xl border-2 px-2.5 py-2.5 text-center ${fontBoard} ${futureGrey3d}`}
                >
                  {headerBlock}
                  <div className="min-h-[8px] shrink-0" aria-hidden />
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5">
                    <span
                      dir="rtl"
                      className="line-clamp-8 w-full max-h-full overflow-hidden text-center text-sm font-semibold leading-snug text-[#374151] sm:text-base"
                    >
                      {lockedHint}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <motion.button
                key={`${dateKey}-${i}`}
                type="button"
                role="listitem"
                whileTap={{ scale: journalClosed ? 0.97 : 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
                aria-pressed={isGold}
                aria-label={`${formatDayMonth(dateKey)}, ${
                  dayNum != null ? `יום ${dayNum}` : "יום מהעבר"
                }${
                  !journalClosed
                    ? " — נדרשת סגירת יומן"
                    : isGold && gapRounded != null
                      ? `, ${formatClosedDayCalorieGapPhrase(gapRounded, gender)}`
                      : journalClosed
                        ? " — ניתן ללחיצה על הקוביה"
                        : ""
                }${isLastSquare && isGold ? ", חגיגת סיום" : ""}`}
                title={
                  !journalClosed
                    ? uiCloseJournalToUnlockCube(gender)
                    : !isGold
                      ? uiTapOnCube(gender)
                      : undefined
                }
                className={`relative flex ${cellFixed} flex-col items-stretch justify-between gap-1 rounded-2xl border-2 px-2.5 py-2.5 text-center transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:shadow-[inset_0_4px_10px_rgba(0,0,0,0.15)] ${fontBoard} ${
                  isGold ? `${gold3d} text-slate-950` : grey3d
                } ${!journalClosed ? "opacity-[0.92]" : ""} `}
                onClick={() => {
                  if (!journalClosed) return;
                  if (isLastSquare && isGold) {
                    setCelebrationOpen(true);
                    return;
                  }
                  setGoldMap(toggleStoryRevealUnlock(dateKey));
                }}
              >
                {isGold ? goldHeaderSpacer : headerBlock}
                <div className="min-h-[8px] shrink-0" aria-hidden />
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
