export const APP_TOAST_EVENT = "cj-app-toast";

export type AppToastDetail = { message: string };

/** Thin bottom toast (see AppToastHost). Safe from any client code. */
export function dispatchAppToast(message: string): void {
  if (typeof window === "undefined") return;
  const t = message.trim();
  if (!t) return;
  window.dispatchEvent(
    new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail: { message: t } })
  );
}
