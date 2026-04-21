import { NextResponse } from "next/server";
import {
  getResendClient,
  sendPasswordResetEmailResend,
  type EmailGender,
} from "@/lib/emailResend";
import { generateFirebasePasswordResetLink } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: {
    email?: unknown;
    gender?: unknown;
    continueUrl?: unknown;
  };
  try {
    body = (await req.json()) as {
      email?: unknown;
      gender?: unknown;
      continueUrl?: unknown;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const gender: EmailGender = body.gender === "male" ? "male" : "female";
  const continueUrl =
    typeof body.continueUrl === "string" ? body.continueUrl.trim() : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  if (!continueUrl.startsWith("http://") && !continueUrl.startsWith("https://")) {
    return NextResponse.json(
      { ok: false, error: "invalid_continue" },
      { status: 400 }
    );
  }

  if (!getResendClient()) {
    return NextResponse.json(
      { ok: false, fallback: true, reason: "no_resend" },
      { status: 200 }
    );
  }

  const linkR = await generateFirebasePasswordResetLink(email, continueUrl);
  if (!linkR.ok) {
    if (linkR.error === "user-not-found") {
      return NextResponse.json(
        { ok: false, error: "user-not-found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { ok: false, fallback: true, reason: "no_admin", detail: linkR.error },
      { status: 200 }
    );
  }

  const sendR = await sendPasswordResetEmailResend(email, gender, linkR.link);
  if (!sendR.ok) {
    return NextResponse.json(
      { ok: false, error: sendR.error, fallback: true, reason: "resend_failed" },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}
