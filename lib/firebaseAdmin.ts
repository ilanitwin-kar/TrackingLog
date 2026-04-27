import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Firebase Admin — נדרש לאימות טוקנים, דף ניהול, איפוס סיסמה וכו'.
 *
 * סדר העדיפות לקריאת credentials:
 * 1. FIREBASE_SERVICE_ACCOUNT_JSON — מחרוזת JSON מלאה (שורה אחת)
 * 2. נתיב מפורש: FIREBASE_SERVICE_ACCOUNT_PATH / GOOGLE_APPLICATION_CREDENTIALS (יחסי או מוחלט)
 * 3. קובץ בשם firebase-service-account.json תחת כמה שורשים אפשריים (cwd + INIT_CWD של npm)
 */
let lastInitFailure: string | null = null;

export function getFirebaseAdminLastInitFailure(): string | null {
  return lastInitFailure;
}

function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

/** שורשים סבירים לפרויקט — לפעמים process.cwd() ב-next dev/turbo לא תואם לתיקיית האפליקציה */
function candidateProjectRoots(): string[] {
  const roots = new Set<string>();
  roots.add(process.cwd());
  const init = process.env.INIT_CWD?.trim();
  if (init) roots.add(init);
  return [...roots];
}

/** מנסה לפרסר JSON מתוך .env או קובץ למרות גרשיים חיצוניים או BOM */
function parseServiceAccountObject(raw: string): Record<string, unknown> | null {
  const trimmed = stripBom(raw.trim());
  const candidates: string[] = [trimmed];
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    candidates.push(trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n"));
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.type === "service_account" &&
        typeof parsed.private_key === "string" &&
        typeof parsed.client_email === "string"
      ) {
        return parsed;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function tryReadUtf8File(abs: string): string | null {
  const normalized = path.normalize(abs);
  if (!existsSync(normalized)) return null;
  try {
    return readFileSync(normalized, "utf8");
  } catch {
    return null;
  }
}

function resolveCredentialsRaw(): string | null {
  lastInitFailure = null;

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return inline;

  const explicitPaths = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim(),
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  ].filter((x): x is string => Boolean(x));

  for (const spec of explicitPaths) {
    const abs = path.isAbsolute(spec) ? spec : path.join(process.cwd(), spec);
    const content = tryReadUtf8File(abs);
    if (content) return content;
    for (const root of candidateProjectRoots()) {
      if (root === process.cwd()) continue;
      const alt = path.isAbsolute(spec) ? spec : path.join(root, spec);
      const c2 = tryReadUtf8File(alt);
      if (c2) return c2;
    }
  }

  const conventionalRel = [
    "firebase-service-account.json",
    path.join("secrets", "firebase-service-account.json"),
    path.join(".secrets", "firebase-service-account.json"),
  ];

  for (const root of candidateProjectRoots()) {
    for (const rel of conventionalRel) {
      const abs = path.join(root, rel);
      const content = tryReadUtf8File(abs);
      if (content) return content;
    }
  }

  lastInitFailure = `no_credentials_file (cwd=${process.cwd()} initCwd=${process.env.INIT_CWD ?? "—"})`;
  return null;
}

export function getFirebaseAdminApp(): App | null {
  const raw = resolveCredentialsRaw();
  if (!raw) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[firebase-admin]", lastInitFailure ?? "חסר credentials");
    }
    return null;
  }

  try {
    if (getApps().length > 0) return getApps()[0]!;
    const parsed = parseServiceAccountObject(raw);
    if (!parsed) {
      lastInitFailure = "invalid_service_account_json_parse_or_shape";
      if (process.env.NODE_ENV === "development") {
        console.error(
          "[firebase-admin] לא הצלחנו לפרסר את קובץ ה-Service Account (פורמט לא תקין).",
        );
      }
      return null;
    }
    return initializeApp({ credential: cert(parsed as Parameters<typeof cert>[0]) });
  } catch (e) {
    lastInitFailure = e instanceof Error ? e.message : "initialize_app_failed";
    if (process.env.NODE_ENV === "development") {
      console.error("[firebase-admin] initializeApp נכשל:", lastInitFailure);
    }
    return null;
  }
}

/** Firestore — תומך גם ב-database שאינו (default), למשל tracking-log */
export function getAdminFirestore(): Firestore | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  const dbId =
    (process.env.FIREBASE_FIRESTORE_DATABASE_ID ?? "").trim() ||
    (process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DB_ID ?? "").trim();
  try {
    return dbId ? getFirestore(app, dbId) : getFirestore(app);
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
