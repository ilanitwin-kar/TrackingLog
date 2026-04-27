import { getAuth } from "firebase-admin/auth";
import { ADMIN_EMAIL } from "@/lib/adminConstants";
import { getFirebaseAdminApp } from "@/lib/firebaseAdmin";

export type AdminVerifyResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; status: number; error: string };

export async function verifyAdminBearer(req: Request): Promise<AdminVerifyResult> {
  const app = getFirebaseAdminApp();
  if (!app) {
    return { ok: false, status: 503, error: "server_admin_not_configured" };
  }
  const authz = req.headers.get("authorization") ?? "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]?.trim()) {
    return { ok: false, status: 401, error: "missing_bearer" };
  }
  try {
    const decoded = await getAuth(app).verifyIdToken(m[1]!.trim());
    const email = (decoded.email ?? "").trim().toLowerCase();
    if (!email || email !== ADMIN_EMAIL.toLowerCase()) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return { ok: true, uid: decoded.uid, email };
  } catch {
    return { ok: false, status: 401, error: "invalid_token" };
  }
}
