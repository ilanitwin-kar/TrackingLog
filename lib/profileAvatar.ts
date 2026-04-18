const STORAGE_KEY = "cj-profile-avatar-data-url-v1";
const MAX_DATA_URL_LEN = 520_000;

export function loadProfileAvatarDataUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v || !v.startsWith("data:image/")) return null;
    return v;
  } catch {
    return null;
  }
}

export function saveProfileAvatarDataUrl(dataUrl: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (dataUrl == null || dataUrl === "") {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (!dataUrl.startsWith("data:image/") || dataUrl.length > MAX_DATA_URL_LEN) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, dataUrl);
  } catch {
    /* quota */
  }
}
