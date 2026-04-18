"use client";

import { useId } from "react";

/** אייקון דובדבן — מותג האפליקציה */
export function CherryMark({ className = "" }: { className?: string }) {
  const rid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const idStem = `ch-stem-${rid}`;
  const idLeaf = `ch-leaf-${rid}`;
  const idBerry1 = `ch-berry1-${rid}`;
  const idBerry2 = `ch-berry2-${rid}`;
  const idGlow = `ch-glow-${rid}`;

  return (
    <svg
      className={className}
      viewBox="0 0 120 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={idStem} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5d8c3a" />
          <stop offset="100%" stopColor="#3d6b28" />
        </linearGradient>
        <linearGradient id={idLeaf} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7cb342" />
          <stop offset="100%" stopColor="#4a7c23" />
        </linearGradient>
        <radialGradient id={idBerry1} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ff6b7a" />
          <stop offset="45%" stopColor="#d81e3a" />
          <stop offset="100%" stopColor="#8b1028" />
        </radialGradient>
        <radialGradient id={idBerry2} cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor="#ff7585" />
          <stop offset="45%" stopColor="#c91835" />
          <stop offset="100%" stopColor="#7a0d22" />
        </radialGradient>
        <filter id={idGlow} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M58 8 C52 18 48 28 50 38 L54 48"
        fill="none"
        stroke={`url(#${idStem})`}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M52 12 C42 8 28 12 22 22 C18 28 20 36 28 40 C36 44 46 40 52 32 C54 28 54 20 52 12 Z"
        fill={`url(#${idLeaf})`}
        opacity={0.95}
      />
      <circle
        cx="42"
        cy="68"
        r="22"
        fill={`url(#${idBerry1})`}
        filter={`url(#${idGlow})`}
      />
      <ellipse cx="38" cy="62" rx="6" ry="4" fill="white" opacity={0.35} />
      <circle
        cx="78"
        cy="72"
        r="20"
        fill={`url(#${idBerry2})`}
        filter={`url(#${idGlow})`}
      />
      <ellipse cx="74" cy="66" rx="5" ry="3.5" fill="white" opacity={0.32} />
    </svg>
  );
}
