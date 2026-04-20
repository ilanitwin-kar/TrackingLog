"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppBrandMark } from "@/components/AppBrandMark";
import { BottomNav } from "@/components/BottomNav";
import {
  hasAuthRecord,
  isInternalAuthBypassActive,
  isSessionActive,
} from "@/lib/localAuth";
import { hasChosenAppVariant } from "@/lib/appVariant";
import {
  hasLeftWelcome,
  isRegistrationComplete,
  loadProfile,
  markWelcomeLeft,
} from "@/lib/storage";

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

  useEffect(() => {
    const onAuth = () => setAuthTick((n) => n + 1);
    window.addEventListener("cj-auth-changed", onAuth);
    return () => window.removeEventListener("cj-auth-changed", onAuth);
  }, []);

  useEffect(() => {
    if (
      pathname === "/add-food" ||
      pathname === "/add-food-ai" ||
      pathname === "/welcome" ||
      pathname === "/pick-theme"
    ) {
      setHideNav(true);
      return;
    }
    if (pathname !== "/tdee") {
      setHideNav(false);
      return;
    }
    setHideNav(!loadProfile().onboardingComplete);
  }, [pathname]);

  useEffect(() => {
    const sync = () => {
      if (
        pathname === "/add-food" ||
        pathname === "/add-food-ai" ||
        pathname === "/welcome" ||
        pathname === "/pick-theme"
      ) {
        setHideNav(true);
        return;
      }
      if (pathname !== "/tdee") return;
      setHideNav(!loadProfile().onboardingComplete);
    };
    window.addEventListener("cj-profile-updated", sync);
    return () => window.removeEventListener("cj-profile-updated", sync);
  }, [pathname]);

  useEffect(() => {
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
    const session = isSessionActive();
    const authExists = hasAuthRecord();
    const legacyUnlock = !authExists && isRegistrationComplete(profile);

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

    window.location.replace("/tdee");
    return;
  }, [pathname, authTick]);

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
