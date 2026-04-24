"use client";

import { useEffect, useRef, useState } from "react";

export function QuickStepsModal({
  open,
  onClose,
  onSave,
  initialSteps = "",
}: {
  open: boolean;
  onClose: () => void;
  onSave: (steps: number) => void;
  initialSteps?: string;
}) {
  const [stepsText, setStepsText] = useState(initialSteps);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setStepsText(initialSteps ?? "");
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, initialSteps]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = String(stepsText ?? "").replace(/[^\d]/g, "");
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onSave(n);
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/35 px-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="דיווח צעדים"
        className="w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-[var(--cherry)]">
              קיזוז בהליכה
            </h3>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--stem)]/80">
              כל צעד נחשב. עדכני צעדים — ונראה את הקיזוז מיד.
            </p>
          </div>
          <button type="button" className="btn-icon-luxury" onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-bold text-[var(--stem)]/80">
              כמה צעדים עשית?
            </span>
            <input
              ref={inputRef}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className="mt-1 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-base font-extrabold tabular-nums text-[var(--stem)] shadow-sm outline-none focus:border-[var(--stem)]"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={onClose}
            >
              לא עכשיו
            </button>
            <button type="submit" className="btn-stem flex-1 rounded-xl py-3 text-sm font-extrabold">
              שמירה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

