"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PasswordRevealInput } from "@/components/PasswordRevealInput";
import {
  isFirebasePasswordResetAvailable,
  sendPasswordResetEmailSmart,
} from "@/lib/firebasePasswordReset";
import { getAppVariant } from "@/lib/appVariant";
import { hasAuthRecord, resetLocalPassword } from "@/lib/localAuth";
import { isRegistrationComplete, loadProfile } from "@/lib/storage";

type LocalGate = "loading" | "form" | "none";

function ForgotPasswordFooter({ v }: { v: string }) {
  return (
    <div className="mt-auto pt-12 text-center text-[10px] text-[var(--text)]/45">
      Cherry v{v}
    </div>
  );
}

function FirebaseResetFlow({ v }: { v: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const pe = loadProfile().email?.trim();
    if (pe) setEmail(pe);
  }, []);

  function resolveGenderForEmail(): "male" | "female" {
    const g = loadProfile().gender;
    if (g === "male" || g === "female") return g;
    return getAppVariant() === "blueberry" ? "male" : "female";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await sendPasswordResetEmailSmart(email, resolveGenderForEmail());
      if (!r.ok) {
        setErr(r.messageHe);
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="heading-page mt-8 text-2xl">איפוס סיסמה</h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text)]/90">
        נשלח אליך מייל עם לינק לאיפוס סיסמה (מ־Cherry 🍒 או Blueberry 🫐 לפי
        המסלול). האימייל חייב להיות רשום ב־Firebase (אימייל וסיסמה).
      </p>

      {sent ? (
        <div className="mt-6 space-y-4">
          <p
            className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-semibold text-[var(--stem)]"
            role="status"
          >
            לינק לאיפוס סיסמה נשלח למייל שלך.
          </p>
          <Link
            href="/welcome"
            className="btn-stem block w-full rounded-xl py-3 text-center text-sm font-bold"
          >
            חזרה למסך הכניסה
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
              אימייל
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-luxury-search w-full rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
              required
            />
          </label>
          {err ? (
            <p className="text-sm font-medium text-[var(--cherry)]" role="alert">
              {err}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="btn-stem w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
          >
            {busy ? "שולחים…" : "שלחי לינק לאיפוס"}
          </button>
        </form>
      )}
      <ForgotPasswordFooter v={v} />
    </>
  );
}

function LocalResetFlow({ v }: { v: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [gate, setGate] = useState<LocalGate>("loading");

  useEffect(() => {
    const auth = hasAuthRecord();
    const profile = loadProfile();
    const complete = isRegistrationComplete(profile);
    if (auth || complete) {
      setGate("form");
      const pe = profile.email?.trim();
      if (pe) setEmail(pe);
    } else {
      setGate("none");
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.trim() !== pw2.trim()) {
      setErr("הסיסמאות אינן תואמות");
      return;
    }
    setBusy(true);
    try {
      const r = await resetLocalPassword(email, pw);
      if (!r.ok) {
        if (r.error === "no_account") {
          setErr(
            "לא נמצא פרופיל מלא במכשיר. יש להירשם ממסך הכניסה, או להשלים פרטים במסך ההרשמה."
          );
        } else if (r.error === "email") {
          setErr(
            "האימייל לא תואם לחשבון או לפרופיל השמורים במכשיר. ודאי שזה אותו אימייל."
          );
        } else {
          setErr("הסיסמה חייבת להכיל לפחות 6 תווים");
        }
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="heading-page mt-8 text-2xl">איפוס סיסמה</h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text)]/90">
        הסיסמה מתעדכנת <strong>במכשיר</strong> בלבד (Firebase לא מוגדר). אין כאן
        שליחת מייל מהשרת.
      </p>

      {gate === "loading" ? (
        <p className="mt-6 text-center text-sm text-[var(--text)]/80">טוען…</p>
      ) : gate === "none" ? (
        <div className="mt-6 space-y-3">
          <p className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-cherry-faint px-4 py-3 text-sm font-semibold text-[var(--cherry)]">
            עדיין אין כאן חשבון או פרופיל מלא. חזרי למסך הכניסה ובחרי &quot;להרשמה
            והתחלת המסלול&quot;.
          </p>
          <Link
            href="/welcome"
            className="btn-stem block w-full rounded-xl py-3 text-center text-sm font-bold"
          >
            מעבר למסך כניסה
          </Link>
        </div>
      ) : done ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-4 py-3 text-sm font-semibold text-[var(--stem)]">
            הסיסמה עודכנה. אפשר להתחבר עם האימייל והסיסמה החדשה.
          </p>
          <button
            type="button"
            className="btn-stem w-full rounded-xl py-3 text-sm font-bold"
            onClick={() => router.push("/welcome")}
          >
            חזרה להתחברות
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
              אימייל
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-luxury-search w-full rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
              סיסמה חדשה
            </span>
            <PasswordRevealInput
              autoComplete="new-password"
              value={pw}
              onChange={setPw}
              minLength={6}
              className="input-luxury-search rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
              disabled={busy}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
              אימות סיסמה
            </span>
            <PasswordRevealInput
              autoComplete="new-password"
              value={pw2}
              onChange={setPw2}
              minLength={6}
              className="input-luxury-search rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
              disabled={busy}
              required
            />
          </label>
          {err ? (
            <p className="text-sm font-medium text-[var(--cherry)]" role="alert">
              {err}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="btn-stem w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50"
          >
            {busy ? "שומרים…" : "עדכון סיסמה"}
          </button>
        </form>
      )}
      <ForgotPasswordFooter v={v} />
    </>
  );
}

export default function ForgotPasswordPage() {
  const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";
  const useFirebase = useMemo(() => isFirebasePasswordResetAvailable(), []);

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-8 md:py-12"
      dir="rtl"
    >
      <Link
        href="/welcome"
        className="text-sm font-semibold text-[var(--cherry)] underline underline-offset-4"
      >
        ← חזרה למסך הכניסה
      </Link>

      {useFirebase ? (
        <FirebaseResetFlow v={v} />
      ) : (
        <LocalResetFlow v={v} />
      )}
    </div>
  );
}
