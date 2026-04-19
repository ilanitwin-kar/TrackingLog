/**
 * Vector hero illustrations for the SelectPath (PickTheme) screen.
 * Full-body, elegant characters with soft gradients for a premium look.
 */
export function SelectPathManVector({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient
          id="m-glow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(120 150) rotate(90) scale(155 135)"
        >
          <stop stopColor="#93c5fd" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#2563eb" stopOpacity="0.08" />
          <stop offset="1" stopColor="#001F3F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="m-suit" x1="58" y1="120" x2="186" y2="300">
          <stop offset="0" stopColor="#f8fafc" stopOpacity="0.92" />
          <stop offset="0.35" stopColor="#cbd5e1" stopOpacity="0.5" />
          <stop offset="1" stopColor="#1e3a8a" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="m-shirt" x1="86" y1="150" x2="154" y2="250">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#93c5fd" stopOpacity="0.2" />
        </linearGradient>
        <filter id="m-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Aura */}
      <ellipse cx="120" cy="165" rx="108" ry="138" fill="url(#m-glow)" />

      {/* Head (more human proportion) */}
      <path
        d="M120 50c-19 0-34 16-34 35 0 21 15 38 34 38s34-17 34-38c0-19-15-35-34-35Z"
        fill="#ffffff"
        opacity="0.85"
        filter="url(#m-soft)"
      />
      {/* Hair */}
      <path
        d="M90 86c2-22 18-36 30-36 16 0 30 12 34 30-6-6-16-12-34-12-16 0-26 6-30 18Z"
        fill="#0b1020"
        opacity="0.22"
      />
      {/* Neck */}
      <path
        d="M108 122c5 10 10 14 12 15s9-5 12-15v18c0 8-7 14-12 14s-12-6-12-14v-18Z"
        fill="#ffffff"
        opacity="0.75"
      />

      {/* Jacket (V-shape) */}
      <path
        d="M64 168c16-18 34-27 56-27s40 9 56 27c9 10 14 23 14 40v42c0 10-8 18-18 18H68c-10 0-18-8-18-18v-42c0-17 5-30 14-40Z"
        fill="url(#m-suit)"
        opacity="0.92"
      />
      <path
        d="M92 162c8 20 14 30 28 38 14-8 20-18 28-38 10 7 16 16 18 26-10 24-24 42-46 52-22-10-36-28-46-52 2-10 8-19 18-26Z"
        fill="url(#m-shirt)"
        opacity="0.85"
      />
      {/* Arms */}
      <path
        d="M54 206c1-16 10-26 26-32l8 78c-16-4-30-18-34-46Z"
        fill="url(#m-suit)"
        opacity="0.8"
      />
      <path
        d="M186 206c-1-16-10-26-26-32l-8 78c16-4 30-18 34-46Z"
        fill="url(#m-suit)"
        opacity="0.8"
      />
      {/* Pants */}
      <path
        d="M90 250c6-10 16-15 30-15s24 5 30 15l10 58c-14 8-26 12-40 12s-26-4-40-12l10-58Z"
        fill="#0b1020"
        opacity="0.18"
      />
    </svg>
  );
}

export function SelectPathWomanVector({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient
          id="w-glow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(120 160) rotate(90) scale(155 135)"
        >
          <stop stopColor="#fecdd3" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fb7185" stopOpacity="0.1" />
          <stop offset="1" stopColor="#C2185B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="w-dress" x1="66" y1="120" x2="190" y2="312">
          <stop offset="0" stopColor="#fff1f2" stopOpacity="0.92" />
          <stop offset="0.45" stopColor="#fda4af" stopOpacity="0.5" />
          <stop offset="1" stopColor="#881337" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="w-top" x1="92" y1="150" x2="156" y2="240">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fecdd3" stopOpacity="0.2" />
        </linearGradient>
        <filter id="w-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Aura */}
      <ellipse cx="120" cy="172" rx="108" ry="138" fill="url(#w-glow)" />

      {/* Head */}
      <path
        d="M120 50c-19 0-34 16-34 35 0 21 15 38 34 38s34-17 34-38c0-19-15-35-34-35Z"
        fill="#ffffff"
        opacity="0.86"
        filter="url(#w-soft)"
      />
      {/* Hair (fuller, not transparent) */}
      <path
        d="M84 94c0-26 18-44 36-44 22 0 40 18 40 42 0 10-3 20-9 28-4-16-18-28-38-28-18 0-32 8-38 20-1-6-1-12-1-18Z"
        fill="#5a0b1c"
        opacity="0.55"
      />
      {/* Neck */}
      <path
        d="M108 122c5 10 10 14 12 15s9-5 12-15v18c0 8-7 14-12 14s-12-6-12-14v-18Z"
        fill="#ffffff"
        opacity="0.76"
      />

      {/* Dress */}
      <path
        d="M70 168c14-18 30-27 50-27s36 9 50 27c9 12 13 26 13 44v40c0 10-8 18-18 18H75c-10 0-18-8-18-18v-40c0-18 4-32 13-44Z"
        fill="url(#w-dress)"
        opacity="0.94"
      />
      <path
        d="M96 162c6 18 12 28 24 36 12-8 18-18 24-36 10 6 16 15 18 25-8 22-20 38-42 48-22-10-34-26-42-48 2-10 8-19 18-25Z"
        fill="url(#w-top)"
        opacity="0.86"
      />

      {/* Arms */}
      <path
        d="M58 210c2-16 12-28 28-34l2 78c-16-4-30-18-30-44Z"
        fill="url(#w-dress)"
        opacity="0.82"
      />
      <path
        d="M182 210c-2-16-12-28-28-34l-2 78c16-4 30-18 30-44Z"
        fill="url(#w-dress)"
        opacity="0.82"
      />

      {/* Skirt/legs */}
      <path
        d="M78 252c10-12 24-18 42-18s32 6 42 18l16 60c-18 10-36 16-58 16s-40-6-58-16l16-60Z"
        fill="#5a0b1c"
        opacity="0.16"
      />
    </svg>
  );
}

