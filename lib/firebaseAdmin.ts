import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * Firebase Admin — נדרש ליצירת לינק איפוס סיסמה לשילוב עם Resend.
 * הגדרי ב-.env.local מחרוזת JSON של Service Account (מקונסולת Firebase → Project settings → Service accounts).
 */
export function getFirebaseAdminApp(): App | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    if (getApps().length > 0) return getApps()[0]!;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return initializeApp({ credential: cert(parsed as Parameters<typeof cert>[0]) });
  } catch {
    return null;
  }
}

export async function generateFirebasePasswordResetLink(
  email: string,
  continueUrl: string
): Promise<
  { ok: true; link: string } | { ok: false; error: string }
> {
  const app = getFirebaseAdminApp();
  if (!app) {
    return { ok: false, error: "no_admin" };
  }
  try {
    const link = await getAuth(app).generatePasswordResetLink(email.trim(), {
      url: continueUrl,
      handleCodeInApp: false,
    });
    return { ok: true, link };
  } catch (e: unknown) {
    const code =
      e &&
      typeof e === "object" &&
      "code" in e &&
      typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : "";
    if (code === "auth/user-not-found") {
      return { ok: false, error: "user-not-found" };
    }
    const msg = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: msg };
  }
}
