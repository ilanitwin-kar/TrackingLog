/** דמויות וקטור מינימליסטיות — ליד סימול הפרי במסך בחירת המסלול */
export function PickThemeFigureWoman({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 82"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M24 0c-3.8 0-7.2 2.2-8.7 5.5 2.4-1.4 5.2-2.2 8.2-2.2 3.4 0 6.6 1 9.2 2.7C31.2 2.2 27.8 0 24 0Z"
        opacity={0.98}
      />
      <circle cx="24" cy="17" r="10.5" opacity={0.96} />
      <path d="M24 28 L8 46 L5 78 h38 L40 46 Z" opacity={0.94} />
    </svg>
  );
}

export function PickThemeFigureMan({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 82"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="9" y="1" width="30" height="14" rx="7" opacity={0.98} />
      <circle cx="24" cy="20" r="10" opacity={0.96} />
      <path
        d="M24 30 L9 38 L5.5 80.5 h37 L39 38 Z"
        opacity={0.94}
      />
    </svg>
  );
}
