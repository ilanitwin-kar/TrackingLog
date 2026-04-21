import { NextResponse } from "next/server";
import {
  sendWelcomeEmail,
  type EmailGender,
} from "@/lib/emailResend";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: { email?: unknown; gender?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; gender?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const gender: EmailGender = body.gender === "male" ? "male" : "female";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const r = await sendWelcomeEmail(email, gender);
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error },
      { status: r.error.includes("לא מוגדר") ? 503 : 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
