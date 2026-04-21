"use client";

import useSound from "use-sound";
import { useEffect } from "react";
import { getAppVariant } from "@/lib/appVariant";
import { loadSoundEffectsEnabled } from "@/lib/soundSettings";
import { SOUND_CLICK_EVENT, SOUND_SUCCESS_EVENT } from "@/lib/feedbackEvents";

const SUCCESS_CHERRY = "/sounds/success-cherry.wav";
const SUCCESS_BLUE = "/sounds/success-blue.wav";
const CLICK = "/sounds/click.wav";

export function SoundFeedbackHost() {
  const [playCherry] = useSound(SUCCESS_CHERRY, {
    volume: 0.44,
    interrupt: true,
  });
  const [playBlue] = useSound(SUCCESS_BLUE, {
    volume: 0.38,
    interrupt: true,
  });
  const [playClick] = useSound(CLICK, {
    volume: 0.34,
    interrupt: true,
  });

  useEffect(() => {
    const onSuccess = () => {
      if (!loadSoundEffectsEnabled()) return;
      const v = getAppVariant() ?? "cherry";
      if (v === "blueberry") void playBlue();
      else void playCherry();
    };
    const onClick = () => {
      if (!loadSoundEffectsEnabled()) return;
      void playClick();
    };
    window.addEventListener(SOUND_SUCCESS_EVENT, onSuccess);
    window.addEventListener(SOUND_CLICK_EVENT, onClick);
    return () => {
      window.removeEventListener(SOUND_SUCCESS_EVENT, onSuccess);
      window.removeEventListener(SOUND_CLICK_EVENT, onClick);
    };
  }, [playBlue, playCherry, playClick]);

  return null;
}
