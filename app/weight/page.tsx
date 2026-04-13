"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { uiWeightHistoryEmpty, weightAffirmations } from "@/lib/hebrewGenderUi";
import type { Gender } from "@/lib/tdee";
import {
  type WeightEntry,
  loadProfile,
  loadWeights,
  saveWeights,
} from "@/lib/storage";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { CelebrationConfetti } from "@/components/Fireworks";
import { useCelebration } from "@/lib/useCelebration";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WeightPage() {
  const [list, setList] = useState<WeightEntry[]>([]);
  const [kg, setKg] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const { showCelebration, fadeOut, celebrationMessage, triggerCelebration } =
    useCelebration(gender);

  useEffect(() => {
    setList(loadWeights());
    const g = loadProfile().gender;
    setGender(g === "male" ? "male" : "female");
  }, []);

  const sorted = useMemo(
    () => [...list].sort((a, b) => a.date.localeCompare(b.date)),
    [list]
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const lostSoFar =
    first && last ? Math.max(0, Math.round((first.kg - last.kg) * 10) / 10) : 0;

  function addWeight(e: React.FormEvent) {
    e.preventDefault();
    const v = parseFloat(kg.replace(",", "."));
    if (Number.isNaN(v) || v < 20 || v > 300) return;

    const prevLast = sorted[sorted.length - 1];
    const entry: WeightEntry = {
      id: uid(),
      kg: v,
      date: new Date().toISOString().slice(0, 10),
    };
    const next = [...list, entry].sort((a, b) => a.date.localeCompare(b.date));
    saveWeights(next);
    setList(next);
    setKg("");

    if (prevLast && v < prevLast.kg - 0.05) {
      const lines = weightAffirmations(gender);
      const line = lines[Math.floor(Math.random() * lines.length)]!;
      triggerCelebration({ customMessage: line });
    }
  }

  function remove(id: string) {
    const next = list.filter((w) => w.id !== id);
    saveWeights(next);
    setList(next);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:py-12" dir="rtl">
      <BackToMenuButton />
      {showCelebration && (
        <div className={`celebration ${fadeOut ? "fade-out" : ""}`}>
          <CelebrationConfetti message={celebrationMessage} />
        </div>
      )}

      <motion.h1
        className="mb-2 text-center text-3xl font-extrabold text-[#333333] md:text-4xl"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        מעקב משקל
      </motion.h1>

      {lostSoFar > 0 && (
        <motion.p
          className="mb-6 text-center text-xl font-bold text-[#333333]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          ירדת עד כה {lostSoFar} ק״ג
        </motion.p>
      )}

      <form
        onSubmit={addWeight}
        className="glass-panel mb-6 flex flex-wrap items-end gap-3 p-4"
      >
        <label className="min-w-[8rem] flex-1">
          <span className="mb-1 block text-sm font-semibold text-[#333333]">
            משקל (ק״ג)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            placeholder="למשל 68.4"
            className="input-luxury-search w-full py-3 text-lg"
          />
        </label>
        <motion.button
          type="submit"
          className="btn-gold rounded-xl px-6 py-3 font-bold"
          whileTap={{ scale: 0.98 }}
        >
          שמירה
        </motion.button>
      </form>

      <section className="glass-panel p-4">
        <h2 className="mb-3 text-lg font-bold text-[#333333]">היסטוריה</h2>
        {sorted.length === 0 ? (
          <p className="text-[#333333]/85">
            {uiWeightHistoryEmpty(gender)}
          </p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence>
              {[...sorted].reverse().map((w) => (
                <motion.li
                  key={w.id}
                  layout
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-between rounded-xl border-2 border-[#FADADD] bg-white px-3 py-2"
                >
                  <div>
                    <span className="font-bold text-[#333333]">{w.kg} ק״ג</span>
                    <span className="mr-2 text-sm text-[#333333]/75">
                      {w.date}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(w.id)}
                    className="rounded-lg px-2 py-1 text-sm font-semibold text-[#333333] ring-1 ring-[#FADADD] hover:bg-[#FADADD]/30"
                  >
                    מחק
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}
