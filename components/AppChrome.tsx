"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { isRegistrationComplete, loadProfile } from "@/lib/storage";

const PUBLIC_PATHS = [
  "/welcome",
  "/tdee",
  "/terms",
  "/privacy",
  "/forgot-password",
] as const;

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hideNav, setHideNav] = useState(false);
  const [regReady, setRegReady] = useState(false);
  const [regOk, setRegOk] = useState(false);

  useEffect(() => {
    if (
      pathname === "/welcome" ||
      pathname === "/terms" ||
      pathname === "/privacy" ||
      pathname === "/forgot-password"
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
      if (pathname !== "/tdee") return;
      setHideNav(!loadProfile().onboardingComplete);
    };
    window.addEventListener("cj-profile-updated", sync);
    return () => window.removeEventListener("cj-profile-updated", sync);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/welcome" && isRegistrationComplete(loadProfile())) {
      router.replace("/");
      setRegOk(true);
      setRegReady(true);
      return;
    }
    if (PUBLIC_PATHS.includes(pathname as (typeof PUBLIC_PATHS)[number])) {
      setRegOk(true);
      setRegReady(true);
      return;
    }
    if (!isRegistrationComplete(loadProfile())) {
      router.replace("/welcome");
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
  if (!regOk && !PUBLIC_PATHS.includes(pathname as (typeof PUBLIC_PATHS)[number])) {
    /* מעבר מ־/ ל־/welcome: לא להחזיר null — זה יוצר מסך ריק עד סיום הניווט */
    if (pathname === "/" && !isRegistrationComplete(loadProfile())) {
      return (
        <div className="min-h-dvh pb-6">
          <div className="p-8 text-center text-lg text-[#333333]" dir="rtl">
            טוען…
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={
        hideNav ? "min-h-dvh pb-6 print:pb-0" : "min-h-dvh pb-24 print:pb-0"
      }
    >
      {children}
      {!hideNav && <BottomNav />}
    </div>
  );
}
