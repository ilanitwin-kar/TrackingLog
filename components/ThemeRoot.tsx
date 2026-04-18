"use client";

import { useLayoutEffect } from "react";
import {
  applyAppVariantToDocument,
  getAppVariant,
  type AppVariant,
} from "@/lib/appVariant";

/** מסנכרן data-app-theme על html לפני ציור — מניע הבהוב */
export function ThemeRoot() {
  useLayoutEffect(() => {
    const v = getAppVariant();
    applyAppVariantToDocument((v ?? "cherry") as AppVariant);

    function onChange() {
      const next = getAppVariant();
      applyAppVariantToDocument((next ?? "cherry") as AppVariant);
    }
    window.addEventListener("cj-app-variant-changed", onChange);
    return () =>
      window.removeEventListener("cj-app-variant-changed", onChange);
  }, []);

  return null;
}
