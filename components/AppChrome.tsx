"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { isRegistrationComplete, loadProfile } from "@/lib/storage";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hideNav, setHideNav] = useState(false);
  const [regReady, setRegReady] = useState(false);
  const [regOk, setRegOk] = useState(false);

  useEffect(() => {
    if (pathname === "/add-food") {
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
      if (pathname === "/add-food") {
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
    if (pathname === "/tdee") {
      setRegOk(true);
      setRegReady(true);
      return;
    }
    if (!isRegistrationComplete(loadProfile())) {
      router.replace("/tdee");
      setRegOk(false);
      setRegReady(true);
      return;
    }
    setRegOk(true);
    setRegReady(true);
  }, [pathname, router]);

  if (!regReady) {
    return (
      <div className="min-h-dvh pb-6">
        <div className="p-8 text-center text-lg text-[#333333]" dir="rtl">
          טוען…
        </div>
      </div>
    );
  }
  if (!regOk && pathname !== "/tdee") {
    return null;
  }

  return (
    <div
      className={
        hideNav
          ? "min-h-dvh pb-6 print:pb-0"
          : "min-h-dvh pb-28 print:pb-0"
      }
    >
      {children}
      {!hideNav && (
        <Suspense
          fallback={
            <div
              className="fixed bottom-0 left-0 right-0 z-[100] h-20 border-t-2 border-[#FADADD] bg-white print:hidden"
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
