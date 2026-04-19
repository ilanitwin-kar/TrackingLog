"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type UserProfile,
  type WeightEntry,
  ensureBaselineWeightRowFromProfile,
  isRegistrationComplete,
  loadProfile,
  loadWeights,
  saveWeights,
} from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { CelebrationConfetti } from "@/components/Fireworks";
import { useCelebration } from "@/lib/useCelebration";
import {
  buildWeightShareText,
  formatDeltaVersusStartLine,
  formatRemainingToGoal,
  formatStepFromPrevious,
  formatTotalChangeFromBaseline,
  round1,
} from "@/lib/weightDisplay";

const AFFIRMATIONS = [
  "את מדהימה!",
  "מנצחת!",
  "התקדמות אמיתית — כל הכבוד!",
  "גאים בך — המשיכי ככה!",
  "זה בדיוק הכיוון!",
];

const HELP_TITLE = "המדד שלך לשליטה";
const HELP_BODY =
  "המשקל הוא רק נתון, לא הציון שלך. מעקב עקבי עוזר לנו לזהות מגמות ולדייק את התהליך בזמן אמת. בחרי את התדירות שמרגישה לך בנוח – יומיומית לדיוק מקסימלי או שבועית למבט על – וזכרי: מה שנמדד, מנוהל.";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WeightPage() {
  const [list, setList] = useState<WeightEntry[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [kg, setKg] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const { showCelebration, fadeOut, celebrationMessage, triggerCelebration } =
    useCelebration();

  const syncFromStorage = useCallback(() => {
    ensureBaselineWeightRowFromProfile();
    setList(loadWeights());
    setProfile(loadProfile());
  }, []);

  useEffect(() => {
    syncFromStorage();
    function onProfile() {
      syncFromStorage();
    }
    window.addEventListener("cj-profile-updated", onProfile);
    return () => window.removeEventListener("cj-profile-updated", onProfile);
  }, [syncFromStorage]);

  const sorted = useMemo(
    () => [...list].sort((a, b) => a.date.localeCompare(b.date)),
    [list],
  );

  const baselineKg = profile?.weightKg ?? 0;
  const goalKg = profile?.goalWeightKg ?? 0;
  const regOk = profile ? isRegistrationComplete(profile) : false;

  const latest = sorted[sorted.length - 1];
  const latestKg = latest ? latest.kg : baselineKg;

  const totalDelta =
    regOk && baselineKg > 0 ? latestKg - baselineKg : 0;

  function addWeight(e: React.FormEvent) {
    e.preventDefault();
    if (!regOk) return;
    const v = parseFloat(kg.replace(",", "."));
    if (Number.isNaN(v) || v < 20 || v > 300) return;

    const prevLast = sorted[sorted.length - 1];
    const entry: WeightEntry = {
      id: uid(),
      kg: round1(v),
      date: new Date().toISOString().slice(0, 10),
    };
    const next = [...list, entry].sort((a, b) => a.date.localeCompare(b.date));
    saveWeights(next);
    setList(next);
    setKg("");

    if (prevLast && v < prevLast.kg - 0.05) {
      const line = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
      triggerCelebration({ customMessage: line });
    }
  }

  function remove(id: string) {
    const next = list.filter((w) => w.id !== id);
    saveWeights(next);
    setList(next);
  }

  function handlePrint() {
    window.print();
  }

  function handleWhatsApp() {
    if (!regOk || !profile) return;
    const text = buildWeightShareText({
      baselineKg,
      latestKg,
      goalKg,
      totalDelta,
    });
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const summaryLine =
    regOk && baselineKg >= 30
      ? formatTotalChangeFromBaseline(totalDelta)
      : null;

  const goalLine =
    regOk && baselineKg >= 30 && goalKg >= 30
      ? formatRemainingToGoal(latestKg, goalKg)
      : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:py-12 print:py-4" dir="rtl">
      <div className="print:hidden">
        <BackToMenuButton />
      </div>
      {showCelebration && (
        <div className={`celebration print:hidden ${fadeOut ? "fade-out" : ""}`}>
          <CelebrationConfetti message={celebrationMessage} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="rounded-full border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-2 text-sm font-bold text-[var(--cherry)] shadow-sm"
        >
          מה עושים כאן? (הסבר)
        </button>
      </div>

      <motion.h1
        className="heading-page mb-2 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        מעקב משקל
      </motion.h1>

      {regOk && baselineKg >= 30 && (
        <motion.div
          className="mb-4 space-y-2 text-center text-[var(--stem)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {summaryLine && (
            <p className="text-lg font-bold leading-snug">{summaryLine}</p>
          )}
          <p className="text-sm opacity-90">
            משקל התחלה מהפרופיל:{" "}
            <span className="font-bold">{round1(baselineKg)} ק״ג</span>
            {latest ? (
              <>
                {" "}
                · משקל אחרון:{" "}
                <span className="font-bold">{round1(latest.kg)} ק״ג</span>
              </>
            ) : null}
          </p>
          {goalLine ? (
            <p className="text-base font-semibold text-[var(--cherry)]">
              {goalLine}
            </p>
          ) : null}
        </motion.div>
      )}

      {!regOk && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950">
          השלימי את פרטים אישיים (מסך TDEE) כדי לחשב מול משקל התחלה ויעד.
        </p>
      )}

      <div className="mb-4 flex flex-wrap justify-center gap-2 print:hidden">
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-2 text-sm font-semibold text-[var(--stem)] shadow-sm"
        >
          הדפסה
        </button>
        <button
          type="button"
          onClick={handleWhatsApp}
          disabled={!regOk}
          className="rounded-xl bg-[#25D366] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-40"
        >
          שליחה לוואטסאפ
        </button>
      </div>

      <form
        onSubmit={addWeight}
        className="glass-panel mb-6 flex flex-wrap items-end gap-3 p-4 print:hidden"
      >
        <label className="min-w-[8rem] flex-1">
          <span className="mb-1 block text-sm font-semibold text-[var(--cherry)]">
            משקל חדש (ק״ג)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            placeholder="למשל 68.4"
            className="input-luxury-search w-full py-3 text-lg"
            disabled={!regOk}
          />
        </label>
        <motion.button
          type="submit"
          className="btn-stem rounded-xl px-6 py-3 font-bold disabled:opacity-40"
          whileTap={{ scale: 0.98 }}
          disabled={!regOk}
        >
          שמירה
        </motion.button>
      </form>

      <section className="glass-panel p-4">
        <h2 className="panel-title-cherry mb-3 text-lg">היסטוריית שקילות</h2>
        {sorted.length === 0 ? (
          <p className="text-[var(--stem)]/85">
            {regOk
              ? "אין עדיין רשומות — תתווסף שורה ראשונה אוטומטית מהמשקל בפרטים האישיים, או הוסיפי שקילה למעלה."
              : "אין עדיין שקילות."}
          </p>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence>
              {[...sorted].reverse().map((w, revIdx) => {
                const chronologicalIdx = sorted.length - 1 - revIdx;
                const prevInTime =
                  chronologicalIdx > 0 ? sorted[chronologicalIdx - 1] : null;
                const deltaFromStart =
                  regOk && baselineKg >= 30 ? w.kg - baselineKg : null;
                const stepLine =
                  prevInTime != null
                    ? formatStepFromPrevious(prevInTime.kg, w.kg)
                    : "שקילת בסיס — לפי המשקל בפרטים האישיים";

                return (
                  <motion.li
                    key={w.id}
                    layout
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-lg font-bold text-[var(--stem)]">
                            {round1(w.kg)} ק״ג
                          </span>
                          <span className="text-sm text-[var(--cherry)]/80">
                            {w.date}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-[var(--stem)]/90">
                          {stepLine}
                        </p>
                        {deltaFromStart != null ? (
                          <p className="mt-1 text-xs text-[var(--stem)]/75">
                            {formatDeltaVersusStartLine(deltaFromStart)}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(w.id)}
                        className="print:hidden shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-[var(--cherry)] ring-1 ring-[var(--border-cherry-soft)] hover:bg-[var(--cherry-muted)]"
                      >
                        מחק
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {helpOpen && (
        <div
          className="fixed inset-0 z-[240] flex items-end justify-center bg-black/45 p-4 sm:items-center print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="weight-help-title"
        >
          <div
            className="glass-panel max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-[var(--border-cherry-soft)] p-5 shadow-xl"
            dir="rtl"
          >
            <h2
              id="weight-help-title"
              className="panel-title-cherry text-xl font-extrabold"
            >
              {HELP_TITLE}
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--text)]">{HELP_BODY}</p>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="btn-stem mt-6 w-full rounded-xl py-3 text-center text-sm font-bold"
            >
              הבנתי
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
