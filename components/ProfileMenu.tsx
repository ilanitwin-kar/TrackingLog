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
import {
  loadSoundEffectsEnabled,
  saveSoundEffectsEnabled,
} from "@/lib/soundSettings";

export function ProfileMenu() {
  const router = useRouter();
  const appVariant = useAppVariant();
  const [open, setOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [soundsOn, setSoundsOn] = useState(true);
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
    function syncSounds() {
      setSoundsOn(loadSoundEffectsEnabled());
    }
    syncSounds();
    window.addEventListener("cj-sound-settings-changed", syncSounds);
    return () =>
      window.removeEventListener("cj-sound-settings-changed", syncSounds);
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

  /** התחלה מחדש: מסך כניסה ואז שוב מילוי פרטים (כמו משתמש חדש) */
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

  // סגירת התפריט בלחיצה מחוץ אליו
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
            className="absolute start-0 top-[calc(100%+0.5rem)] z-[200] min-w-[16rem] overflow-hidden rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white py-1 shadow-lg"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-3 text-start text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => {
                avatarInputRef.current?.click();
                setOpen(false);
              }}
            >
              העלאת תמונת פרופיל
            </button>
            <button
              type="button"
              role="menuitem"
              aria-label={
                soundsOn
                  ? "צלילים באפליקציה מופעלים — לחץ לכיבוי"
                  : "צלילים באפליקציה כבויים — לחץ להפעלה"
              }
              className="block w-full px-4 py-3 text-start text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => {
                const next = !loadSoundEffectsEnabled();
                saveSoundEffectsEnabled(next);
                setSoundsOn(next);
              }}
            >
              צלילים באפליקציה — {soundsOn ? "מופעל" : "כבוי"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-4 py-3 text-start text-sm font-semibold text-[var(--cherry)] hover:bg-[var(--cherry-muted)]"
                onClick={clearAvatar}
              >
                הסרת תמונה — חזרה לאייקון המותג
              </button>
            )}
            <Link
              href="/weight"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => setOpen(false)}
            >
              מעקב משקל
            </Link>
            <Link
              href="/tdee"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => setOpen(false)}
            >
              עריכת פרטים ויעד (TDEE)
            </Link>
            <Link
              href="/explorer"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => setOpen(false)}
            >
              מגלה המזונות
            </Link>
            <Link
              href="/menus"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => setOpen(false)}
            >
              התפריטים שלי
            </Link>
            <Link
              href="/shopping"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => setOpen(false)}
            >
              רשימת קניות
            </Link>
            <Link
              href="/calorie-board"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
              onClick={() => setOpen(false)}
            >
              לוח צבירת קלוריות
            </Link>

            {showLogout && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-4 py-3 text-start text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
                onClick={logout}
              >
                התנתקות
              </button>
            )}

            {(process.env.NODE_ENV === "development" ||
              isInternalAuthBypassActive()) && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-4 py-3 text-start text-sm font-semibold text-[var(--stem)] hover:bg-[var(--cherry-muted)]"
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
              role="menuitem"
              className="block w-full border-t border-[var(--border-cherry-soft)] px-4 py-3 text-start text-sm font-semibold text-[var(--cherry)] hover:bg-[var(--cherry-muted)]"
              onClick={goToWelcomeScreen}
            >
              מסך כניסה — התחלה מחדש 🍒
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}