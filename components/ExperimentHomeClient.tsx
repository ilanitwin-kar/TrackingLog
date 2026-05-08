"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { addDaysToDateKey, getTodayKey } from "@/lib/dateKey";
import { bumpExperimentSessionCount } from "@/lib/experimentVisitSession";
import { useDocumentScrollOnlyIfOverflowing } from "@/lib/useDocumentScrollOnlyIfOverflowing";
import { getDaysRemainingToGoal } from "@/lib/goalMetrics";
import { gf } from "@/lib/hebrewGenderUi";
import { getTimeOfDaySlot } from "@/lib/dashboardGreeting";
import {
  loadDayLogs,
  loadProfile,
  loadWeights,
  loadWeightSkipDayKey,
  type UserProfile,
  type WeightEntry,
} from "@/lib/storage";
import { dailyCalorieTarget } from "@/lib/tdee";
import type { Gender } from "@/lib/tdee";

function mealPhraseByHour(hour: number, gender: Gender): string {
  if (hour >= 5 && hour < 11) {
    return gf(gender, "ארוחת הבוקר", "ארוחת הבוקר");
  }
  if (hour >= 11 && hour < 17) {
    return gf(gender, "ארוחת הצהריים", "ארוחת הצהריים");
  }
  if (hour >= 17 && hour < 22) {
    return gf(gender, "ארוחת הערב", "ארוחת הערב");
  }
  return gf(gender, "מה שאכלת בערב", "מה שאכלת בערב");
}

function sortWeightsChronological(weights: WeightEntry[]): WeightEntry[] {
  return [...weights].sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    const ta = a.recordedAt ?? "";
    const tb = b.recordedAt ?? "";
    return ta.localeCompare(tb);
  });
}

function weightLossSincePreviousKg(
  weights: WeightEntry[],
  todayKey: string
): number | null {
  const sorted = sortWeightsChronological(weights);
  if (sorted.length < 2) return null;
  const last = sorted[sorted.length - 1]!;
  const prev = sorted[sorted.length - 2]!;
  if (last.date !== todayKey) return null;
  const delta = prev.kg - last.kg;
  if (!Number.isFinite(delta) || delta <= 0.05) return null;
  return Math.round(delta * 10) / 10;
}

function isWeightDueToday(profile: UserProfile | null, todayKey: string): boolean {
  if (!profile) return false;
  try {
    if (loadWeightSkipDayKey() === todayKey) return false;
    const weights = loadWeights();
    if (weights.some((w) => w && w.date === todayKey)) return false;
    const freq = profile.weighInFrequency ?? "daily";
    if (freq === "daily") return true;
    const d = new Date(`${todayKey}T12:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    if (freq === "weekly") {
      const wd =
        typeof profile.weighInWeekday === "number" ? profile.weighInWeekday : 1;
      return d.getDay() === Math.min(6, Math.max(0, Math.floor(wd)));
    }
    if (freq === "monthly") {
      const md =
        typeof profile.weighInMonthDay === "number" ? profile.weighInMonthDay : 1;
      return d.getDate() === Math.min(28, Math.max(1, Math.floor(md)));
    }
    return true;
  } catch {
    return false;
  }
}

function yesterdayKcalTotal(yesterdayKey: string): number {
  const logs = loadDayLogs();
  const entries = logs[yesterdayKey];
  if (!entries?.length) return 0;
  return entries.reduce((s, e) => s + (e.calories || 0), 0);
}

export function ExperimentHomeClient() {
  useDocumentScrollOnlyIfOverflowing();
  const [sessionN, setSessionN] = useState(0);
  const [rev, setRev] = useState(0);

  useLayoutEffect(() => {
    setSessionN(bumpExperimentSessionCount());
  }, []);

  useLayoutEffect(() => {
    const bump = () => setRev((r) => r + 1);
    window.addEventListener("storage", bump);
    window.addEventListener("cj-profile-updated", bump);
    return () => {
      window.removeEventListener("storage", bump);
      window.removeEventListener("cj-profile-updated", bump);
    };
  }, []);

  const todayKey = getTodayKey();

  const model = useMemo(() => {
    const hour = new Date().getHours();
    const yKey = addDaysToDateKey(getTodayKey(), -1);
    const profile = loadProfile();
    const gender = profile.gender;
    const firstName = profile.firstName?.trim() ?? "";
    const slot = getTimeOfDaySlot(hour);
    const salute = firstName
      ? `${slot.salutationHe} ${firstName}!`
      : `${slot.salutationHe}!`;

    const daysToGoal = getDaysRemainingToGoal();
    const budget = Math.round(dailyCalorieTarget(profile));
    const weights = loadWeights();
    const tKey = getTodayKey();
    const weightDue = isWeightDueToday(profile, tKey);
    const lossKg = weightLossSincePreviousKg(weights, tKey);

    const yTotal = yesterdayKcalTotal(yKey);
    const target = budget;
    let yesterdayLine: string | null = null;
    if (yTotal > 0 && target > 0) {
      if (yTotal <= target) {
        yesterdayLine = gf(
          gender,
          "אתמול היית אלופה ועמדת ביעדים! ממשיכות בכל הכוח.",
          "אתמול היית אלוף ועמדת ביעדים! ממשיכים בכל הכוח."
        );
      } else {
        yesterdayLine = gf(
          gender,
          "יום חדש לפנינו. אתמול הייתה חריגה קטנה — היום נתמקד בדיוק בגרמים.",
          "יום חדש לפנינו. אתמול הייתה חריגה קטנה — היום נתמקד בדיוק בגרמים."
        );
      }
    }

    let weightLine: string | null = null;
    if (lossKg != null && lossKg > 0) {
      weightLine = gf(
        gender,
        `וואו! רואים את ההשקעה שלך — ירדת ${lossKg} ק״ג. איזה כיף להתחיל ככה את היום!`,
        `וואו! רואים את ההשקעה שלך — ירדת ${lossKg} ק״ג. איזה כיף להתחיל ככה את היום!`
      );
    }

    const goalTail =
      daysToGoal != null && daysToGoal > 0
        ? ` כדי להתקדם ליעד בעוד ${daysToGoal.toLocaleString("he-IL")} ימים`
        : " — לפי המסלול מהשאלון";
    const openingFirst = `מתחילים יום חדש!${goalTail}. בתקציב שלך להיום יש ${budget.toLocaleString("he-IL")} קלוריות.`;

    const revisit23 = gf(
      gender,
      `שמחה לפגוש אותך שוב — את אלופה! תעדי מה אכלת ב${mealPhraseByHour(hour, gender)}.`,
      `שמח לפגוש אותך שוב — אתה אלוף! תעד מה אכלת ב${mealPhraseByHour(hour, gender)}.`
    );

    const revisitLate = gf(
      gender,
      "כבר עברת כאן כמה פעמים היום — אולי הזמן לסגור את היום ביומן ולסיים את הסיכום היומי בהצלחה.",
      "כבר עברת כאן כמה פעמים היום — אולי הזמן לסגור את היום ביומן ולסיים את הסיכום היומי בהצלחה."
    );

    return {
      gender,
      salute,
      openingFirst,
      yesterdayLine,
      weightLine,
      revisit23,
      revisitLate,
      weightDue,
      emoji: slot.emoji,
    };
  }, 
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rev מסנכרן אחרי storage/profile
    [rev],
  );

  const paragraphs: string[] = [];
  if (sessionN >= 1) {
    paragraphs.push(`${model.salute} ${model.emoji}`);
    if (sessionN === 1) {
      paragraphs.push(model.openingFirst);
      if (model.yesterdayLine) paragraphs.push(model.yesterdayLine);
      if (model.weightLine) paragraphs.push(model.weightLine);
    } else if (sessionN === 2 || sessionN === 3) {
      paragraphs.push(model.revisit23);
    } else {
      paragraphs.push(model.revisitLate);
    }
  }

  const addFoodHref = `/add-food?from=experiment&date=${encodeURIComponent(todayKey)}`;
  const journalHref = `/journal?date=${encodeURIComponent(todayKey)}`;

  let primaryHref = addFoodHref;
  let primaryLabel = gf(model.gender, "הוסיפי מזון", "הוסף מזון");
  const primaryClass =
    "inline-flex w-full items-center justify-center rounded-2xl bg-[var(--cherry)] px-4 py-3.5 text-lg font-extrabold text-white shadow-[var(--cherry-glow-shadow)] transition hover:brightness-105";

  if (sessionN === 1 && model.weightDue) {
    primaryHref = "/weight";
    primaryLabel = gf(model.gender, "הצעד הבא: להישקל", "הצעד הבא: להישקל");
  } else if (sessionN === 1 && !model.weightDue) {
    primaryLabel = gf(model.gender, "הוסיפי מזון", "הוסף מזון");
  } else if (sessionN === 2 || sessionN === 3) {
    primaryLabel = gf(model.gender, "הוסיפי מזון", "הוסף מזון");
  } else if (sessionN >= 4) {
    primaryHref = journalHref;
    primaryLabel = gf(model.gender, "לסגירת יום ביומן", "לסגירת יום ביומן");
  }

  const secondary =
    sessionN === 1 && model.weightDue ? (
      <Link
        href={addFoodHref}
        className="mt-2 inline-flex w-full items-center justify-center rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-base font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
      >
        {gf(model.gender, "או הוסיפי מזון", "או הוסף מזון")}
      </Link>
    ) : sessionN >= 4 ? (
      <Link
        href={addFoodHref}
        className="mt-2 inline-flex w-full items-center justify-center rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-base font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
      >
        {gf(model.gender, "הוסיפי מזון", "הוסף מזון")}
      </Link>
    ) : null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-6" dir="rtl">
      <div className="mb-4 flex items-center justify-center gap-2 text-[var(--cherry)]">
        <Sparkles className="h-6 w-6 shrink-0" aria-hidden />
        <p className="text-center text-sm font-bold text-[var(--stem)]/80">
          מסך ניסיון — לא מחליף את הבית
        </p>
      </div>

      {sessionN < 1 ? (
        <p className="text-center text-lg text-[var(--stem)]">טוען…</p>
      ) : (
        <div
          className="relative rounded-[1.35rem] border-2 border-[var(--border-cherry-soft)] bg-[color-mix(in_srgb,white_92%,var(--cherry)_8%)] px-4 py-5 shadow-[0_10px_36px_var(--panel-shadow-soft)]"
          style={{
            boxShadow:
              "0 10px 36px var(--panel-shadow-soft), inset 0 1px 0 rgba(255,255,255,0.85)",
          }}
        >
          <div
            className="pointer-events-none absolute -bottom-2 left-8 h-4 w-4 rotate-45 border-b-2 border-e-2 border-[var(--border-cherry-soft)] bg-[color-mix(in_srgb,white_92%,var(--cherry)_8%)]"
            aria-hidden
          />
          <div className="space-y-4">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className={`text-pretty leading-relaxed text-[var(--stem)] ${
                  i === 0 ? "text-xl font-extrabold sm:text-2xl" : "text-xl font-semibold sm:text-[1.15rem]"
                }`}
              >
                {p}
              </p>
            ))}
          </div>

          <div className="relative z-[1] mt-6 space-y-0">
            <Link href={primaryHref} className={primaryClass}>
              {primaryLabel}
            </Link>
            {secondary}
          </div>

          <p className="mt-4 text-center text-sm font-semibold text-[var(--stem)]/65">
            כניסה {sessionN.toLocaleString("he-IL")} היום למסך הניסיון
          </p>
        </div>
      )}

      <div className="mt-8 space-y-2 text-center text-sm text-[var(--stem)]/75">
        <Link
          href="/"
          className="font-bold text-[var(--cherry)] underline-offset-2 hover:underline"
        >
          חזרה לבית הרגיל
        </Link>
      </div>
    </div>
  );
}
