"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconUser } from "@/components/Icons";
import { loadProfile, saveProfile } from "@/lib/storage";

export function ProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // פונקציה שמחזירה את המשתמש למסך הכניסה
  function goToWelcomeScreen() {
    const p = loadProfile();
    saveProfile({ ...p, onboardingComplete: false });
    setOpen(false);
    router.push("/welcome");
  }

  // סגירת התפריט בלחיצה מחוץ אליו
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
        className="flex h-11 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-xl border-2 border-[#FADADD] bg-white px-2.5 text-[#333333] shadow-sm transition hover:bg-[#fffafb] sm:min-w-[6rem]"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="תפריט פרופיל"
        onClick={() => setOpen((v) => !v)}
      >
        <IconUser className="h-6 w-6 shrink-0" />
        <span className="text-xs font-semibold">תפריט</span>
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
            
            <button
              type="button"
              role="menuitem"
              className="block w-full border-t border-[#fadadd] px-4 py-3 text-start text-sm font-semibold text-[#9b1b30] hover:bg-[#fff5f6]"
              onClick={goToWelcomeScreen}
            >
              מסך כניסה (התחלה מחדש) 🍒
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}