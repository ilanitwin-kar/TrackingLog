"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRandomMessage,
  type CelebrationMessageType,
} from "./celebrationMessages";

export type TriggerCelebrationArg =
  | CelebrationMessageType
  | { customMessage: string };

/** ~2.5s מלא, ~0.5s fade, ~3s סה״כ; מנקה טיימרים לפני טריגר חדש */
export function useCelebration() {
  const [showCelebration, setShowCelebration] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState("");
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCelebration = useCallback((arg: TriggerCelebrationArg) => {
    const msg =
      typeof arg === "object"
        ? arg.customMessage
        : getRandomMessage(arg);
    setCelebrationMessage(msg);
    setShowCelebration(true);
    setFadeOut(false);

    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

    fadeTimeoutRef.current = setTimeout(() => {
      setFadeOut(true);
      hideTimeoutRef.current = setTimeout(() => {
        setShowCelebration(false);
      }, 500);
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  return { showCelebration, fadeOut, celebrationMessage, triggerCelebration };
}
