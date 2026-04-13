"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { fireworksDismissHint } from "@/lib/hebrewGenderUi";
import type { Gender } from "@/lib/tdee";

const fontBoard =
  "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]";

function getCelebrationMessage(gender: Gender): string {
  return gender === "male"
    ? "כל הכבוד, אתה אלוף!"
    : "כל הכבוד, את אלופה!";
}

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
] as const;

type BurstSeed = {
  id: string;
  xPct: number;
  yPct: number;
  delay: number;
  color: string;
};

function buildBursts(count: number): BurstSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b-${i}`,
    xPct: 8 + Math.random() * 84,
    yPct: 10 + Math.random() * 70,
    delay: Math.random() * 0.45,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
  }));
}

function FireworkBurst({
  xPct,
  yPct,
  delay,
  color,
}: {
  xPct: number;
  yPct: number;
  delay: number;
  color: string;
}) {
  const n = 28;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2;
        const dist = 72 + Math.random() * 56;
        return (
          <motion.span
            key={i}
            className="absolute block h-2 w-2 rounded-full shadow-sm"
            style={{ backgroundColor: color, left: 0, top: 0 }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.2 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: [0, Math.cos(angle) * dist],
              y: [0, Math.sin(angle) * dist],
              scale: [0.2, 1.1, 0.4],
            }}
            transition={{
              duration: 1.35,
              delay,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        );
      })}
    </div>
  );
}

export function CelebrationFireworks({
  open,
  onClose,
  gender,
}: {
  open: boolean;
  onClose: () => void;
  gender: Gender;
}) {
  const msg = getCelebrationMessage(gender);
  const [burstEpoch, setBurstEpoch] = useState(0);

  useEffect(() => {
    if (!open) return;
    setBurstEpoch(0);
    const id = window.setInterval(() => {
      setBurstEpoch((e) => e + 1);
    }, 2100);
    return () => window.clearInterval(id);
  }, [open]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onKeyDown]);

  const bursts = open ? buildBursts(20) : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="חגיגת סיום"
          className="fixed inset-0 z-[200] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
            aria-label="סגור חגיגה"
            onClick={onClose}
          />
          <div
            key={burstEpoch}
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            {bursts.map((b) => (
              <FireworkBurst
                key={b.id}
                xPct={b.xPct}
                yPct={b.yPct}
                delay={b.delay}
                color={b.color}
              />
            ))}
          </div>
          <motion.div
            dir="rtl"
            className={`pointer-events-none relative z-10 mx-6 max-w-[min(92vw,28rem)] rounded-3xl border-2 border-amber-400/90 bg-gradient-to-br from-amber-50 via-white to-rose-50 px-8 py-10 text-center shadow-[0_0_60px_rgba(234,179,8,0.55),0_25px_50px_rgba(0,0,0,0.2)] ${fontBoard}`}
            initial={{ scale: 0.85, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <p className="text-2xl font-black leading-tight text-[#1a1200] sm:text-3xl md:text-4xl">
              {msg}
            </p>
            <p className="mt-4 text-sm font-semibold text-[#78350f]/90">
              {fireworksDismissHint(gender)}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
