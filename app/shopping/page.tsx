"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import {
  IconEnvelope,
  IconPrinter,
  IconTrash,
  IconWhatsApp,
} from "@/components/Icons";
import {
  loadShopping,
  removeShopping,
  toggleShoppingChecked,
  type ShoppingItem,
} from "@/lib/explorerStorage";
import {
  buildShoppingListShareText,
  SHOPPING_LIST_SHARE_HEADER,
} from "@/lib/shoppingExport";

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);

  const refresh = useCallback(() => {
    setItems(loadShopping());
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, [refresh]);

  function toggle(id: string) {
    setItems(toggleShoppingChecked(id));
  }

  function remove(id: string) {
    setItems(removeShopping(id));
  }

  const shareText = buildShoppingListShareText(items);
  const canExport = items.length > 0;

  function shareWhatsApp() {
    if (!canExport) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function shareEmail() {
    if (!canExport) return;
    const subject = "רשימת קניות — אינטליגנציה קלורית";
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText)}`;
  }

  function printList() {
    if (!canExport) return;
    window.print();
  }

  const exportBtnClass =
    "inline-flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-[#FADADD] bg-white px-3 text-sm font-semibold text-[#333333] shadow-sm transition hover:bg-[#fffafb] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:min-w-0 sm:px-2.5";

  return (
    <>
      <div
        className="mx-auto max-w-lg px-4 pb-28 pt-8 md:pt-12 print:hidden"
        dir="rtl"
      >
        <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-3 sm:gap-y-2">
          <BackToMenuButton wrapperClassName="mb-0" />
          <nav
            className="flex flex-wrap items-center justify-center gap-2"
            aria-label="ייצוא רשימת קניות"
          >
            <button
              type="button"
              disabled={!canExport}
              className={exportBtnClass}
              title="שתף ב-WhatsApp"
              aria-label="שתף ב-WhatsApp"
              onClick={shareWhatsApp}
            >
              <IconWhatsApp className="h-5 w-5 shrink-0 text-[#25D366]" />
              <span className="hidden sm:inline">שתף ב-WhatsApp</span>
            </button>
            <button
              type="button"
              disabled={!canExport}
              className={exportBtnClass}
              title="שלח במייל"
              aria-label="שלח במייל"
              onClick={shareEmail}
            >
              <IconEnvelope className="h-5 w-5 shrink-0 text-[#c45c74]" />
              <span className="hidden sm:inline">שלח במייל</span>
            </button>
            <button
              type="button"
              disabled={!canExport}
              className={exportBtnClass}
              title="הדפסה"
              aria-label="הדפסה"
              onClick={printList}
            >
              <IconPrinter className="h-5 w-5 shrink-0 text-[#333333]/90" />
              <span className="hidden sm:inline">הדפסה</span>
            </button>
          </nav>
        </div>

        <motion.h1
          className="mb-6 text-center text-3xl font-extrabold text-[#333333] md:text-4xl"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          רשימת קניות
        </motion.h1>

        <motion.section
          className="glass-panel p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {items.length === 0 ? (
            <p className="text-center text-[#333333]/85">הרשימה ריקה.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <motion.li
                  key={it.id}
                  layout
                  className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-[#FADADD] bg-white px-3 py-3 ${
                    it.checked ? "opacity-70" : ""
                  }`}
                  style={{ boxShadow: "0 2px 12px rgba(250,218,221,0.35)" }}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={it.checked}
                      onChange={() => toggle(it.id)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-[#FADADD]"
                      aria-label={`סימון ${it.name}`}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block font-semibold text-[#333333] ${
                          it.checked ? "line-through" : ""
                        }`}
                      >
                        {it.name}
                      </span>
                      <span className="text-xs text-[#333333]/75">
                        {it.category}
                      </span>
                      <span className="mt-0.5 block text-sm text-[#333333]/85">
                        ~{Math.round(it.calories)} קק״ל ל־100 גרם
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn-icon-luxury btn-icon-luxury-danger shrink-0"
                    title="מחיקה"
                    aria-label={`מחיקת ${it.name}`}
                    onClick={() => remove(it.id)}
                  >
                    <IconTrash className="h-5 w-5" />
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      {/* תצוגת הדפסה בלבד */}
      <div
        className="hidden bg-white text-black print:block print:min-h-screen print:p-8"
        dir="rtl"
      >
        <h1 className="mb-4 text-xl font-bold">{SHOPPING_LIST_SHARE_HEADER}</h1>
        {items.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-base leading-relaxed">
            {items.map((it) => (
              <li key={`print-${it.id}`}>{it.name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[#333]/80">אין פריטים ברשימה.</p>
        )}
      </div>
    </>
  );
}
