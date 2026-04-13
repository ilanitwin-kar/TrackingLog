"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { IconUser } from "@/components/Icons";

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
    }
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[#FADADD] bg-white text-[#333333] shadow-sm transition hover:bg-[#fffafb]"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="תפריט פרופיל"
        onClick={() => setOpen((v) => !v)}
      >
        <IconUser className="h-6 w-6" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute start-0 top-[calc(100%+0.5rem)] z-[200] min-w-[16rem] overflow-hidden rounded-xl border-2 border-[#FADADD] bg-white py-1 shadow-lg"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="menu"
          >
            <Link
              href="/weight"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[#333333] hover:bg-[#FADADD]/40"
              onClick={() => setOpen(false)}
            >
              מעקב משקל
            </Link>
            <Link
              href="/tdee"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[#333333] hover:bg-[#FADADD]/40"
              onClick={() => setOpen(false)}
            >
              מילוי פרטים
            </Link>
            <Link
              href="/explorer"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[#333333] hover:bg-[#FADADD]/40"
              onClick={() => setOpen(false)}
            >
              מגלה המזונות
            </Link>
            <Link
              href="/shopping"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[#333333] hover:bg-[#FADADD]/40"
              onClick={() => setOpen(false)}
            >
              רשימת קניות
            </Link>
            <Link
              href="/calorie-board"
              role="menuitem"
              className="block px-4 py-3 text-sm font-semibold text-[#333333] hover:bg-[#FADADD]/40"
              onClick={() => setOpen(false)}
            >
              לוח צבירת קלוריות
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
