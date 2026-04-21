"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export type FirebasePasswordResetResult =
  | { ok: true }
  | { ok: false; code: string; messageHe: string };

export function isFirebasePasswordResetAvailable(): boolean {
  return getFirebaseAuth() != null;
}

function mapFirebaseAuthErrorToHebrew(code: string): string {
  switch (code) {
    case "auth/user-not-found":
      return "לא נמצא משתמש עם האימייל הזה במערכת.";
    case "auth/invalid-email":
      return "כתובת האימייל לא תקינה.";
    case "auth/missing-email":
      return "נא להזין כתובת אימייל.";
    case "auth/too-many-requests":
      return "יותר מדי ניסיונות. נסי שוב בעוד כמה דקות.";
    case "auth/network-request-failed":
      return "בעיית רשת. בדקי את החיבור ונסי שוב.";
    case "auth/no_config":
      return "שירות האימות לא זמין. ודאי שמשתני Firebase מוגדרים.";
    case "auth/invalid-continue-uri":
    case "auth/unauthorized-continue-uri":
      return "כתובת ההמשך לא מאושרת ב-Firebase. פני למנהלת המערכת.";
    default:
      return "לא ניתן לשלוח כרגע. נסי שוב מאוחר יותר.";
  }
}

/**
 * מנסה קודם API שרת (Resend + לינק מ-Firebase Admin); אם אין הגדרה — Firebase מהדפדפן.
 */
export async function sendPasswordResetEmailSmart(
  email: string,
  gender: "male" | "female"
): Promise<FirebasePasswordResetResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "auth/missing-email",
      messageHe: mapFirebaseAuthErrorToHebrew("auth/missing-email"),
    };
  }
  const continueUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/welcome`
      : "";
  if (!continueUrl) {
    return sendFirebasePasswordResetLink(trimmed);
  }
  try {
    const res = await fetch("/api/email/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: trimmed,
        gender,
        continueUrl,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      fallback?: boolean;
      error?: string;
    };

    if (data.ok) {
      return { ok: true };
    }
    if (res.status === 404 || data.error === "user-not-found") {
      return {
        ok: false,
        code: "auth/user-not-found",
        messageHe: mapFirebaseAuthErrorToHebrew("auth/user-not-found"),
      };
    }
    if (data.fallback) {
      return sendFirebasePasswordResetLink(trimmed);
    }
    return {
      ok: false,
      code: "api",
      messageHe:
        typeof data.error === "string" && data.error.length > 0
          ? data.error
          : mapFirebaseAuthErrorToHebrew("unknown"),
    };
  } catch {
    return sendFirebasePasswordResetLink(trimmed);
  }
}

/**
 * שולח מייל איפוס סיסמה דרך Firebase Authentication (ספק Email/Password) — גיבוי כשאין Resend/Admin.
 * יש להגדיר בקונסולת Firebase את Authorized domains לכתובת האתר.
 */
export async function sendFirebasePasswordResetLink(
  email: string
): Promise<FirebasePasswordResetResult> {
  const auth = getFirebaseAuth();
  if (!auth) {
    return {
      ok: false,
      code: "auth/no_config",
      messageHe: mapFirebaseAuthErrorToHebrew("auth/no_config"),
    };
  }
  const trimmed = email.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "auth/missing-email",
      messageHe: mapFirebaseAuthErrorToHebrew("auth/missing-email"),
    };
  }
  try {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/welcome`
        : undefined;
    await sendPasswordResetEmail(
      auth,
      trimmed,
      url ? { url, handleCodeInApp: false } : undefined
    );
    return { ok: true };
  } catch (e: unknown) {
    const code =
      e &&
      typeof e === "object" &&
      "code" in e &&
      typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : "unknown";
    return { ok: false, code, messageHe: mapFirebaseAuthErrorToHebrew(code) };
  }
}
