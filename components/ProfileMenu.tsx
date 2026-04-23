"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BlueberryMark } from "@/components/BlueberryMark";
import { CherryMark } from "@/components/CherryMark";
import { useAppVariant } from "@/components/useAppVariant";
import {
  clearAuthCompletely,
  clearDevAdminBypass,
  clearSession,
  clearStaffBypass,
  isInternalAuthBypassActive,
  isSessionActive,
} from "@/lib/localAuth";
import {
  loadProfileAvatarDataUrl,
  saveProfileAvatarDataUrl,
} from "@/lib/profileAvatar";
import { clearAppVariant } from "@/lib/appVariant";
import {
  clearWelcomeLeft,
  getDefaultUserProfile,
  loadProfile,
  saveProfile,
} from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";

export function ProfileMenu() {
  const router = useRouter();
  const appVariant = useAppVariant();
  const [open, setOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function syncLogout() {
      setShowLogout(
        isSessionActive() || isInternalAuthBypassActive(),
      );
    }
    syncLogout();
    window.addEventListener("cj-auth-changed", syncLogout);
    return () => window.removeEventListener("cj-auth-changed", syncLogout);
  }, []);

  useEffect(() => {
    setAvatarUrl(loadProfileAvatarDataUrl());
    function onStorage(e: StorageEvent) {
      if (e.key === "cj-profile-avatar-data-url-v1") {
        setAvatarUrl(loadProfileAvatarDataUrl());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function goToWelcomeScreen() {
    clearDevAdminBypass();
    clearStaffBypass();
    clearAuthCompletely();
    clearWelcomeLeft();
    saveProfile(getDefaultUserProfile());
    setOpen(false);
    router.push("/welcome");
  }

  function logout() {
    clearSession();
    setOpen(false);
    router.replace("/welcome");
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
    }
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const gender = loadProfile().gender;
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 900_000) {
      window.alert(
        gf(
          gender,
          "התמונה גדולה מדי — נסי קובץ קטן יותר (עד כ־700KB).",
          "התמונה גדולה מדי — נסה קובץ קטן יותר (עד כ־700KB)."
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) return;
      saveProfileAvatarDataUrl(dataUrl);
      setAvatarUrl(dataUrl);
    };
    reader.readAsDataURL(f);
  }

  function clearAvatar() {
    saveProfileAvatarDataUrl(null);
    setAvatarUrl(null);
    setOpen(false);
  }

  const gender = loadProfile().gender;
  const linkClass =
    "block w-full px-4 py-3 text-start text-sm font-semibold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]";

  return (
    <div className="relative" ref={rootRef}>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onAvatarFile}
      />
      <button
        type="button"
        className="flex h-11 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-2.5 text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] sm:min-w-[6rem]"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="תפריט פרופיל"
        onClick={() => setOpen((v) => !v)}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border-2 border-[var(--border-cherry-soft)] object-cover"
          />
        ) : appVariant === "blueberry" ? (
          <BlueberryMark className="h-8 w-10 shrink-0" />
        ) : (
          <CherryMark className="h-8 w-10 shrink-0" />
        )}
        <span className="text-xs font-semibold">תפריט</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute start-0 top-[calc(100%+0.5rem)] z-[200] min-w-[17.5rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white shadow-lg"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="navigation"
            aria-label="תפריט פרופיל"
          >
            <div className="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto overscroll-contain py-1">
              <Link
                href="/control-center"
                className={`${linkClass} border-b border-[var(--border-cherry-soft)]/70 text-base font-extrabold text-[var(--cherry)]`}
                onClick={() => setOpen(false)}
              >
                <span className="me-2" aria-hidden>
                  🎛️
                </span>
                מרכז השליטה
              </Link>

              <div className="border-b border-[var(--border-cherry-soft)]/70">
                <p className="px-4 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--stem)]/55">
                  פרופיל
                </p>
                <button
                  type="button"
                  className={linkClass}
                  onClick={() => {
                    avatarInputRef.current?.click();
                    setOpen(false);
                  }}
                >
                  {gf(gender, "העלאת תמונת פרופיל", "העלאת תמונת פרופיל")}
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    className={`${linkClass} text-[var(--cherry)]`}
                    onClick={() => {
                      clearAvatar();
                    }}
                  >
                    {gf(
                      gender,
                      "הסרת תמונה — חזרה לאייקון המותג",
                      "הסרת תמונה — חזרה לאייקון המותג"
                    )}
                  </button>
                ) : null}
                <Link
                  href="/tdee"
                  className={linkClass}
                  onClick={() => setOpen(false)}
                >
                  {gf(gender, "פרופיל ויעדים (TDEE)", "פרופיל ויעדים (TDEE)")}
                </Link>
              </div>

              <Link
                href="/settings"
                className={`${linkClass} border-b border-[var(--border-cherry-soft)]/70`}
                onClick={() => setOpen(false)}
              >
                הגדרות
              </Link>

              {(process.env.NODE_ENV === "development" ||
                isInternalAuthBypassActive()) && (
                <button
                  type="button"
                  className={linkClass}
                  onClick={() => {
                    clearAppVariant();
                    setOpen(false);
                    router.push("/pick-theme");
                  }}
                >
                  מסך בחירת מסלול — מנהלת
                </button>
              )}

              <button
                type="button"
                className="block w-full border-t border-[var(--border-cherry-soft)] px-4 py-3 text-start text-sm font-semibold text-[var(--cherry)] hover:bg-[var(--cherry-muted)]"
                onClick={goToWelcomeScreen}
              >
                מסך כניסה — התחלה מחדש 🍒
              </button>

              {showLogout ? (
                <button
                  type="button"
                  className="block w-full border-t-2 border-[var(--border-cherry-soft)] px-4 py-3.5 text-start text-base font-extrabold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                  onClick={logout}
                >
                  התנתקות
                </button>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
