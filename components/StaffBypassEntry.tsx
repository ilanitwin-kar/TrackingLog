"use client";

import { useCallback, useState } from "react";
import {
  activateStaffBypass,
  isStaffUnlockConfigured,
} from "@/lib/localAuth";

export type StaffBypassLabels = {
  staffEntry: string;
  staffPinPrompt: string;
  staffPinWrong: string;
  staffNotConfigured: string;
  submitLabel: string;
  cancel: string;
};

/** טקסטים בעברית למסכים שאין בהם מחליף שפה (מפוצל / TDEE) */
export const STAFF_BYPASS_HE: StaffBypassLabels = {
  staffEntry: "כניסת מנהלת (קוד צוות)",
  staffPinPrompt: "קוד צוות",
  staffPinWrong: "קוד שגוי",
  staffNotConfigured:
    "קוד צוות לא הוגדר בבילד. הוסיפי NEXT_PUBLIC_STAFF_UNLOCK (לפחות 4 תווים) ופרסמו מחדש.",
  submitLabel: "כניסה",
  cancel: "ביטול",
};

type Theme = "welcome" | "pickDark";

type Props = {
  labels: StaffBypassLabels;
  onStaffSuccess: () => void;
  theme: Theme;
  dir?: "rtl" | "ltr";
  /** כשמועבר — הודעות (שגוי / לא מוגדר) דרך המסך האב, בלי טוסט כפול */
  onNotify?: (message: string) => void;
  /** עוטף את כפתור הצוות בלבד */
  className?: string;
};

export function StaffBypassEntry({
  labels,
  onStaffSuccess,
  theme,
  dir = "rtl",
  onNotify,
  className = "",
}: Props) {
  const [staffPinOpen, setStaffPinOpen] = useState(false);
  const [staffPinInput, setStaffPinInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback(
    (message: string) => {
      if (onNotify) onNotify(message);
      else {
        setToast(message);
        window.setTimeout(() => setToast(null), 4500);
      }
    },
    [onNotify],
  );

  const staffBtn =
    theme === "pickDark"
      ? "w-full rounded-xl border-2 border-dashed border-amber-200/70 bg-[#0c1222]/88 py-2.5 text-center text-xs font-bold text-amber-50 shadow-[0_4px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:text-sm"
      : "w-full rounded-xl border-2 border-dashed border-[var(--welcome-dev-border)] bg-[var(--welcome-dev-bg)] py-2.5 text-center text-sm font-semibold text-[var(--cherry)] sm:text-base";

  const toastClass =
    theme === "pickDark"
      ? "fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 z-[270] max-w-[min(100vw-1.5rem,24rem)] -translate-x-1/2 rounded-full bg-amber-100 px-4 py-2.5 text-center text-sm font-semibold text-[#0f172a] shadow-lg"
      : "fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 z-[270] max-w-[min(100vw-1.5rem,24rem)] -translate-x-1/2 rounded-full bg-[var(--stem-deep)] px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg";

  return (
    <>
      <div className={className}>
        <button type="button" onClick={() => {
            if (!isStaffUnlockConfigured()) {
              notify(labels.staffNotConfigured);
              return;
            }
            setStaffPinInput("");
            setStaffPinOpen(true);
          }} className={staffBtn}>
          {labels.staffEntry}
        </button>
      </div>

      {staffPinOpen && (
        <div
          className="fixed inset-0 z-[250] flex items-end justify-center bg-black/45 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-pin-title"
        >
          <div
            className={`w-full max-w-md rounded-2xl border-2 p-5 shadow-xl ${
              theme === "pickDark"
                ? "border-amber-200/40 bg-[#0f172a]/95 text-white backdrop-blur-md"
                : "glass-panel border-[var(--border-cherry-soft)]"
            }`}
            dir={dir}
          >
            <h2
              id="staff-pin-title"
              className={
                theme === "pickDark"
                  ? "text-lg font-extrabold text-amber-50"
                  : "panel-title-cherry text-lg"
              }
            >
              {labels.staffPinPrompt}
            </h2>
            <label className="mt-4 block">
              <input
                type="password"
                autoComplete="off"
                value={staffPinInput}
                onChange={(e) => setStaffPinInput(e.target.value)}
                className={
                  theme === "pickDark"
                    ? "mt-1 w-full rounded-xl border-2 border-amber-200/50 bg-[#1e293b] px-3 py-2.5 text-sm text-white"
                    : "input-luxury-search mt-1 w-full rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
                }
              />
            </label>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => {
                  if (!activateStaffBypass(staffPinInput.trim())) {
                    notify(labels.staffPinWrong);
                    return;
                  }
                  setStaffPinOpen(false);
                  setStaffPinInput("");
                  onStaffSuccess();
                }}
                className={
                  theme === "pickDark"
                    ? "flex-1 rounded-xl bg-amber-400 py-3 text-center text-sm font-bold text-[#0f172a]"
                    : "btn-stem flex-1 rounded-xl py-3 text-center text-sm font-bold"
                }
              >
                {labels.submitLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStaffPinOpen(false);
                  setStaffPinInput("");
                }}
                className={
                  theme === "pickDark"
                    ? "flex-1 rounded-xl border-2 border-amber-200/60 bg-transparent py-3 text-center text-sm font-bold text-amber-100"
                    : "btn-gold flex-1 rounded-xl py-3 text-center text-sm font-bold"
                }
              >
                {labels.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast ? (
        <div className={toastClass} role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
