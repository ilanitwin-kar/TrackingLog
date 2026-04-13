"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { loadDictionary } from "@/lib/storage";

type Phase = "scan" | "loading" | "result" | "error";

type ScanResult =
  | {
      kind: "local";
      barcode: string;
      name: string;
      caloriesPer100g?: number;
      proteinPer100g?: number;
      carbsPer100g?: number;
      fatPer100g?: number;
    }
  | {
      kind: "ai";
      barcode: string;
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };

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
  const [phase, setPhase] = useState<Phase>("scan");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handledDecodeRef = useRef(false);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  const reset = useCallback(() => {
    setPhase("scan");
    setResult(null);
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
        stopRef.current = async () => {
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
        };

        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 }, aspectRatio: 1.777778 },
          async (decodedText) => {
            if (handledDecodeRef.current) return;
            const cleaned = decodedText.replace(/\s/g, "");
            if (!/^\d{8,14}$/.test(cleaned)) return;
            handledDecodeRef.current = true;
            setPhase("loading");
            await stopRef.current?.();

            try {
              const dict = loadDictionary();
              const hit = dict.find((d) => d.barcode === cleaned);
              if (hit) {
                setResult({
                  kind: "local",
                  barcode: cleaned,
                  name: hit.food,
                  caloriesPer100g: hit.caloriesPer100g,
                  proteinPer100g: hit.proteinPer100g,
                  carbsPer100g: hit.carbsPer100g,
                  fatPer100g: hit.fatPer100g,
                });
                setPhase("result");
                return;
              }

              // Fallback: ask Gemini to identify/analyze by barcode (best effort).
              const res = await fetch("/api/gemini-food-analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: `ברקוד ${cleaned}` }),
              });
              const data = (await res.json()) as {
                result?: {
                  name: string;
                  calories: number;
                  protein: number;
                  carbs: number;
                  fat: number;
                } | null;
              };
              if (!res.ok || !data.result) {
                setErrorMessage("לא נמצא מוצר במאגר המקומי");
                setPhase("error");
                return;
              }
              setResult({ kind: "ai", barcode: cleaned, ...data.result });
              setPhase("result");
            } catch {
              setErrorMessage("בעיית רשת — נסי שוב");
              setPhase("error");
            }
          },
          () => {
            /* frame scan — ignore */
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
      void stopRef.current?.();
      stopRef.current = null;
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

            {phase === "scan" && (
              <div className="space-y-3">
                <p className="text-sm text-[#333333]/85">
                  כווני את הברקוד בתוך המסגרת — הסריקה מתבצעת אוטומטית.
                </p>
                <div
                  id="barcode-reader-region"
                  className="min-h-[220px] w-full overflow-hidden rounded-xl border-2 border-[#fadadd] bg-black/5"
                />
              </div>
            )}

            {phase === "loading" && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <div
                  className="h-10 w-10 animate-spin rounded-full border-2 border-[#fadadd] border-t-[#333333]"
                  aria-hidden
                />
                <p className="text-sm font-medium text-[#333333]">
                  מחפשת במאגר המקומי…
                </p>
              </div>
            )}

            {phase === "result" && result && (
              <div className="space-y-4">
                <div className="rounded-xl border-2 border-[#fadadd] bg-white/90 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#333333]/60">
                    מוצר
                  </p>
                  <p className="mt-1 text-base font-bold leading-snug text-[#333333]">
                    {result.name}
                  </p>
                  <p className="mt-2 text-xs text-[#333333]/65">
                    ברקוד {result.barcode}
                  </p>
                </div>

                <button
                  type="button"
                  className="btn-gold w-full rounded-xl py-3 text-base font-bold"
                  onClick={() => {
                    const note =
                      result.kind === "local"
                        ? "נמצא במילון האישי (ברקוד)"
                        : "זוהה ע״י AI (ברקוד)";
                    onApplyToHome(result.name, note);
                    onClose();
                  }}
                >
                  השתמש במוצר בחיפוש
                </button>
              </div>
            )}

            {phase === "error" && errorMessage && (
              <div className="space-y-4 py-2">
                <p className="text-center text-sm leading-relaxed text-[#333333]">
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
