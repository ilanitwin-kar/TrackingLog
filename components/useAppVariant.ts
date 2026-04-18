"use client";

import { useEffect, useState } from "react";
import { getAppVariant, type AppVariant } from "@/lib/appVariant";

export function useAppVariant(): AppVariant {
  const [v, setV] = useState<AppVariant>(() => getAppVariant() ?? "cherry");

  useEffect(() => {
    const sync = () => setV(getAppVariant() ?? "cherry");
    sync();
    window.addEventListener("cj-app-variant-changed", sync);
    return () =>
      window.removeEventListener("cj-app-variant-changed", sync);
  }, []);

  return v;
}
