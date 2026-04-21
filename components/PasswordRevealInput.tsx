"use client";

import { useId, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  className?: string;
  disabled?: boolean;
  minLength?: number;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
};

export function PasswordRevealInput({
  value,
  onChange,
  autoComplete,
  className = "",
  disabled,
  minLength,
  required,
  inputMode,
}: Props) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        minLength={minLength}
        required={required}
        inputMode={inputMode}
        className={`${className} w-full pe-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setShow((s) => !s)}
        className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-[var(--border-cherry-soft)] bg-white/90 text-base text-[var(--stem)] shadow-sm transition hover:bg-[var(--cherry-muted)] disabled:opacity-40"
        aria-label={show ? "הסתר סיסמה" : "הצג סיסמה"}
        aria-pressed={show}
      >
        <span aria-hidden>{show ? "🙈" : "👁️"}</span>
      </button>
    </div>
  );
}
