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
import { CelebrationConfetti } from "@/components/Fireworks";
import { InfoCard } from "@/components/InfoCard";
import { useCelebration } from "@/lib/useCelebration";
import {
  buildWeightShareText,
  formatRemainingToGoal,
  formatTotalChangeFromBaseline,
  formatWeightEntryDateTimeLine,
  round1,
} from "@/lib/weightDisplay";
import {
  gf,
  infoWeightBody,
  uiWeightHistoryEmpty,
  weightAffirmations,
} from "@/lib/hebrewGenderUi";

// help modal removed; standardized InfoCard used instead

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WeightPage() {
  const [list, setList] = useState<WeightEntry[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [kg, setKg] = useState("");
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
  const gender = profile?.gender ?? "female";

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
    const now = new Date();
    const entry: WeightEntry = {
      id: uid(),
      kg: round1(v),
      date: now.toISOString().slice(0, 10),
      recordedAt: now.toISOString(),
    };
    const next = [...list, entry].sort((a, b) => a.date.localeCompare(b.date));
    saveWeights(next);
    setList(next);
    setKg("");

    if (prevLast && v < prevLast.kg - 0.05) {
      const lines = weightAffirmations(gender);
      const line = lines[Math.floor(Math.random() * lines.length)];
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
      latestKg,
      goalKg,
      totalDelta,
    });
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const summaryLine =
    regOk && baselineKg >= 30 && Math.abs(totalDelta) >= 0.05
      ? formatTotalChangeFromBaseline(totalDelta)
      : null;

  const goalLine =
    regOk && baselineKg >= 30 && goalKg >= 30
      ? formatRemainingToGoal(latestKg, goalKg)
      : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:py-12 print:py-4" dir="rtl">
      {showCelebration && (
        <div className={`celebration print:hidden ${fadeOut ? "fade-out" : ""}`}>
          <CelebrationConfetti message={celebrationMessage} />
        </div>
      )}

      <motion.h1
        className="heading-page mb-2 text-center text-3xl md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        מעקב משקל
      </motion.h1>

      <InfoCard
        gender={gender}
        icon="⚖️"
        title="הזנת משקל ומעקב"
        body={infoWeightBody(gender)}
        className="mb-5"
      />

      {regOk && baselineKg >= 30 && (
        <motion.div
          className="mb-4 space-y-2 text-center text-[var(--stem)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {summaryLine ? (
            <p className="text-lg font-bold leading-snug">{summaryLine}</p>
          ) : null}
          {goalLine ? (
            <p className="text-lg font-bold leading-snug text-[var(--cherry)]">
              {goalLine}
            </p>
          ) : null}
        </motion.div>
      )}

      {!regOk && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950">
          {gf(
            gender,
            "השלימי פרטים אישיים (מסך TDEE) כדי לחשב מול משקל התחלה ויעד.",
            "השלם פרטים אישיים (מסך TDEE) כדי לחשב מול משקל התחלה ויעד."
          )}
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
              ? gf(
                  gender,
                  "אין עדיין רשומות — תתווסף שורה ראשונה אוטומטית מהמשקל בפרטים האישיים, או הוסיפי שקילה למעלה.",
                  "אין עדיין רשומות — תתווסף שורה ראשונה אוטומטית מהמשקל בפרטים האישיים, או הוסף שקילה למעלה."
                )
              : uiWeightHistoryEmpty(gender)}
          </p>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence>
              {[...sorted].reverse().map((w) => {
                return (
                  <motion.li
                    key={w.id}
                    layout
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="app-ui-no-select rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-lg font-bold text-[var(--stem)]">
                            {round1(w.kg)} ק״ג
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-[var(--cherry)]/85">
                            {formatWeightEntryDateTimeLine(w)}
                          </span>
                        </div>
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
    </div>
  );
}
