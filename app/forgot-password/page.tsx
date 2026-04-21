"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { hasAuthRecord, resetLocalPassword } from "@/lib/localAuth";
import { loadProfile } from "@/lib/storage";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [hasLocalAuth, setHasLocalAuth] = useState<boolean | null>(null);

  useEffect(() => {
    setHasLocalAuth(hasAuthRecord());
    const pe = loadProfile().email?.trim();
    if (pe) setEmail(pe);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw !== pw2) {
      setErr("הסיסמאות אינן תואמות");
      return;
    }
    setBusy(true);
    try {
      const r = await resetLocalPassword(email, pw);
      if (!r.ok) {
        if (r.error === "no_account") {
          setErr("לא נמצא חשבון מקומי במכשיר — יש להירשם ממסך הכניסה.");
        } else if (r.error === "email") {
          setErr(
            "האימייל לא תואם לחשבון השמור או לפרופיל. נסי את אותו האימייל שאיתו נרשמת."
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
      <h1 className="heading-page mt-8 text-2xl">איפוס סיסמה (מקומי)</h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text)]/90">
        החשבון נשמר <strong>במכשיר בלבד</strong> — אין שליחת מייל מהשרת. אם האימייל
        תואם לחשבון או לפרופיל באפליקציה, תוכלי לבחור סיסמה חדשה.
      </p>

      {hasLocalAuth === null ? (
        <p className="mt-6 text-center text-sm text-[var(--text)]/80">טוען…</p>
      ) : !hasLocalAuth ? (
        <p className="mt-6 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-cherry-faint px-4 py-3 text-sm font-semibold text-[var(--cherry)]">
          במכשיר זה אין עדיין חשבון מקומי. חזרי למסך הכניסה והירשמי.
        </p>
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
              placeholder="you@example.com"
              className="input-luxury-search w-full rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
              סיסמה חדשה
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={6}
              className="input-luxury-search w-full rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
              אימות סיסמה
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={6}
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
            {busy ? "שומרים…" : "עדכון סיסמה"}
          </button>
        </form>
      )}

      <div className="mt-auto pt-12 text-center text-[10px] text-[var(--text)]/45">
        Cherry v{v}
      </div>
    </div>
  );
}
