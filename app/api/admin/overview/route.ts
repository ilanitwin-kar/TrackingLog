import { NextResponse } from "next/server";
import { loadAdminOverview } from "@/lib/adminDataServer";
import { verifyAdminBearer } from "@/lib/adminAuthServer";

export async function GET(req: Request) {
  const v = await verifyAdminBearer(req);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: v.status });
  }
  try {
    const users = await loadAdminOverview();
    return NextResponse.json({ ok: true, users });
  } catch {
    return NextResponse.json({ ok: false, error: "firestore_failed" }, { status: 500 });
  }
}
