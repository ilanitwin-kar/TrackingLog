"use client";

import { usePathname } from "next/navigation";
import { CherryMark } from "@/components/CherryMark";

/** מותג Cherry בפינה השמאלית העליונה (LTR) — בכל המסכים פרט למסך כניסה */
export function AppBrandMark() {
  const pathname = usePathname();
  if (pathname === "/welcome") return null;

  return (
    <div
      className="pointer-events-none fixed left-[max(0.65rem,env(safe-area-inset-left))] top-[max(0.45rem,env(safe-area-inset-top))] z-[250] flex items-center gap-1"
      dir="ltr"
      aria-hidden
    >
      <CherryMark className="h-7 w-9 shrink-0 drop-shadow-sm sm:h-8 sm:w-10" />
      <span className="select-none font-[system-ui,'Segoe_UI',sans-serif] text-[0.88rem] font-extrabold tracking-tight text-[var(--cherry)] drop-shadow-[0_1px_0_rgba(255,255,255,0.85)] sm:text-[0.95rem]">
        Cherry
      </span>
    </div>
  );
}
