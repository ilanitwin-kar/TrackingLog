/**
 * דמויות בסגנון סקיצת עיפרון — קווים חיים והצללות קלות (למסך בחירת המסלול).
 * stroke ב־currentColor כדי להתאים לרקע כהה / בהיר.
 */
function PencilGrain({ id }: { id: string }) {
  return (
    <filter
      id={id}
      x="-25%"
      y="-25%"
      width="150%"
      height="150%"
      colorInterpolationFilters="sRGB"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.9"
        numOctaves="2"
        seed="2"
        result="n"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="n"
        scale="0.35"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  );
}

export function PickThemeFigureWoman({ className = "" }: { className?: string }) {
  const fid = "pf-w-pencil";
  return (
    <svg
      className={className}
      viewBox="0 0 64 108"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <PencilGrain id={fid} />
      </defs>
      <g
        filter={`url(#${fid})`}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* שיער — גלים רכים */}
        <path
          d="M18 36c2-14 10-22 22-22s18 9 20 22c-3-8-10-13-20-13s-18 5-22 13"
          strokeWidth={1.35}
          opacity={0.92}
        />
        <path
          d="M16 40c-2 12 0 24 4 34M48 38c2 10 1 22-2 32"
          strokeWidth={1.05}
          opacity={0.55}
        />
        <path
          d="M22 28c4-6 12-9 20-9s14 3 18 9"
          strokeWidth={0.85}
          opacity={0.45}
        />
        {/* פנים */}
        <path
          d="M24 34c0-6 5-11 14-11s14 5 14 11c0 8-6 14-14 14s-14-6-14-14z"
          strokeWidth={1.25}
          opacity={0.88}
        />
        <path
          d="M28 42q2 1 4 0M38 42q2 1 4 0"
          strokeWidth={0.75}
          opacity={0.5}
        />
        <path d="M32 48q2 2 4 0" strokeWidth={0.7} opacity={0.45} />
        {/* צוואר */}
        <path d="M30 56v6M36 56v6" strokeWidth={1} opacity={0.65} />
        {/* שמלה — קווי עיפרון רכים */}
        <path
          d="M24 62c-3 0-6 4-8 10c-2 8-3 18-4 28M40 62c3 0 6 4 8 10c2 8 3 18 4 28"
          strokeWidth={1.15}
          opacity={0.82}
        />
        <path
          d="M20 98c8 2 18 2 26 0"
          strokeWidth={1.05}
          opacity={0.72}
        />
        <path
          d="M22 68c6 3 14 3 20 0M19 82c10 4 18 4 28 0"
          strokeWidth={0.85}
          opacity={0.38}
        />
        <path
          d="M26 60c4 6 10 8 16 6"
          strokeWidth={1.1}
          opacity={0.78}
        />
        {/* גלופת עיפרון */}
        <path
          d="M33 70l5 16M29 74l-3 14"
          strokeWidth={0.6}
          opacity={0.34}
        />
      </g>
    </svg>
  );
}

export function PickThemeFigureMan({ className = "" }: { className?: string }) {
  const fid = "pf-m-pencil";
  return (
    <svg
      className={className}
      viewBox="0 0 64 108"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <PencilGrain id={fid} />
      </defs>
      <g
        filter={`url(#${fid})`}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* שיער / קו קצר */}
        <path
          d="M22 26c2-8 10-12 20-12s16 5 18 12c-4-5-11-8-18-8s-14 3-20 8"
          strokeWidth={1.2}
          opacity={0.9}
        />
        <path
          d="M24 24l4-4M34 20l2-3M42 22l5-2"
          strokeWidth={0.7}
          opacity={0.5}
        />
        {/* ראש */}
        <path
          d="M24 32c0-7 6-13 16-13s16 6 16 13c0 9-7 15-16 15s-16-6-16-15z"
          strokeWidth={1.25}
          opacity={0.88}
        />
        <path d="M28 40h3M37 40h3" strokeWidth={0.75} opacity={0.45} />
        <path d="M32 47h4" strokeWidth={0.7} opacity={0.4} />
        {/* צוואר */}
        <path d="M30 54v6M36 54v6" strokeWidth={1.05} opacity={0.7} />
        {/* כתפיים רחבות */}
        <path
          d="M14 62c6-4 14-6 22-6s16 2 22 6"
          strokeWidth={1.3}
          opacity={0.85}
        />
        <path
          d="M16 64l-3 28M50 64l4 28"
          strokeWidth={1.15}
          opacity={0.78}
        />
        <path
          d="M20 72c8 3 18 3 26 0"
          strokeWidth={0.95}
          opacity={0.42}
        />
        {/* מעטפת חולצה */}
        <path
          d="M22 68c2 6 8 10 18 10s14-4 16-10"
          strokeWidth={1.05}
          opacity={0.55}
        />
        {/* הצללה */}
        <path
          d="M36 70l5 20M28 74l-4 14"
          strokeWidth={0.65}
          opacity={0.32}
        />
      </g>
    </svg>
  );
}
