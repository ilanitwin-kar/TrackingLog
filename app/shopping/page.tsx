"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { InfoCard } from "@/components/InfoCard";
import {
  IconEnvelope,
  IconPrinter,
  IconTrash,
  IconWhatsApp,
} from "@/components/Icons";
import { ShoppingItemModal } from "@/components/ShoppingItemModal";
import { ShoppingTopNav } from "@/components/ShoppingTopNav";
import {
  loadShopping,
  removeShopping,
  toggleShoppingChecked,
  type ShoppingItem,
} from "@/lib/explorerStorage";
import { shoppingIntroBody, shoppingIntroTitle } from "@/lib/hebrewGenderUi";
import {
  buildShoppingListShareText,
  SHOPPING_LIST_SHARE_HEADER,
} from "@/lib/shoppingExport";
import { loadProfile } from "@/lib/storage";

export default function ShoppingPage() {
  const gender = loadProfile().gender;
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ShoppingItem | null>(null);

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

  function openAdd() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(it: ShoppingItem) {
    setEditTarget(it);
    setModalOpen(true);
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
    "inline-flex min-h-[3.25rem] min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-2 py-2 text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:min-h-[2.75rem] sm:flex-row sm:gap-2 sm:px-3";

  return (
    <>
      <div
        className="mx-auto max-w-lg px-4 pb-28 pt-8 md:pt-12 print:hidden"
        dir="rtl"
      >
        <ShoppingTopNav onAddPersonal={openAdd} />

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <InfoCard
            gender={gender}
            icon="🧺"
            title={shoppingIntroTitle()}
            body={shoppingIntroBody(gender)}
            className="mb-5"
          />
        </motion.div>

        <motion.h1
          className="heading-page mb-6 text-center text-3xl md:text-4xl"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          רשימת קניות
        </motion.h1>

        <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-3 sm:gap-y-2">
          <nav
            className="flex flex-wrap items-center justify-center gap-2"
            aria-label="ייצוא רשימת קניות"
          >
            <button
              type="button"
              disabled={!canExport}
              className={exportBtnClass}
              title="שיתוף הרשימה בוואטסאפ"
              aria-label="וואטסאפ — שיתוף הרשימה בוואטסאפ"
              onClick={shareWhatsApp}
            >
              <IconWhatsApp className="h-5 w-5 shrink-0 text-[#25D366]" />
              <span className="max-w-[4.5rem] text-center text-[10px] font-bold leading-tight sm:max-w-none sm:text-sm">
                וואטסאפ
              </span>
            </button>
            <button
              type="button"
              disabled={!canExport}
              className={exportBtnClass}
              title="שליחת הרשימה במייל"
              aria-label="מייל — שליחת הרשימה במייל"
              onClick={shareEmail}
            >
              <IconEnvelope className="h-5 w-5 shrink-0 text-[var(--cherry)]" />
              <span className="max-w-[4.5rem] text-center text-[10px] font-bold leading-tight sm:max-w-none sm:text-sm">
                מייל
              </span>
            </button>
            <button
              type="button"
              disabled={!canExport}
              className={exportBtnClass}
              title="הדפסת רשימת הקניות"
              aria-label="הדפסה — הדפסת הרשימה"
              onClick={printList}
            >
              <IconPrinter className="h-5 w-5 shrink-0 text-[var(--stem)]" />
              <span className="max-w-[4.5rem] text-center text-[10px] font-bold leading-tight sm:max-w-none sm:text-sm">
                הדפסה
              </span>
            </button>
          </nav>
        </div>

        <motion.section
          className="glass-panel p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {items.length === 0 ? (
            <p className="text-center text-[var(--cherry)]/85">הרשימה ריקה.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => {
                const qty = it.qty ?? 1;
                return (
                  <motion.li
                    key={it.id}
                    layout
                    className={`flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--border-cherry-soft)] bg-white px-3 py-3 ${
                      it.checked ? "opacity-70" : ""
                    }`}
                    style={{ boxShadow: "var(--list-row-shadow)" }}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={it.checked}
                        onChange={() => toggle(it.id)}
                        className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--border-cherry-soft)]"
                        aria-label={`סימון ${it.name}`}
                      />
                      <span className="min-w-0">
                        <span
                          className={`block font-semibold text-[var(--stem)] ${
                            it.checked ? "line-through" : ""
                          }`}
                        >
                          {it.name}
                          {qty !== 1 ? (
                            <span className="ms-1 text-sm font-bold text-[var(--cherry)]">
                              ×{qty}
                            </span>
                          ) : null}
                        </span>
                        {it.brand ? (
                          <span className="mt-0.5 block text-xs text-[var(--stem)]/80">
                            {it.brand}
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--cherry)]/75">
                          {it.category}
                        </span>
                        <span className="mt-0.5 block text-sm text-[var(--stem)]/85">
                          ~{Math.round(it.calories)} קק״ל ל־100 גרם
                        </span>
                      </span>
                    </label>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        className="btn-icon-luxury flex min-w-[2.75rem] flex-col items-center gap-0.5 py-1"
                        title="עריכה"
                        aria-label={`עריכת ${it.name}`}
                        onClick={() => openEdit(it)}
                      >
                        <span className="text-lg" aria-hidden>
                          ✏️
                        </span>
                        <span className="text-[9px] font-bold text-[var(--cherry)]">
                          עריכה
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn-icon-luxury btn-icon-luxury-danger flex min-w-[2.75rem] flex-col items-center gap-0.5 py-1"
                        title="הסרה מרשימת הקניות"
                        aria-label={`מחיקה — הסרת ${it.name} מהרשימה`}
                        onClick={() => remove(it.id)}
                      >
                        <IconTrash className="h-5 w-5" />
                        <span className="text-[9px] font-bold text-[var(--cherry)]">
                          מחק
                        </span>
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </motion.section>
      </div>

      <ShoppingItemModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
        }}
        editingItem={editTarget}
        onSaved={refresh}
      />

      {/* תצוגת הדפסה בלבד */}
      <div
        className="hidden bg-white text-black print:block print:min-h-screen print:p-8"
        dir="rtl"
      >
        <h1 className="mb-4 text-xl font-bold">{SHOPPING_LIST_SHARE_HEADER}</h1>
        {items.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-base leading-relaxed">
            {items.map((it) => {
              const q = it.qty != null && it.qty !== 1 ? ` ×${it.qty}` : "";
              return (
                <li key={`print-${it.id}`}>
                  {it.name}
                  {q}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[var(--text)]/80">אין פריטים ברשימה.</p>
        )}
      </div>
    </>
  );
}
