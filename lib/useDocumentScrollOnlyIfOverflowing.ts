"use client";

import { useEffect } from "react";

const TOLERANCE_PX = 6;

/**
 * כשאין תוכן שגולש מעבר לגובה המסך — מונע גלילת document מיותרת (במיוחד כשההדר זורם).
 * כשיש עודף — משאיר את ברירת המחדל (גלילה רגילה).
 */
export function useDocumentScrollOnlyIfOverflowing(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const apply = () => {
      requestAnimationFrame(() => {
        const docH = Math.ceil(html.scrollHeight);
        const viewH = Math.floor(html.clientHeight);
        const needsScroll = docH > viewH + TOLERANCE_PX;
        if (needsScroll) {
          html.style.overflowY = "";
          body.style.overflowY = "";
          html.style.overscrollBehaviorY = "";
        } else {
          html.style.overflowY = "hidden";
          body.style.overflowY = "hidden";
          html.style.overscrollBehaviorY = "none";
        }
      });
    };

    apply();
    const t = window.setTimeout(apply, 50);

    const ro = new ResizeObserver(() => apply());
    ro.observe(document.body);

    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      html.style.overflowY = "";
      body.style.overflowY = "";
      html.style.overscrollBehaviorY = "";
    };
  }, []);
}
