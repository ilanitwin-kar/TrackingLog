"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { IconNavBook, IconNavChart, IconNavHome } from "@/components/Icons";

const items = [
  { href: "/", label: "בית", Icon: IconNavHome },
  { href: "/dictionary", label: "מילון", Icon: IconNavBook },
  { href: "/report", label: "דוח", Icon: IconNavChart },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] border-t-2 border-[#FADADD] bg-white px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_20px_rgba(250,218,221,0.5)] print:hidden"
      aria-label="ניווט ראשי"
    >
      <ul className="mx-auto flex max-w-md items-end justify-center gap-8 sm:gap-14 md:gap-20">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                className={`relative flex min-w-[3.75rem] flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition-colors sm:min-w-[4.25rem] sm:py-2.5 sm:text-xs ${
                  active
                    ? "text-[#333333]"
                    : "text-[#333333]/65 hover:text-[#333333]"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-xl bg-[#FADADD]/50 ring-1 ring-[#FADADD]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
                <span className="truncate px-0.5 text-center leading-tight">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
