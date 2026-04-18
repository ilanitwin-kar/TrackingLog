"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  activateDevAdminBypass,
  hasWelcomeAutoResume,
  registerAccount,
  seedBypassProfileIfNeeded,
  seedDevAdminProfileIfNeeded,
  startSession,
  verifyLogin,
} from "@/lib/localAuth";
import {
  isRegistrationComplete,
  loadProfile,
  markWelcomeLeft,
} from "@/lib/storage";
import { BlueberryMark } from "@/components/BlueberryMark";
import { CherryMark } from "@/components/CherryMark";
import { useAppVariant } from "@/components/useAppVariant";
import {
  clearAppVariant,
  getBrandName,
  type AppVariant,
} from "@/lib/appVariant";
import { StaffBypassEntry } from "@/components/StaffBypassEntry";

const LANG_KEY = "cj_welcome_lang";

type Lang = "he" | "en";

type Copy = {
  /** שורה ראשונה — מסר ראשי */
  taglinePrimary: string;
  /** שורה שנייה — הדגשה (במסך: צבע גבעול) */
  taglineSecondary: string;
  signup: string;
  login: string;
  quickConnect: string;
  langHe: string;
  langEn: string;
  shareAria: string;
  howItWorks: string;
  manualTitle: string;
  manualSteps: string[];
  manualClose: string;
  toastCopied: string;
  shareSoon: string;
  forgotPassword: string;
  registerTitle: string;
  loginTitle: string;
  emailLabel: string;
  passwordLabel: string;
  confirmPasswordLabel: string;
  submitRegister: string;
  submitLogin: string;
  cancel: string;
  devAdminOnly: string;
  staffEntry: string;
  staffPinPrompt: string;
  staffPinWrong: string;
  switchTrack: string;
  switchTrackConfirm: string;
  staffNotConfigured: string;
  errEmail: string;
  errPasswordShort: string;
  errPasswordMismatch: string;
  errWrongCreds: string;
  errAlreadyRegistered: string;
  loggingIn: string;
  registering: string;
};

const COPY: Record<Lang, Copy> = {
  he: {
    taglinePrimary: "מסלול ישיר לגוף החלומות שלך",
    taglineSecondary: "שליטה, עצמאות, חופש",
    signup: "להרשמה והתחלת המסלול",
    login: "התחברות",
    quickConnect: "חיבור מהיר",
    langHe: "עברית",
    langEn: "English",
    shareAria: "שיתוף",
    howItWorks: "איך זה עובד?",
    manualTitle: "איך עובדים עם האפליקציה?",
    manualSteps: [
      "מילוי פרטים אישיים",
      "הזנת נתוני מזון",
      "מעקב אחר גרף ההתקדמות (במסך הדוח)",
      "מסך קניות, המילון שלי",
      "הנחיות טכניות ונוחות בממשק (UI/UX)",
    ],
    manualClose: "סגירה",
    toastCopied: "הועתק ללוח",
    shareSoon: "בקרוב",
    forgotPassword: "שכחתי סיסמה",
    registerTitle: "יצירת חשבון",
    loginTitle: "התחברות",
    emailLabel: "אימייל",
    passwordLabel: "סיסמה",
    confirmPasswordLabel: "אימות סיסמה",
    submitRegister: "המשך למילוי פרטים",
    submitLogin: "כניסה",
    cancel: "ביטול",
    devAdminOnly: "כניסת מנהלת (פיתוח בלבד)",
    staffEntry: "כניסת מנהלת (קוד צוות)",
    staffPinPrompt: "קוד צוות",
    staffPinWrong: "קוד שגוי",
    switchTrack: "החלפת מסלול (גברים / נשים)",
    switchTrackConfirm:
      "לעבור למסך בחירת המסלול? תוכלי לבחור מחדש צ׳רי או בלו.",
    staffNotConfigured:
      "קוד צוות עדיין לא הוגדר בפריסה. ב-Netlify → Environment variables הוסיפי NEXT_PUBLIC_STAFF_UNLOCK (לפחות 4 תווים), שמרי ופרסמו מחדש. עד אז: התחברות רגילה נשמרת במכשיר עד «התנתקות».",
    errEmail: "נא להזין כתובת אימייל תקינה",
    errPasswordShort: "הסיסמה חייבת להכיל לפחות 6 תווים",
    errPasswordMismatch: "הסיסמאות אינן תואמות",
    errWrongCreds: "אימייל או סיסמה שגויים",
    errAlreadyRegistered: "כבר קיים חשבון במכשיר — התחברי",
    loggingIn: "מתחברת…",
    registering: "יוצרת חשבון…",
  },
  en: {
    taglinePrimary: "A direct path to your dream body",
    taglineSecondary: "Control, independence, freedom",
    signup: "Sign up & start your path",
    login: "Log in",
    quickConnect: "Quick connect",
    langHe: "עברית",
    langEn: "English",
    shareAria: "Share",
    howItWorks: "How does it work?",
    manualTitle: "How to use the app",
    manualSteps: [
      "Fill in personal details",
      "Log your food data",
      "Track your progress chart (on the Report screen)",
      "Shopping screen & My dictionary",
      "UI/UX tips for a smooth experience",
    ],
    manualClose: "Close",
    toastCopied: "Copied to clipboard",
    shareSoon: "Coming soon",
    forgotPassword: "Forgot password?",
    registerTitle: "Create account",
    loginTitle: "Log in",
    emailLabel: "Email",
    passwordLabel: "Password",
    confirmPasswordLabel: "Confirm password",
    submitRegister: "Continue to profile setup",
    submitLogin: "Sign in",
    cancel: "Cancel",
    devAdminOnly: "Admin entry (development only)",
    staffEntry: "Staff entry (passcode)",
    staffPinPrompt: "Team passcode",
    staffPinWrong: "Wrong passcode",
    switchTrack: "Switch track (men / women)",
    switchTrackConfirm:
      "Open track selection again? You can pick Cherry or BLUE anew.",
    staffNotConfigured:
      "Staff code is not set on the server. In Netlify → Environment variables add NEXT_PUBLIC_STAFF_UNLOCK (4+ characters), save, and redeploy. Until then: normal login stays on this device until you log out.",
    errEmail: "Please enter a valid email address",
    errPasswordShort: "Password must be at least 6 characters",
    errPasswordMismatch: "Passwords do not match",
    errWrongCreds: "Wrong email or password",
    errAlreadyRegistered: "An account already exists on this device — log in",
    loggingIn: "Signing in…",
    registering: "Creating account…",
  },
};

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";

function IconGoogle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function IconApple({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.48-1.31 2.96-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m0-9.316a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

function loadLang(): Lang {
  if (typeof window === "undefined") return "he";
  const raw = localStorage.getItem(LANG_KEY);
  return raw === "en" ? "en" : "he";
}

function shareMessage(appUrl: string, lang: Lang, variant: AppVariant): string {
  const brand = getBrandName(variant);
  const emoji = variant === "blueberry" ? "🫐" : "🍒";
  if (lang === "en") {
    return [
      `I started using ${brand} — the Caloric Intelligence tracking journal.`,
      "",
      `An app that takes you straight toward your dream body ${emoji}`,
      "",
      `Join: ${appUrl}`,
    ].join("\n");
  }
  return [
    `התחלתי להשתמש ב-${brand} – יומן המעקב של אינטליגנציה קלורית.`,
    "",
    `אפליקציה שתיקח אותך ישירות לגוף החלומות שלך${emoji}`,
    "",
    `להצטרפות : ${appUrl}`,
  ].join("\n");
}

export function WelcomeScreen() {
  const router = useRouter();
  const appVariant = useAppVariant();
  const [lang, setLang] = useState<Lang>("he");
  const [mounted, setMounted] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState<null | "signup" | "login">(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirm, setAuthConfirm] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const t = COPY[lang];
  const dir = lang === "he" ? "rtl" : "ltr";

  useEffect(() => {
    setMounted(true);
    setLang(loadLang());
  }, []);

  /** כבר מחוברים או דילוג מנהלת/צוות — לא לעצור במסך הכניסה */
  useEffect(() => {
    if (!mounted) return;
    if (!hasWelcomeAutoResume()) return;
    const profile = loadProfile();
    if (isRegistrationComplete(profile)) router.replace("/");
    else router.replace("/tdee");
  }, [mounted, router]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(LANG_KEY, lang);
  }, [lang, mounted]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const handleShare = useCallback(async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const appUrl = origin ? `${origin}/welcome` : "";
    const text = shareMessage(appUrl, lang, appVariant);
    try {
      if (navigator.share) {
        await navigator.share({
          title: getBrandName(appVariant),
          text,
          url: appUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast(t.toastCopied);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        showToast(t.toastCopied);
      } catch {
        /* ignore */
      }
    }
  }, [appVariant, lang, showToast, t.toastCopied]);

  const cherryWordClass =
    "heading-page text-4xl tracking-tight sm:text-5xl";

  function openAuth(mode: "signup" | "login") {
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirm("");
    setAuthError(null);
    setAuthOpen(mode);
  }

  function closeAuth() {
    setAuthOpen(null);
    setAuthBusy(false);
    setAuthError(null);
  }

  async function submitSignup() {
    setAuthError(null);
    if (authPassword !== authConfirm) {
      setAuthError(t.errPasswordMismatch);
      return;
    }
    setAuthBusy(true);
    try {
      const r = await registerAccount(authEmail, authPassword);
      if (!r.ok) {
        if (r.error === "email") setAuthError(t.errEmail);
        else if (r.error === "short") setAuthError(t.errPasswordShort);
        else setAuthError(t.errAlreadyRegistered);
        return;
      }
      startSession();
      markWelcomeLeft();
      closeAuth();
      router.push("/tdee");
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitLoginForm() {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const ok = await verifyLogin(authEmail, authPassword);
      if (!ok) {
        setAuthError(t.errWrongCreds);
        return;
      }
      startSession();
      markWelcomeLeft();
      closeAuth();
      const profile = loadProfile();
      if (isRegistrationComplete(profile)) router.push("/");
      else router.push("/tdee");
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <div
      className="welcome-screen-bg relative mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
      dir={dir}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setLang((l) => (l === "he" ? "en" : "he"))}
          className="shrink-0 rounded-full border border-[var(--border-cherry-soft)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--text)] shadow-sm"
          aria-label={lang === "he" ? "Switch to English" : "עבור לעברית"}
        >
          {lang === "he" ? (
            <>
              <span className="text-[var(--cherry)]">{t.langHe}</span>
              <span className="mx-1 opacity-40">|</span>
              <span className="opacity-60">{t.langEn}</span>
            </>
          ) : (
            <>
              <span className="opacity-60">{t.langHe}</span>
              <span className="mx-1 opacity-40">|</span>
              <span className="text-[var(--cherry)]">{t.langEn}</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-cherry-soft)] bg-white text-[var(--cherry)] shadow-sm"
          aria-label={t.shareAria}
        >
          <IconShare className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-2 flex flex-col items-center text-center">
        {appVariant === "blueberry" ? (
          <BlueberryMark className="h-24 w-28 sm:h-28 sm:w-32" />
        ) : (
          <CherryMark className="h-24 w-28 sm:h-28 sm:w-32" />
        )}
        <h1 className={cherryWordClass}>{getBrandName(appVariant)}</h1>
      </div>

      <div className="mt-5 min-h-0 flex-1 px-0.5">
        <div
          className="glass-panel mx-auto max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 px-4 py-6 shadow-[0_8px_28px_var(--panel-shadow-soft)]"
          dir={dir}
        >
          <p className="text-balance text-center text-lg font-extrabold leading-snug text-[var(--ui-welcome-tagline)] sm:text-xl">
            {t.taglinePrimary}
          </p>
          <p className="mt-4 text-balance text-center text-base font-bold leading-relaxed text-[var(--stem)] sm:text-lg">
            {t.taglineSecondary}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => openAuth("signup")}
          className="shadow-brand-cta w-full rounded-2xl bg-[var(--cherry)] py-3.5 text-center text-base font-bold text-white transition active:scale-[0.99]"
        >
          {t.signup}
        </button>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => openAuth("login")}
            className="min-w-0 flex-1 rounded-2xl border-2 border-[color-mix(in_srgb,var(--cherry)_35%,transparent)] bg-white py-3 text-center text-base font-semibold text-[var(--cherry)] transition active:scale-[0.99]"
          >
            {t.login}
          </button>
          <Link
            href="/forgot-password"
            className="flex w-[6.5rem] shrink-0 items-center justify-center rounded-2xl border border-[var(--border-cherry-soft)] bg-white px-1 text-center text-[11px] font-semibold leading-tight text-[var(--cherry)] underline decoration-[color-mix(in_srgb,var(--cherry)_30%,transparent)] underline-offset-2"
          >
            {t.forgotPassword}
          </Link>
        </div>
        <StaffBypassEntry
          theme="welcome"
          dir={dir}
          onNotify={showToast}
          labels={{
            staffEntry: t.staffEntry,
            staffPinPrompt: t.staffPinPrompt,
            staffPinWrong: t.staffPinWrong,
            staffNotConfigured: t.staffNotConfigured,
            submitLabel: t.submitLogin,
            cancel: t.cancel,
          }}
          onStaffSuccess={() => {
            seedBypassProfileIfNeeded();
            markWelcomeLeft();
            router.replace("/");
          }}
        />
        <p className="text-center text-xs font-semibold text-[var(--text)]/60">
          {t.quickConnect}
        </p>
        <div className="flex justify-center gap-6">
          <button
            type="button"
            onClick={() => showToast(t.shareSoon)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#e8e8e8] bg-white shadow-sm"
            aria-label="Google"
          >
            <IconGoogle className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => showToast(t.shareSoon)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#e8e8e8] bg-black text-white shadow-sm"
            aria-label="Apple"
          >
            <IconApple className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2 pb-1 text-center">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="text-sm font-semibold text-[var(--cherry)] underline decoration-[color-mix(in_srgb,var(--cherry)_40%,transparent)] underline-offset-4"
          >
            {t.howItWorks}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm(t.switchTrackConfirm)
              ) {
                return;
              }
              clearAppVariant();
              window.location.assign("/pick-theme");
            }}
            className="text-sm font-semibold text-[var(--stem)] underline decoration-[color-mix(in_srgb,var(--stem)_35%,transparent)] underline-offset-4"
          >
            {t.switchTrack}
          </button>
        </div>
        {process.env.NODE_ENV === "development" && (
          <button
            type="button"
            onClick={() => {
              seedDevAdminProfileIfNeeded();
              activateDevAdminBypass();
              markWelcomeLeft();
              router.replace("/");
            }}
            className="w-full rounded-xl border-2 border-dashed border-[var(--welcome-dev-border)] bg-[var(--welcome-dev-bg)] py-2.5 text-center text-xs font-semibold text-[var(--cherry)]"
          >
            {t.devAdminOnly}
          </button>
        )}
        <p className="text-[10px] text-[var(--text)]/45">
          {getBrandName(appVariant)} v{APP_VERSION}
        </p>
      </div>

      {authOpen && (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-dialog-title"
        >
          <div
            className="glass-panel w-full max-w-md rounded-2xl border-2 border-[var(--border-cherry-soft)] p-5 shadow-xl"
            dir={dir}
          >
            <h2 id="auth-dialog-title" className="panel-title-cherry text-lg">
              {authOpen === "signup" ? t.registerTitle : t.loginTitle}
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                  {t.emailLabel}
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="input-luxury-search rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                  {t.passwordLabel}
                </span>
                <input
                  type="password"
                  autoComplete={
                    authOpen === "signup" ? "new-password" : "current-password"
                  }
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="input-luxury-search rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
                />
              </label>
              {authOpen === "signup" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--cherry)]">
                    {t.confirmPasswordLabel}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={authConfirm}
                    onChange={(e) => setAuthConfirm(e.target.value)}
                    className="input-luxury-search rounded-xl border-2 border-[var(--border-cherry-soft)] px-3 py-2.5 text-sm"
                  />
                </label>
              )}
            </div>
            {authError && (
              <p className="mt-3 text-sm font-medium text-[var(--cherry)]" role="alert">
                {authError}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                disabled={authBusy}
                onClick={() =>
                  void (authOpen === "signup" ? submitSignup() : submitLoginForm())
                }
                className="btn-stem flex-1 rounded-xl py-3 text-center text-sm font-bold disabled:opacity-50"
              >
                {authBusy
                  ? authOpen === "signup"
                    ? t.registering
                    : t.loggingIn
                  : authOpen === "signup"
                    ? t.submitRegister
                    : t.submitLogin}
              </button>
              <button
                type="button"
                disabled={authBusy}
                onClick={closeAuth}
                className="btn-gold flex-1 rounded-xl py-3 text-center text-sm font-bold"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-title"
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white p-5 shadow-xl"
            dir={dir}
          >
            <h2 id="manual-title" className="panel-title-cherry text-lg">
              {t.manualTitle}
            </h2>
            <ol className="mt-4 list-none space-y-3 text-[var(--text)]">
              {t.manualSteps.map((step, i) => (
                <li key={i} className="flex gap-3 leading-relaxed">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cherry-muted)] text-sm font-bold text-[var(--cherry)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              className="btn-gold mt-6 w-full rounded-xl py-2.5 text-center text-sm font-bold"
            >
              {t.manualClose}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 z-[280] max-w-[min(100vw-1.5rem,24rem)] -translate-x-1/2 rounded-full bg-[var(--stem-deep)] px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
