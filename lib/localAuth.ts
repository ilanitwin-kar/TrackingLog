"use client";

import {
  isRegistrationComplete,
  loadProfile,
  saveProfile,
  type UserProfile,
} from "@/lib/storage";

const AUTH_KEY = "cj_local_auth_v1";
const SESSION_KEY = "cj_session_v1";
/** רק ב־development — דילוג על שער ההתחברות לפיתוח */
export const DEV_ADMIN_BYPASS_KEY = "cj_dev_admin_session_v1";
/** פרודקשן: אחרי הזנת קוד צוות (מ־NEXT_PUBLIC_STAFF_UNLOCK בבילד) */
const STAFF_BYPASS_KEY = "cj_staff_bypass_v1";

const PEPPER = "cj_local_pw_v1";

function dispatchAuthChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cj-auth-changed"));
}

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(emailNorm: string, password: string): Promise<string> {
  return sha256Hex(`${PEPPER}:${emailNorm}:${password}`);
}

export type AuthRecord = {
  email: string;
  passwordHash: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function loadAuthRecord(): AuthRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthRecord>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.passwordHash !== "string"
    ) {
      return null;
    }
    return { email: parsed.email, passwordHash: parsed.passwordHash };
  } catch {
    return null;
  }
}

function saveAuthRecord(record: AuthRecord): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(record));
}

export function hasAuthRecord(): boolean {
  return loadAuthRecord() !== null;
}

export function isSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SESSION_KEY) === "1";
}

export function startSession(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, "1");
  dispatchAuthChanged();
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  dispatchAuthChanged();
}

export function clearAuthCompletely(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
  clearSession();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: "email" | "short" | "exists" };

export async function registerAccount(
  email: string,
  password: string,
): Promise<RegisterResult> {
  const n = normalizeEmail(email);
  if (!EMAIL_RE.test(n)) return { ok: false, error: "email" };
  if (password.length < 6) return { ok: false, error: "short" };
  if (loadAuthRecord()) return { ok: false, error: "exists" };
  const passwordHash = await hashPassword(n, password);
  saveAuthRecord({ email: n, passwordHash });
  const p = loadProfile();
  const wasComplete = isRegistrationComplete({ ...p, email: n });
  saveProfile({
    ...p,
    email: n,
    onboardingComplete: wasComplete ? true : false,
  });
  return { ok: true };
}

export async function verifyLogin(email: string, password: string): Promise<boolean> {
  const auth = loadAuthRecord();
  if (!auth) return false;
  const n = normalizeEmail(email);
  if (auth.email !== n) return false;
  const h = await hashPassword(n, password);
  return h === auth.passwordHash;
}

/** ערכים שמפעילים דילוג בלחיצה אחת (ב-Netlify / .env) */
function isPublicEnvTruthy(name: string): boolean {
  const v = process.env[name];
  if (typeof v !== "string") return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

/** כניסה בלחיצה אחת — רק בפיתוח או כש־NEXT_PUBLIC_ALLOW_DEV_ADMIN_BYPASS=1 */
export function isDevAdminOneClickAllowed(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return isPublicEnvTruthy("NEXT_PUBLIC_ALLOW_DEV_ADMIN_BYPASS");
}

/**
 * האם להציג בממשק כפתור «כניסת מנהלת».
 * ברירת מחדל: מוסתר בפרודקשן כדי לא להציג "מסך קוד" למשתמשי קצה.
 * להפעלה: NEXT_PUBLIC_SHOW_DEV_ADMIN_BYPASS_UI=1
 */
export function isDevAdminBypassUiEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_SHOW_DEV_ADMIN_BYPASS_UI === "1";
}

/** האם הוגדר קוד בבילד לכניסה עם PIN בפרודקשן */
export function isDevAdminPinConfigured(): boolean {
  const a = process.env.NEXT_PUBLIC_DEV_ADMIN_PIN?.trim() ?? "";
  const b = process.env.NEXT_PUBLIC_STAFF_UNLOCK?.trim() ?? "";
  return a.length >= 4 || b.length >= 4;
}

export function devAdminPinUnlocks(pin: string): boolean {
  const p = pin.trim();
  if (p.length < 4) return false;
  const a = process.env.NEXT_PUBLIC_DEV_ADMIN_PIN?.trim() ?? "";
  const b = process.env.NEXT_PUBLIC_STAFF_UNLOCK?.trim() ?? "";
  if (a.length >= 4 && p === a) return true;
  if (b.length >= 4 && p === b) return true;
  return false;
}

/**
 * כניסת מנהלת אחרי אימות קוד (פרודקשן).
 * @returns האם הופעל דילוג
 */
export function activateDevAdminBypassWithPin(pin: string): boolean {
  if (typeof window === "undefined") return false;
  if (!devAdminPinUnlocks(pin)) return false;
  localStorage.setItem(DEV_ADMIN_BYPASS_KEY, "1");
  startSession();
  return true;
}

/** דילוג מנהלת פעיל — כמו צוות, לפי דגל ב־localStorage בלבד */
export function isDevAdminBypassActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEV_ADMIN_BYPASS_KEY) === "1";
}

/** האם הוגדר קוד צוות בבילד (Netlify / .env) — מאפשר כניסת מנהלת בנייד בלי dev */
export function isStaffUnlockConfigured(): boolean {
  const s = process.env.NEXT_PUBLIC_STAFF_UNLOCK;
  return typeof s === "string" && s.length >= 4;
}

/**
 * האם להציג בממשק כפתור «כניסת צוות» (מסכי onboarding).
 * בפרודקשן מוסתר כברירת מחדל — משתמשי קצה נכנסים בהרשמה/התחברות רגילה בלי קוד.
 * להפעלה ב-Netlify: NEXT_PUBLIC_SHOW_STAFF_BYPASS_UI=1 (בנוסף ל-NEXT_PUBLIC_STAFF_UNLOCK).
 */
export function isStaffBypassUiEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_SHOW_STAFF_BYPASS_UI === "1";
}

/** דילוג צוות בפרודקשן — נשמר ב־localStorage עד «התחלה מחדש» */
export function isStaffBypassActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STAFF_BYPASS_KEY) === "1";
}

/** דילוג פנימי: פיתוח או צוות */
export function isInternalAuthBypassActive(): boolean {
  return isDevAdminBypassActive() || isStaffBypassActive();
}

/** חזרה אוטומטית ממסך הכניסה כשכבר נכנסת (סשן או דילוג פנימי) */
export function hasWelcomeAutoResume(): boolean {
  return isSessionActive() || isInternalAuthBypassActive();
}

/**
 * הזנת קוד צוות — רק אם NEXT_PUBLIC_STAFF_UNLOCK הוגדר בבילד.
 * @returns האם הוקם דילוג
 */
export function activateStaffBypass(pin: string): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaffUnlockConfigured()) return false;
  if (pin !== process.env.NEXT_PUBLIC_STAFF_UNLOCK) return false;
  localStorage.setItem(STAFF_BYPASS_KEY, "1");
  startSession();
  return true;
}

export function clearStaffBypass(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STAFF_BYPASS_KEY);
  dispatchAuthChanged();
}

/** כניסה בלחיצה אחת — רק בפיתוח או כש־ALLOW מופעל בבילד */
export function activateDevAdminBypass(): void {
  if (typeof window === "undefined") return;
  if (!isDevAdminOneClickAllowed()) return;
  localStorage.setItem(DEV_ADMIN_BYPASS_KEY, "1");
  startSession();
}

/**
 * נייד בפרודקשן: כשהכפתור מוצג (SHOW) ואין PIN בבילד — כניסה בלי הקלדת קוד.
 * אם הוגדר PIN/צוות — חייבים להשתמש ב־activateDevAdminBypassWithPin.
 */
export function activateDevAdminBypassNoPinWhenUiEnabled(): void {
  if (typeof window === "undefined") return;
  if (!isDevAdminBypassUiEnabled()) return;
  if (isDevAdminPinConfigured()) return;
  if (isDevAdminOneClickAllowed()) {
    activateDevAdminBypass();
    return;
  }
  localStorage.setItem(DEV_ADMIN_BYPASS_KEY, "1");
  startSession();
}

export function clearDevAdminBypass(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEV_ADMIN_BYPASS_KEY);
  dispatchAuthChanged();
}

/** מילוי פרופיל לדילוג פנימי — בלי דרישת dev (לצוות בפרודקשן) */
export function seedBypassProfileIfNeeded(): void {
  if (typeof window === "undefined") return;
  const p = loadProfile();
  if (isRegistrationComplete(p)) return;
  const next: UserProfile = {
    ...p,
    email: p.email.trim() || "dev@cherry.local",
    firstName: p.firstName.trim() || "מנהלת",
    gender: p.gender ?? "female",
    age: p.age >= 12 && p.age <= 120 ? p.age : 30,
    heightCm: p.heightCm >= 100 && p.heightCm <= 230 ? p.heightCm : 165,
    weightKg: p.weightKg >= 30 && p.weightKg <= 250 ? p.weightKg : 70,
    goalWeightKg:
      p.goalWeightKg >= 30 && p.goalWeightKg <= 250 ? p.goalWeightKg : 62,
    deficit: p.deficit >= 100 && p.deficit <= 1500 ? p.deficit : 500,
    activity: p.activity ?? "light",
    onboardingComplete: true,
  };
  saveProfile(next);
  window.dispatchEvent(new Event("cj-profile-updated"));
}

/** מילוי פרופיל לדילוג מנהלת — גם בפרודקשן (אחרי PIN / ALLOW) */
export function seedDevAdminProfileIfNeeded(): void {
  seedBypassProfileIfNeeded();
}
