export const APP_VARIANT_STORAGE_KEY = "cj_app_variant_v1";

export type AppVariant = "cherry" | "blueberry";

export function getAppVariant(): AppVariant | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(APP_VARIANT_STORAGE_KEY);
  if (raw === "blueberry" || raw === "cherry") return raw;
  return null;
}

export function hasChosenAppVariant(): boolean {
  return getAppVariant() !== null;
}

export function applyAppVariantToDocument(v: AppVariant): void {
  document.documentElement.setAttribute("data-app-theme", v);
}

/** שמירה חד־פעמית — אחרי בחירה במסך הפתיחה */
export function setAppVariant(v: AppVariant): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(APP_VARIANT_STORAGE_KEY, v);
  applyAppVariantToDocument(v);
  window.dispatchEvent(new Event("cj-app-variant-changed"));
}

/** איפוס בחירת מסלול — למנהלת / פיתוח; חוזרים למסך המפוצל */
export function clearAppVariant(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(APP_VARIANT_STORAGE_KEY);
  applyAppVariantToDocument("cherry");
  window.dispatchEvent(new Event("cj-app-variant-changed"));
}

export function getBrandName(v: AppVariant): string {
  return v === "blueberry" ? "BLUE" : "Cherry";
}
