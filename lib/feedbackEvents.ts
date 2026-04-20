import { dispatchAppToast } from "@/lib/appToast";

export const SOUND_SUCCESS_EVENT = "cj-sound-success";
export const SOUND_CLICK_EVENT = "cj-sound-click";

export function emitMealLoggedFeedback(message: string): void {
  dispatchAppToast(message);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SOUND_SUCCESS_EVENT));
  }
}

export function emitEntryDeletedFeedback(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SOUND_CLICK_EVENT));
  }
}
