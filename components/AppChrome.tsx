"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppBrandMark } from "@/components/AppBrandMark";
import { AppToastHost } from "@/components/AppToastHost";
import { BottomNav } from "@/components/BottomNav";
import { SoundFeedbackHost } from "@/components/SoundFeedbackHost";
import { AppSearchPalette } from "@/components/AppSearchPalette";
import {
  hasAuthRecord,
  isInternalAuthBypassActive,
  isSessionActive,
} from "@/lib/localAuth";
import { onFirebaseAuthChanged } from "@/lib/firebaseUserAuth";
import { getFirebaseCurrentUser } from "@/lib/firebaseUserAuth";
import { syncLocalToCloud } from "@/lib/userSync";
import { hasChosenAppVariant } from "@/lib/appVariant";
import {
  hasLeftWelcome,
  isRegistrationComplete,
  clearUserLocalData,
  loadProfile,
  markWelcomeLeft,
} from "@/lib/storage";
import { ADMIN_EMAIL } from "@/lib/adminConstants";

function isStandalonePublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy")
  );
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hideNav, setHideNav] = useState(false);
  const [regReady, setRegReady] = useState(false);
  const [regOk, setRegOk] = useState(false);
  const [authTick, setAuthTick] = useState(0);
  const [fbUserTick, setFbUserTick] = useState(0);
  const [fbAuthResolved, setFbAuthResolved] = useState(false);
  const LAST_UID_KEY = "cj_last_firebase_uid_v1";

  useEffect(() => {
    const onAuth = () => setAuthTick((n) => n + 1);
    window.addEventListener("cj-auth-changed", onAuth);
    return () => window.removeEventListener("cj-auth-changed", onAuth);
  }, []);

  useEffect(() => {
    return onFirebaseAuthChanged((u) => {
      setFbAuthResolved(true);
      setFbUserTick((n) => n + 1);
      if (u?.uid) {
        try {
          const prev = localStorage.getItem(LAST_UID_KEY) ?? "";
          if (prev && prev !== u.uid) {
            clearUserLocalData();
          }
          localStorage.setItem(LAST_UID_KEY, u.uid);
        } catch {
          /* ignore */
        }
        void syncLocalToCloud(u.uid).catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    // Try to reduce the risk of browser storage eviction (best-effort).
    try {
      void (navigator as unknown as { storage?: { persist?: () => Promise<boolean> } })?.storage
        ?.persist?.()
        .catch?.(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (
      pathname === "/welcome" ||
      pathname === "/pick-theme" ||
      pathname === "/wizard" ||
      pathname === "/tdee" ||
      pathname === "/admin"
    ) {
      setHideNav(true);
      return;
    }
    setHideNav(false);
  }, [pathname]);

  useEffect(() => {
    const sync = () => {
      if (
        pathname === "/welcome" ||
        pathname === "/pick-theme" ||
        pathname === "/wizard" ||
        pathname === "/tdee" ||
        pathname === "/admin"
      ) {
        setHideNav(true);
        return;
      }
      setHideNav(false);
    };
    window.addEventListener("cj-profile-updated", sync);
    return () => window.removeEventListener("cj-profile-updated", sync);
  }, [pathname]);

  useEffect(() => {
    try {
      const profile = loadProfile();
      if (
        !hasLeftWelcome() &&
        (profile.onboardingComplete === true ||
          (profile.age >= 12 && profile.weightKg > 0))
      ) {
        markWelcomeLeft();
      }
      const complete = isRegistrationComplete(profile);
      const welcomeDone = hasLeftWelcome();

      if (pathname === "/pick-theme") {
        setRegOk(true);
        setRegReady(true);
        return;
      }

      if (!hasChosenAppVariant()) {
        window.location.replace("/pick-theme");
        return;
      }

      if (pathname === "/admin") {
        const u = getFirebaseCurrentUser();
        if (u?.email?.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          setRegOk(true);
          setRegReady(true);
          return;
        }
      }

      if (pathname === "/welcome") {
        setRegOk(true);
        setRegReady(true);
        return;
      }

      if (isStandalonePublicPath(pathname)) {
        setRegOk(true);
        setRegReady(true);
        return;
      }

      const internalBypass = isInternalAuthBypassActive();
      const session = isSessionActive() || Boolean(getFirebaseCurrentUser());
      const authExists = hasAuthRecord();
      const legacyUnlock = !authExists && isRegistrationComplete(profile);

      // On refresh, Firebase restores session asynchronously. Avoid redirecting to /welcome
      // before auth state is resolved, otherwise "pull to refresh" can look like a logout.
      if (!internalBypass && !legacyUnlock && !isSessionActive() && !fbAuthResolved) {
        setRegOk(false);
        setRegReady(false);
        return;
      }

      if (!internalBypass && !session && !legacyUnlock) {
        window.location.replace("/welcome");
        return;
      }

      if (pathname === "/tdee") {
        if (!complete && !welcomeDone) {
          window.location.replace("/welcome");
          return;
        }
        setRegOk(true);
        setRegReady(true);
        return;
      }

      if (complete) {
        setRegOk(true);
        setRegReady(true);
        return;
      }

      if (!welcomeDone) {
        window.location.replace("/welcome");
        return;
      }

      // Onboarding is now handled by /wizard. Avoid redirect loop when already there.
      if (pathname === "/wizard") {
        setRegOk(true);
        setRegReady(true);
        return;
      }
      window.location.replace("/wizard");
      return;
    } catch (e) {
      console.error("[AppChrome] gate", e);
      setRegOk(true);
      setRegReady(true);
    }
  }, [pathname, authTick, fbUserTick, fbAuthResolved]);

  if (!regReady || !regOk) {
    return (
      <div className="min-h-dvh pb-6">
        <AppBrandMark />
        <div className="p-8 text-center text-lg text-[var(--cherry)]" dir="rtl">
          טוען…
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        hideNav
          ? "min-h-dvh pb-6 print:pb-0"
          : "min-h-dvh pb-28 print:pb-0"
      }
    >
      <AppBrandMark />
      {children}
      <AppSearchPalette />
      <AppToastHost />
      <SoundFeedbackHost />
      {!hideNav && (
        <Suspense
          fallback={
            <div
              className="fixed bottom-0 left-0 right-0 z-[100] h-20 border-t-2 border-[var(--border-cherry-soft)] bg-white print:hidden"
              aria-hidden
            />
          }
        >
          <BottomNav />
        </Suspense>
      )}
    </div>
  );
}
