"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Library, ShieldCheck, Info, LogOut, UserCircle2, Settings, SlidersHorizontal } from "lucide-react";
import { ADMIN_EMAIL } from "@/lib/adminConstants";
import { onFirebaseAuthChanged } from "@/lib/firebaseUserAuth";
import {
  clearAuthCompletely,
  clearDevAdminBypass,
  clearSession,
  clearStaffBypass,
} from "@/lib/localAuth";
import {
  clearWelcomeLeft,
  getDefaultUserProfile,
  loadProfile,
  saveProfile,
} from "@/lib/storage";
import { loadProfileAvatarDataUrl, saveProfileAvatarDataUrl } from "@/lib/profileAvatar";

type Props = {
  displayName?: string;
};

export function HomeDrawer({ displayName = "אילנית" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAdminLink, setShowAdminLink] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    return onFirebaseAuthChanged((u) => {
      const email = (u?.email ?? "").trim().toLowerCase();
      setShowAdminLink(email === ADMIN_EMAIL.toLowerCase());
    });
  }, []);

  function close() {
    setOpen(false);
    setLegalOpen(false);
  }

  function goToWelcomeScreen() {
    clearDevAdminBypass();
    clearStaffBypass();
    clearAuthCompletely();
    clearWelcomeLeft();
    saveProfile(getDefaultUserProfile());
    close();
    router.push("/welcome");
  }

  function logout() {
    clearDevAdminBypass();
    clearStaffBypass();
    clearSession();
    close();
    router.replace("/welcome");
  }

  function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 900_000) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) return;
      saveProfileAvatarDataUrl(dataUrl);
      setAvatarUrl(dataUrl);
    };
    reader.readAsDataURL(f);
  }

  const itemClass =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-semibold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]";

  return (
    <>
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
        className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/0 text-[var(--stem)] transition hover:bg-[var(--cherry-muted)] active:scale-[0.99]"
        onClick={() => setOpen(true)}
        aria-label="פתיחת תפריט"
        title="תפריט"
      >
        <Menu className="h-6 w-6" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[300]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden={!open}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/35"
              onClick={close}
              aria-label="סגירת תפריט"
            />

            <motion.aside
              className="absolute right-0 top-0 h-full w-[80vw] max-w-sm overflow-y-auto border-s-2 border-[var(--border-cherry-soft)] bg-white shadow-2xl"
              initial={{ x: 40 }}
              animate={{ x: 0 }}
              exit={{ x: 40 }}
              transition={{ duration: 0.18 }}
              dir="rtl"
              role="dialog"
              aria-modal
              aria-label="תפריט צד"
            >
              <div className="border-b border-[var(--border-cherry-soft)]/70 p-4">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-start transition hover:bg-[var(--cherry-muted)]"
                  onClick={() => {
                    avatarInputRef.current?.click();
                  }}
                  aria-label="העלאת תמונת פרופיל"
                  title="העלאת תמונת פרופיל"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-11 w-11 rounded-full border-2 border-[var(--border-cherry-soft)] object-cover"
                    />
                  ) : (
                    <UserCircle2 className="h-11 w-11 text-[var(--stem)]/70" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold text-[var(--cherry)]">
                      {displayName}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--text)]/60">
                      לחצי כדי להעלות תמונה
                    </p>
                  </div>
                </button>
              </div>

              <div className="p-3">
                <Link
                  href="/control-center"
                  className={itemClass}
                  onClick={() => close()}
                >
                  <SlidersHorizontal className="h-5 w-5 text-[var(--cherry)]" />
                  מרכז השליטה
                </Link>

                <Link
                  href="/library"
                  className={itemClass}
                  onClick={() => close()}
                >
                  <Library className="h-5 w-5 text-[var(--cherry)]" />
                  הספרייה שלי
                </Link>

                {showAdminLink ? (
                  <Link
                    href="/admin"
                    className={itemClass}
                    onClick={() => close()}
                  >
                    <ShieldCheck className="h-5 w-5 text-[var(--cherry)]" />
                    ניהול מערכת
                  </Link>
                ) : null}

                <Link
                  href="/settings"
                  className={itemClass}
                  onClick={() => close()}
                >
                  <Settings className="h-5 w-5 text-[var(--stem)]/70" />
                  הגדרות
                </Link>

                <div className="my-3 border-t border-[var(--border-cherry-soft)]/70" />

                <button
                  type="button"
                  className={itemClass}
                  onClick={() => setLegalOpen((v) => !v)}
                  aria-expanded={legalOpen}
                >
                  <Info className="h-5 w-5 text-[var(--stem)]/70" />
                  מידע משפטי
                </button>

                <AnimatePresence initial={false}>
                  {legalOpen ? (
                    <motion.div
                      className="mt-1 space-y-1 rounded-xl border border-[var(--border-cherry-soft)]/70 bg-white px-3 py-2"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                    >
                      <Link
                        href="/privacy"
                        className="block py-1 text-[12px] font-semibold text-[var(--stem)]/75 hover:text-[var(--cherry)]"
                        onClick={() => close()}
                      >
                        מדיניות פרטיות
                      </Link>
                      <Link
                        href="/terms"
                        className="block py-1 text-[12px] font-semibold text-[var(--stem)]/75 hover:text-[var(--cherry)]"
                        onClick={() => close()}
                      >
                        תנאי שימוש
                      </Link>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <button
                  type="button"
                  className={`${itemClass} mt-2 text-[var(--cherry)]`}
                  onClick={() => {
                    const p = loadProfile();
                    const hasEverOnboarded = Boolean(p.onboardingComplete);
                    if (hasEverOnboarded) {
                      logout();
                    } else {
                      goToWelcomeScreen();
                    }
                  }}
                >
                  <LogOut className="h-5 w-5" />
                  התחלה מחדש / מסך כניסה
                </button>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

