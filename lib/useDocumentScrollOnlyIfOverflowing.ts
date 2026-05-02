"use client";

import { useEffect } from "react";

const DEFAULT_TOLERANCE_PX = 10;

export type DocumentScrollOverflowOptions = {
  /** כבוי — לא משנים overflow (ברירת מחדל לכל האפליקציה: מופעל) */
  enabled?: boolean;
  /** שינוי ערך גורם למדידה מחדש (אורך רשימה, תאריך וכו׳) */
  remeasureKey?: string | number;
  /** סף פיקסלים: מתחת לזה נחשב „אין גלילה” (נייד — עדיף גבוה יותר) */
  tolerancePx?: number;
  /** להשתמש בגובה visualViewport (כתובות/כרום נייד) */
  preferVisualViewportHeight?: boolean;
  /** תמיד למנוע משיכת-יתר אנכית — גם כשיש גלילה */
  forceOverscrollNone?: boolean;
};

/**
 * כשאין תוכן שגולש מעבר לגובה המסך — מונע גלילת document מיותרת ובמשיכה למעלה (overscroll).
 * כשיש עודף — משאיר את ברירת המחדל (גלילה רגילה).
 */
export function useDocumentScrollOnlyIfOverflowing(
  opts?: DocumentScrollOverflowOptions
): void {
  const enabled = opts?.enabled ?? true;
  const remeasureKey = opts?.remeasureKey ?? 0;
  const tolerancePx = opts?.tolerancePx ?? DEFAULT_TOLERANCE_PX;
  const preferVV = opts?.preferVisualViewportHeight ?? false;
  const forceOverscrollNone = opts?.forceOverscrollNone ?? false;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const html = document.documentElement;
    const body = document.body;

    const clearOverflow = () => {
      html.style.overflowY = "";
      body.style.overflowY = "";
    };

    const clearOverscroll = () => {
      html.style.overscrollBehaviorY = "";
      body.style.overscrollBehaviorY = "";
    };

    const apply = () => {
      requestAnimationFrame(() => {
        const docH = Math.ceil(html.scrollHeight);
        const vv = window.visualViewport;
        const viewH = Math.floor(
          preferVV && vv && vv.height > 0 ? vv.height : html.clientHeight
        );
        const needsScroll = docH > viewH + tolerancePx;

        if (forceOverscrollNone) {
          html.style.overscrollBehaviorY = "none";
          body.style.overscrollBehaviorY = "none";
        }

        if (needsScroll) {
          clearOverflow();
          if (!forceOverscrollNone) {
            clearOverscroll();
          }
        } else {
          html.style.overflowY = "hidden";
          body.style.overflowY = "hidden";
          if (!forceOverscrollNone) {
            html.style.overscrollBehaviorY = "none";
            body.style.overscrollBehaviorY = "none";
          }
        }
      });
    };

    apply();
    const t = window.setTimeout(apply, 50);
    const t2 = window.setTimeout(apply, 200);

    const ro = new ResizeObserver(() => apply());
    ro.observe(document.body);
    ro.observe(html);

    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
      clearOverflow();
      clearOverscroll();
    };
  }, [
    enabled,
    remeasureKey,
    tolerancePx,
    preferVV,
    forceOverscrollNone,
  ]);
}
