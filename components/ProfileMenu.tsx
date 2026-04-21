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

type ProfileAccordionId = "tracking" | "journal" | "libraries" | "profile";

function ChevronIcon({ open: expanded }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-[var(--stem)]/70 transition-transform duration-200 ${
        expanded ? "rotate-180" : "rotate-0"
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ProfileMenu() {
  const router = useRouter();
  const appVariant = useAppVariant();
  const [open, setOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [expandedSection, setExpandedSection] = useState<ProfileAccordionId | null>(
    null
  );
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

  useEffect(() => {
    if (!open) setExpandedSection(null);
  }, [open]);

  function toggleSection(id: ProfileAccordionId) {
    setExpandedSection((prev) => (prev === id ? null : id));
  }

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
            className="absolute start-0 top-[calc(100%+0.5rem)] z-[200] min-w-[17.5rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white shadow-lg"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="navigation"
            aria-label="תפריט פרופיל"
          >
            <div className="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto overscroll-contain py-1">
              {/* 1. מעקב והתקדמות */}
              <div className="border-b border-[var(--border-cherry-soft)]/70">
                <button
                  type="button"
                  className="flex w-full min-h-[3rem] items-center justify-between gap-2 px-4 py-3 text-start text-base font-extrabold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                  aria-expanded={expandedSection === "tracking"}
                  aria-controls="profile-menu-section-tracking"
                  id="profile-menu-heading-tracking"
                  onClick={() => toggleSection("tracking")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden>📈</span>
                    <span className="leading-snug">מעקב והתקדמות</span>
                  </span>
                  <ChevronIcon open={expandedSection === "tracking"} />
                </button>
                <AnimatePresence initial={false}>
                  {expandedSection === "tracking" && (
                    <motion.div
                      id="profile-menu-section-tracking"
                      role="region"
                      aria-labelledby="profile-menu-heading-tracking"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden border-t border-[var(--border-cherry-soft)]/40 bg-[rgba(74,124,35,0.07)]"
                    >
                      <div className="space-y-0 border-s-[3px] border-[var(--border-cherry-soft)]/55 ps-3 pe-2 py-1">
                        <Link
                          href="/weight"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          מעקב משקל
                        </Link>
                        <Link
                          href="/calorie-board"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          לוח צבירת קלוריות
                        </Link>
                        <Link
                          href="/tdee"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          עריכת פרטים ויעד (TDEE)
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 2. ניהול יומן ומתכונים */}
              <div className="border-b border-[var(--border-cherry-soft)]/70">
                <button
                  type="button"
                  className="flex w-full min-h-[3rem] items-center justify-between gap-2 px-4 py-3 text-start text-base font-extrabold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                  aria-expanded={expandedSection === "journal"}
                  aria-controls="profile-menu-section-journal"
                  id="profile-menu-heading-journal"
                  onClick={() => toggleSection("journal")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden>🍒</span>
                    <span className="leading-snug">ניהול יומן ומתכונים</span>
                  </span>
                  <ChevronIcon open={expandedSection === "journal"} />
                </button>
                <AnimatePresence initial={false}>
                  {expandedSection === "journal" && (
                    <motion.div
                      id="profile-menu-section-journal"
                      role="region"
                      aria-labelledby="profile-menu-heading-journal"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden border-t border-[var(--border-cherry-soft)]/40 bg-[rgba(74,124,35,0.07)]"
                    >
                      <div className="space-y-0 border-s-[3px] border-[var(--border-cherry-soft)]/55 ps-3 pe-2 py-1">
                        <Link
                          href="/recipes"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          מחשבון מתכונים
                        </Link>
                        <Link
                          href="/planner"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          בניית תפריט (ידני)
                        </Link>
                        <Link
                          href="/explorer"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          מגלה המזונות
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 3. המאגרים שלי */}
              <div className="border-b border-[var(--border-cherry-soft)]/70">
                <button
                  type="button"
                  className="flex w-full min-h-[3rem] items-center justify-between gap-2 px-4 py-3 text-start text-base font-extrabold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                  aria-expanded={expandedSection === "libraries"}
                  aria-controls="profile-menu-section-libraries"
                  id="profile-menu-heading-libraries"
                  onClick={() => toggleSection("libraries")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden>📚</span>
                    <span className="leading-snug">המאגרים שלי</span>
                  </span>
                  <ChevronIcon open={expandedSection === "libraries"} />
                </button>
                <AnimatePresence initial={false}>
                  {expandedSection === "libraries" && (
                    <motion.div
                      id="profile-menu-section-libraries"
                      role="region"
                      aria-labelledby="profile-menu-heading-libraries"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden border-t border-[var(--border-cherry-soft)]/40 bg-[rgba(74,124,35,0.07)]"
                    >
                      <div className="space-y-0 border-s-[3px] border-[var(--border-cherry-soft)]/55 ps-3 pe-2 py-1">
                        <Link
                          href="/my-recipes"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          המתכונים שלי
                        </Link>
                        <Link
                          href="/menus"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          התפריטים שלי
                        </Link>
                        <Link
                          href="/shopping"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          רשימת קניות
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 4. הגדרות ופרופיל */}
              <div className="border-b border-[var(--border-cherry-soft)]/70">
                <button
                  type="button"
                  className="flex w-full min-h-[3rem] items-center justify-between gap-2 px-4 py-3 text-start text-base font-extrabold text-[var(--stem)] transition hover:bg-[var(--cherry-muted)]"
                  aria-expanded={expandedSection === "profile"}
                  aria-controls="profile-menu-section-profile"
                  id="profile-menu-heading-profile"
                  onClick={() => toggleSection("profile")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden>⚙️</span>
                    <span className="leading-snug">הגדרות ופרופיל</span>
                  </span>
                  <ChevronIcon open={expandedSection === "profile"} />
                </button>
                <AnimatePresence initial={false}>
                  {expandedSection === "profile" && (
                    <motion.div
                      id="profile-menu-section-profile"
                      role="region"
                      aria-labelledby="profile-menu-heading-profile"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden border-t border-[var(--border-cherry-soft)]/40 bg-[rgba(74,124,35,0.07)]"
                    >
                      <div className="space-y-0 border-s-[3px] border-[var(--border-cherry-soft)]/55 ps-3 pe-2 py-1">
                        <button
                          type="button"
                          className="block w-full rounded-lg py-2.5 ps-1 pe-2 text-start text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => {
                            avatarInputRef.current?.click();
                            setOpen(false);
                          }}
                        >
                          העלאת תמונת פרופיל
                        </button>
                        {avatarUrl ? (
                          <button
                            type="button"
                            className="block w-full rounded-lg py-2.5 ps-1 pe-2 text-start text-sm font-semibold text-[var(--cherry)] hover:bg-white/80"
                            onClick={() => {
                              clearAvatar();
                            }}
                          >
                            הסרת תמונה — חזרה לאייקון המותג
                          </button>
                        ) : null}
                        <Link
                          href="/settings"
                          className="block rounded-lg py-2.5 ps-1 pe-2 text-sm font-semibold text-[var(--stem)] hover:bg-white/80"
                          onClick={() => setOpen(false)}
                        >
                          הגדרות
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {(process.env.NODE_ENV === "development" ||
                isInternalAuthBypassActive()) && (
                <button
                  type="button"
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