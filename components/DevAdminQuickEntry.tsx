"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  activateDevAdminBypass,
  activateDevAdminBypassNoPinWhenUiEnabled,
  activateDevAdminBypassWithPin,
  isDevAdminBypassUiEnabled,
  isDevAdminOneClickAllowed,
  isDevAdminPinConfigured,
  seedDevAdminProfileIfNeeded,
} from "@/lib/localAuth";
import { hasChosenAppVariant, setAppVariant } from "@/lib/appVariant";
import { loadProfile, markWelcomeLeft } from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";

const BTN_WELCOME =
  "w-full rounded-xl border-2 border-dashed border-[var(--welcome-dev-border)] bg-[var(--welcome-dev-bg)] py-2.5 text-center text-xs font-semibold text-[var(--cherry)]";

const BTN_PICK =
  "w-full rounded-xl border-2 border-dashed border-cyan-300/60 bg-[#0c1222]/88 py-2 text-center text-[11px] font-bold text-cyan-100 shadow-lg backdrop-blur-sm sm:text-xs";

const BTN_TDEE =
  "w-full rounded-xl border-2 border-dashed border-[var(--welcome-dev-border)] bg-[var(--welcome-dev-bg)] py-2 text-center text-xs font-semibold text-[var(--cherry)]";

type Variant = "welcome" | "pickDark" | "tdee";

/**
 * כניסת מנהלת — תמיד גלוי (נייד + דפדפן).
 * פיתוח / ALLOW=1: לחיצה אחת. פרודקשן: קוד מ־NEXT_PUBLIC_DEV_ADMIN_PIN או NEXT_PUBLIC_STAFF_UNLOCK.
 */
export function DevAdminQuickEntry({
  variant,
  buttonLabel = "כניסת מנהלת — דילוג על פרטים (פיתוח)",
}: {
  variant: Variant;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (!isDevAdminBypassUiEnabled()) return null;

  function finishEntry() {
    seedDevAdminProfileIfNeeded();
    if (variant === "pickDark" && !hasChosenAppVariant()) {
      setAppVariant("cherry");
    }
    markWelcomeLeft();
    router.replace("/");
  }

  function handleMainClick() {
    setErr(null);
    if (isDevAdminOneClickAllowed()) {
      seedDevAdminProfileIfNeeded();
      activateDevAdminBypass();
      finishEntry();
      return;
    }
    if (isDevAdminPinConfigured()) {
      setPin("");
      setPinOpen(true);
      return;
    }
    if (isDevAdminBypassUiEnabled()) {
      seedDevAdminProfileIfNeeded();
      activateDevAdminBypassNoPinWhenUiEnabled();
      finishEntry();
      return;
    }
    setErr(
      gf(loadProfile().gender, "הגישה המנהלתית לא זמינה כרגע.", "הגישה המנהלתית לא זמינה כרגע.")
    );
  }

  function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const ok = activateDevAdminBypassWithPin(pin.trim());
    if (ok) {
      setPinOpen(false);
      setPin("");
      finishEntry();
    } else {
      setErr("קוד שגוי או קצר מדי.");
    }
  }

  const btnClass =
    variant === "pickDark" ? BTN_PICK : variant === "tdee" ? BTN_TDEE : BTN_WELCOME;

  return (
    <>
      <button type="button" onClick={handleMainClick} className={btnClass}>
        {buttonLabel}
      </button>
      {err && (
        <p className="mt-2 text-center text-[11px] font-semibold text-white/80" dir="rtl">
          {err}
        </p>
      )}

      {pinOpen && (
        <div
          className="fixed inset-0 z-[260] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dev-admin-pin-title"
        >
          <form
            onSubmit={submitPin}
            className="glass-panel w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] p-5 shadow-xl"
            dir="rtl"
          >
            <h2
              id="dev-admin-pin-title"
              className="panel-title-cherry text-lg font-extrabold"
            >
              כניסת מנהלת
            </h2>
            <p className="mt-2 text-sm text-[var(--stem)]/90">
              {gf(loadProfile().gender, "הזיני קוד גישה.", "הזן קוד גישה.")}
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                קוד
              </span>
              <input
                type="password"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="input-luxury-search w-full rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
              />
            </label>
            {err && (
              <p className="mt-2 text-sm font-semibold text-red-700">{err}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-stem flex-1 rounded-xl py-2.5 text-sm font-bold"
                onClick={() => {
                  setPinOpen(false);
                  setErr(null);
                }}
              >
                ביטול
              </button>
              <button
                type="submit"
                className="btn-gold flex-1 rounded-xl py-2.5 text-sm font-bold"
              >
                כניסה
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
