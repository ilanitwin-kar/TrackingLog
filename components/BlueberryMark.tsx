"use client";

import { useId } from "react";

export type BlueberryMarkTone = "brand" | "steel";

/** אייקון אוכמניות — מותג ערוץ הגברים; steel = אפור פלדה (מסך בחירה וכו') */
export function BlueberryMark({
  className = "",
  tone = "brand",
}: {
  className?: string;
  tone?: BlueberryMarkTone;
}) {
  const rid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g1 = `bb-bloom-${rid}`;
  const g2 = `bb-berry-${rid}`;
  const g3 = `bb-leaf-${rid}`;
  const fl = `bb-fl-${rid}`;

  const steel = tone === "steel";

  return (
    <svg
      className={className}
      viewBox="0 0 120 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id={g1} cx="35%" cy="35%" r="65%">
          {steel ? (
            <>
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="45%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#64748b" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </>
          )}
        </radialGradient>
        <radialGradient id={g2} cx="38%" cy="32%" r="65%">
          {steel ? (
            <>
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="50%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#475569" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="45%" stopColor="#1d4ed8" />
              <stop offset="100%" stopColor="#172554" />
            </>
          )}
        </radialGradient>
        <linearGradient id={g3} x1="0%" y1="0%" x2="100%" y2="100%">
          {steel ? (
            <>
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </>
          )}
        </linearGradient>
        <filter id={fl} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M62 10 C58 22 54 32 56 40 L58 48"
        fill="none"
        stroke={`url(#${g3})`}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M58 14 C48 10 36 16 32 26 C28 34 32 42 40 46 C48 50 58 44 62 34 C64 26 62 18 58 14 Z"
        fill={`url(#${g3})`}
        opacity={0.85}
      />
      <ellipse cx="44" cy="68" rx="20" ry="18" fill={`url(#${g1})`} filter={`url(#${fl})`} />
      <ellipse
        cx="40"
        cy="64"
        rx="5"
        ry="3.5"
        fill="white"
        opacity={steel ? 0.18 : 0.28}
      />
      <ellipse cx="76" cy="72" rx="17" ry="16" fill={`url(#${g2})`} filter={`url(#${fl})`} />
      <ellipse
        cx="72"
        cy="68"
        rx="4"
        ry="3"
        fill="white"
        opacity={steel ? 0.16 : 0.25}
      />
      <ellipse cx="58" cy="78" rx="8" ry="7" fill={`url(#${g2})`} opacity={0.95} filter={`url(#${fl})`} />
    </svg>
  );
}
