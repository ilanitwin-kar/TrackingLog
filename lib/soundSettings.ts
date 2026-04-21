const KEY = "cj_sound_effects_enabled_v1";

export function loadSoundEffectsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(KEY);
  if (v === null) return true;
  return v === "1" || v === "true";
}

export function saveSoundEffectsEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, on ? "1" : "0");
  window.dispatchEvent(new Event("cj-sound-settings-changed"));
}
