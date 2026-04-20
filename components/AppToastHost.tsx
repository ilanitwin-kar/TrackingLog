"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_TOAST_EVENT, type AppToastDetail } from "@/lib/appToast";

const SHOW_MS = 4000;
const FADE_MS = 420;

export function AppToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const hide1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hide1.current) clearTimeout(hide1.current);
    if (hide2.current) clearTimeout(hide2.current);
    hide1.current = null;
    hide2.current = null;
  }, []);

  const show = useCallback(
    (msg: string) => {
      clearTimers();
      setExiting(false);
      setMessage(msg);
      hide1.current = setTimeout(() => {
        setExiting(true);
        hide2.current = setTimeout(() => {
          setMessage(null);
          setExiting(false);
        }, FADE_MS);
      }, SHOW_MS);
    },
    [clearTimers]
  );

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<AppToastDetail>).detail;
      if (d?.message?.trim()) show(d.message.trim());
    };
    window.addEventListener(APP_TOAST_EVENT, onToast as EventListener);
    return () =>
      window.removeEventListener(APP_TOAST_EVENT, onToast as EventListener);
  }, [show]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [clearTimers]
  );

  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          key={message}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: exiting ? 0 : 1, y: exiting ? 6 : 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: exiting ? FADE_MS / 1000 : 0.22, ease: "easeOut" }}
          className="pointer-events-none fixed inset-x-0 z-[190] flex justify-center px-3 print:hidden"
          style={{
            bottom: "max(5.25rem, calc(4.75rem + env(safe-area-inset-bottom, 0px)))",
          }}
        >
          <div className="flex max-w-lg items-center gap-2 rounded-full border border-[var(--border-cherry-soft)] bg-white/95 px-4 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-600"
              aria-hidden
            >
              ✓
            </span>
            <p className="min-w-0 text-center text-[13px] font-semibold leading-snug text-[var(--stem)]">
              {message}
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
