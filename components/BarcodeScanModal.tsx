"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId } from "react";

/** מודאל מידע בלבד — ללא מאגר חיצוני */
export function BarcodeScanModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[420] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby={titleId}
            className="glass-panel relative w-full max-w-md overflow-hidden p-5 shadow-2xl"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id={titleId}
                className="text-lg font-bold leading-tight text-[#333333]"
              >
                סריקת ברקוד
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border-2 border-[#fadadd] bg-white px-3 py-1.5 text-sm font-semibold text-[#333333] transition hover:bg-[#fadadd]/40"
              >
                סגירה
              </button>
            </div>
            <p className="text-sm leading-relaxed text-[#333333]/90">
              חיפוש לפי ברקוד דרך מאגר חיצוני הוסר. הזיני מזון מהמילון המקומי או
              חפשי בשדה החיפוש למעלה.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
