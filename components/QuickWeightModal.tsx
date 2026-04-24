"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile, WeightEntry } from "@/lib/storage";
import { ensureBaselineWeightRowFromProfile, loadWeights, saveWeights } from "@/lib/storage";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

function sortByDateAsc(list: WeightEntry[]): WeightEntry[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

export type QuickWeightModalResult =
  | { ok: true; newKg: number; prevKg: number | null }
  | { ok: false };

export function QuickWeightModal({
  open,
  onClose,
  profile,
  title = "הזיני משקל יומי",
}: {
  open: boolean;
  onClose: (result: QuickWeightModalResult) => void;
  profile: UserProfile;
  title?: string;
}) {
  const [kg, setKg] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [prevKg, setPrevKg] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setKg("");
    try {
      ensureBaselineWeightRowFromProfile();
      const sorted = sortByDateAsc(loadWeights());
      const t = todayKey();
      const prev = [...sorted].reverse().find((w) => w.date < t);
      setPrevKg(prev ? prev.kg : null);
    } catch {
      setPrevKg(null);
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose({ ok: false });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function closeNope() {
    onClose({ ok: false });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const v = parseFloat(kg.replace(",", "."));
    if (Number.isNaN(v) || v < 20 || v > 300) return;
    setSaving(true);
    try {
      ensureBaselineWeightRowFromProfile();
      const list = loadWeights();
      const t = todayKey();
      const entry: WeightEntry = { id: uid(), kg: round1(v), date: t };
      const withoutToday = list.filter((x) => x.date !== t);
      const next = sortByDateAsc([...withoutToday, entry]);
      saveWeights(next);
      onClose({ ok: true, newKg: entry.kg, prevKg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/35 px-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeNope();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-[var(--cherry)]">{title}</h3>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--stem)]/80">
              10 שניות של אמת — ואז תראי את התמונה הרבה יותר ברור.
            </p>
          </div>
          <button
            type="button"
            className="btn-icon-luxury"
            onClick={closeNope}
            aria-label="סגירה"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-bold text-[var(--stem)]/80">משקל בק״ג</span>
            <input
              ref={inputRef}
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              inputMode="decimal"
              placeholder={String(Math.round((profile.weightKg || 70) * 10) / 10)}
              className="mt-1 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-base font-extrabold tabular-nums text-[var(--stem)] shadow-sm outline-none focus:border-[var(--stem)]"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
              onClick={closeNope}
            >
              לא עכשיו
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-stem flex-1 rounded-xl py-3 text-sm font-extrabold disabled:opacity-50"
            >
              {saving ? "שומר…" : "שמירה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

