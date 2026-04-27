"use client";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export type FirebaseAuthResult =
  | { ok: true; user: User }
  | { ok: false; code: string; messageHe: string };

function mapAuthError(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "כתובת האימייל לא תקינה.";
    case "auth/missing-email":
      return "נא להזין כתובת אימייל.";
    case "auth/missing-password":
      return "נא להזין סיסמה.";
    case "auth/weak-password":
      return "הסיסמה חלשה מדי. נסי לפחות 6 תווים.";
    case "auth/email-already-in-use":
      return "האימייל כבר בשימוש. נסי להתחבר במקום להירשם.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "אימייל או סיסמה שגויים.";
    case "auth/user-not-found":
      return "לא נמצא משתמש עם האימייל הזה.";
    case "auth/popup-blocked":
      return "הדפדפן חסם חלון. נסי שוב או התחברי דרך הפניה (Redirect).";
    case "auth/network-request-failed":
      return "בעיית רשת. בדקי את החיבור ונסי שוב.";
    case "auth/operation-not-allowed":
      return "שיטת התחברות לא מופעלת ב-Firebase. הפעילי Email/Password ו-Google בקונסולה.";
    case "auth/no_config":
      return "Firebase לא מוגדר. חסרים משתני סביבה של Firebase.";
    default:
      return "לא ניתן להתחבר כרגע. נסי שוב בעוד רגע.";
  }
}

function errResult(e: unknown): FirebaseAuthResult {
  const code =
    e &&
    typeof e === "object" &&
    "code" in e &&
    typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code
      : "unknown";
  return { ok: false, code, messageHe: mapAuthError(code) };
}

export function isFirebaseAuthAvailable(): boolean {
  return getFirebaseAuth() != null;
}

export function getFirebaseCurrentUser(): User | null {
  const auth = getFirebaseAuth();
  return auth?.currentUser ?? null;
}

export function onFirebaseAuthChanged(cb: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

export async function signupWithEmail(email: string, password: string): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, code: "auth/no_config", messageHe: mapAuthError("auth/no_config") };
  try {
    const res = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
    return { ok: true, user: res.user };
  } catch (e) {
    return errResult(e);
  }
}

export async function loginWithEmail(email: string, password: string): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, code: "auth/no_config", messageHe: mapAuthError("auth/no_config") };
  try {
    const res = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    return { ok: true, user: res.user };
  } catch (e) {
    return errResult(e);
  }
}

export async function loginWithGoogleRedirect(): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, code: "auth/no_config", messageHe: mapAuthError("auth/no_config") };
  try {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
    // Will continue after redirect; this return value is mostly for type symmetry.
    return { ok: true, user: auth.currentUser! };
  } catch (e) {
    return errResult(e);
  }
}

export async function consumeGoogleRedirectResult(): Promise<FirebaseAuthResult | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  try {
    const res = await getRedirectResult(auth);
    if (!res?.user) return null;
    return { ok: true, user: res.user };
  } catch (e) {
    return errResult(e);
  }
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return null;
  try {
    return await u.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export async function logoutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

