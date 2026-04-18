"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { loadDictionary } from "@/lib/storage";

export function BarcodeScanModal({
  open,
  onClose,
  onApplyToHome,
}: {
  open: boolean;
  onClose: () => void;
  onApplyToHome: (name: string, note: string) => void;
}) {
  const titleId = useId();
  const [phase, setPhase] = useState<"scan" | "loading" | "result" | "error">(
    "scan"
  );
  const [resultName, setResultName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handledDecodeRef = useRef(false);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);

  const reset = useCallback(() => {
    setPhase("scan");
    setResultName(null);
    setErrorMessage(null);
    handledDecodeRef.current = false;
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open || phase !== "scan") return;
    let cancelled = false;

    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const html5 = new Html5Qrcode("barcode-reader-region", {
          verbose: false,
        });
        scannerRef.current = html5;

        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 }, aspectRatio: 1.777778 },
          async (decodedText) => {
            if (handledDecodeRef.current) return;
            const cleaned = decodedText.replace(/\s/g, "");
            if (!/^\d{8,14}$/.test(cleaned)) return;
            handledDecodeRef.current = true;
            setPhase("loading");
            try {
              await html5.stop();
            } catch {
              /* ignore */
            }
            try {
              await html5.clear();
            } catch {
              /* ignore */
            }
            scannerRef.current = null;

            try {
              const dict = loadDictionary();
              const hit = dict.find((d) => d.barcode === cleaned);
              if (hit?.food) {
                setResultName(hit.food);
                setPhase("result");
                return;
              }

              // Fallback: ask Gemini (best effort) to identify food by barcode.
              const res = await fetch("/api/gemini-food-analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: `ברקוד ${cleaned}` }),
              });
              const data = (await res.json()) as {
                result?: { name: string } | null;
              };
              if (!res.ok || !data.result?.name) {
                setErrorMessage("לא נמצא במאגר המקומי");
                setPhase("error");
                return;
              }
              setResultName(data.result.name);
              setPhase("result");
            } catch {
              setErrorMessage("בעיית רשת — נסי שוב");
              setPhase("error");
            }
          },
          () => {
            /* ignore */
          }
        );
      } catch {
        if (!cancelled) {
          setErrorMessage("לא ניתן להפעיל מצלמה — בדקי הרשאות דפדפן");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        void s.stop().catch(() => {});
        try {
          s.clear();
        } catch {
          /* ignore */
        }
      }
    };
  }, [open, phase]);

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
                className="panel-title-cherry text-lg leading-tight"
              >
                סריקת ברקוד
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--cherry)] transition hover:bg-[var(--cherry-muted)]"
              >
                סגירה
              </button>
            </div>
            {phase === "scan" && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--cherry)]/85">
                  כווני את הברקוד בתוך המסגרת — הסריקה מתבצעת אוטומטית.
                </p>
                <div
                  id="barcode-reader-region"
                  className="min-h-[220px] w-full overflow-hidden rounded-xl border-2 border-[var(--border-cherry-soft)] bg-black/5"
                />
              </div>
            )}

            {phase === "loading" && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <div
                  className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--border-cherry-soft)] border-t-[var(--cherry)]"
                  aria-hidden
                />
                <p className="text-sm font-medium text-[var(--cherry)]">
                  מחפשת במאגר המקומי…
                </p>
              </div>
            )}

            {phase === "result" && resultName && (
              <div className="space-y-4">
                <div className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white/90 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cherry)]/60">
                    מוצר
                  </p>
                  <p className="mt-1 text-base font-bold leading-snug text-[var(--cherry)]">
                    {resultName}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-stem w-full rounded-xl py-3 text-base font-bold"
                  onClick={() => {
                    onApplyToHome(resultName, "זוהה מסריקת ברקוד");
                    onClose();
                  }}
                >
                  השתמש במוצר בחיפוש
                </button>
              </div>
            )}

            {phase === "error" && errorMessage && (
              <div className="space-y-4 py-2">
                <p className="text-center text-sm leading-relaxed text-[var(--cherry)]">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  className="btn-gold w-full rounded-xl py-3 text-base font-semibold"
                  onClick={() => reset()}
                >
                  נסי שוב
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
