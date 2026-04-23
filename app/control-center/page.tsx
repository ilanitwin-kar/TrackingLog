"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { BackToMenuButton } from "@/components/BackToMenuButton";
import { loadProfile } from "@/lib/storage";
import { gf } from "@/lib/hebrewGenderUi";

type HubCardDef = {
  id: string;
  title: string;
  teaser: string;
  detail: string;
  href: string;
};

type HubSectionDef = {
  id: string;
  title: string;
  cards: HubCardDef[];
};

const HUB: HubSectionDef[] = [
  {
    id: "tracking",
    title: "מעקב והתקדמות",
    cards: [
      {
        id: "weight",
        title: "מעקב משקל",
        teaser: "הזיני את המשקל בשקילות קבועות — הגרף והחישובים מתעדכנים.",
        detail:
          "כאן נרשמות שקילות לפי תאריך. המשקל האחרון משמש לחישובי מסלול ויעדים. מומלץ לשקול באותה שעה ביום ולעקוב אחרי המגמה, לא אחרי תנודה יומית.",
        href: "/weight",
      },
      {
        id: "board",
        title: "לוח צבירת קלוריות",
        teaser: "כל יום שסוגרים ביומן — נצברת חסכון קלורי שמוצג על הלוח.",
        detail:
          "הלוח מחבר בין סגירת ימים ביומן לבין «הון קלורי» שמתקבל כשעומדים ביעד. כך רואים בבת אחת התקדמות ארוכת טווח בלי לצלול לכל יום בנפרד.",
        href: "/calorie-board",
      },
      {
        id: "tdee",
        title: "יעד קלוריות ופרופיל",
        teaser: "גובה, משקל, מטרה ופעילות — כך נקבעים TDEE, יעד יומי ומאקרו.",
        detail:
          "אחרי מילוי הפרטים מחושבים שריפה בסיסית (BMR), הוצאה יומית (TDEE), יעד אכילה לפי המטרה (ירידה / שמירה / בניית מסה), וחלוקת חלבון־פחמימה־שומן לפי המסלול. אפשר להוסיף גירעון ידני קטן אם צריך.",
        href: "/tdee",
      },
    ],
  },
  {
    id: "journal",
    title: "ניהול יומן ומתכונים",
    cards: [
      {
        id: "journal",
        title: "יומן אכילה",
        teaser: "רישום מה אכלת, לפי ימים, עם קלוריות ומאקרו.",
        detail:
          "היומן הוא המקום היומיומי: מוסיפים מזון, רואים מה נשאר מהיעד, וסוגרים יום כשסיימת. סגירה משפיעה על הלוח והצבירה — רק אם באמת סיימת לרשום.",
        href: "/journal",
      },
      {
        id: "recipes",
        title: "מחשבון מתכונים",
        teaser: "חישוב קלוריות ומרכיבים למנה שלמה או לפי מנות.",
        detail:
          "מתאים למתכונים מהמטבח: מזינים רכיבים וכמויות, מקבלים סיכום למנה. אפשר לשמור כמתכון במאגר האישי ולחבר לתפריטים או ליומן.",
        href: "/recipes",
      },
      {
        id: "planner",
        title: "בניית תפריט",
        teaser: "תכנון ארוחות לשבוע — בסיס לקניות וליומן.",
        detail:
          "בונים תפריט ידני לפי ימים וארוחות, רואים סיכום קלוריות, ומקשרים למתכונים או למילון. שימושי כשמארגנים שבוע מראש.",
        href: "/planner",
      },
    ],
  },
  {
    id: "libraries",
    title: "המאגרים שלי",
    cards: [
      {
        id: "my-recipes",
        title: "המתכונים שלי",
        teaser: "מתכונים ששמרת — לעריכה חוזרת ושימוש בתפריט.",
        detail:
          "כל מתכון שמור כאן עם רכיבים וערכים. אפשר לפתוח, לעדכן ולשלב בתכנון תפריט או בהוספת מזון ליומן.",
        href: "/my-recipes",
      },
      {
        id: "menus",
        title: "התפריטים שלי",
        teaser: "תבניות תפריט שמורות — טעינה חוזרת לתכנון.",
        detail:
          "שומרים תפריטים שלמים (למשל «שבוע עבודה») כדי לטעון שוב לבונה התפריט או לעיין במה שכבר בנית.",
        href: "/menus",
      },
      {
        id: "shopping",
        title: "רשימת קניות",
        teaser: "מוצרים שהוספת ממסכי המזון — רשימה אחת לסופר.",
        detail:
          "מוסיפים פריטים מחיפוש, מילון או תכנון; מסמנים מה נקנה. עוזר לחבר בין מה שמתכננים לאכול לבין מה שצריך לקנות.",
        href: "/shopping",
      },
    ],
  },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`mt-0.5 inline-block text-sm font-bold text-[var(--stem)]/50 transition-transform ${
        open ? "rotate-180" : ""
      }`}
      aria-hidden
    >
      ▼
    </span>
  );
}

function HubCard({
  card,
  gender,
  open,
  onToggle,
}: {
  card: HubCardDef;
  gender: "female" | "male";
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-[var(--border-cherry-soft)] bg-white/95 shadow-sm">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-start transition hover:bg-[var(--cherry-muted)]/35"
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-[var(--stem)]">{card.title}</h3>
          <p className="mt-1 text-xs font-medium leading-relaxed text-[var(--stem)]/80">
            {card.teaser}
          </p>
        </div>
        <Chevron open={open} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[var(--border-cherry-soft)]/60"
          >
            <div className="space-y-3 px-3 py-3">
              <p className="text-xs font-medium leading-relaxed text-[var(--stem)]/85">
                {card.detail}
              </p>
              <Link
                href={card.href}
                className="inline-flex rounded-xl border-2 border-[var(--border-cherry-soft)] bg-[var(--cherry-muted)]/40 px-3 py-2 text-xs font-extrabold text-[var(--cherry)] shadow-sm transition hover:bg-[var(--cherry-muted)]"
                onClick={(e) => e.stopPropagation()}
              >
                {gf(gender, "מעבר למסך", "מעבר למסך")}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ControlCenterPage() {
  const gender = loadProfile().gender;
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div
      className="mx-auto min-h-[100dvh] max-w-lg bg-gradient-to-b from-[#fff8fa] via-white to-[#f6faf3] px-4 py-8 pb-28 md:py-12"
      dir="rtl"
    >
      <BackToMenuButton />
      <h1 className="heading-page mb-2 text-center text-2xl md:text-3xl">
        מרכז השליטה
      </h1>
      <p className="mb-8 text-center text-sm font-medium leading-relaxed text-[var(--stem)]/80">
        {gf(
          gender,
          "כאן מסבירים בקצרה מה כל אזור באפליקציה עושה. לחצי על הכרטיס לפרטים ואז «מעבר למסך».",
          "כאן מסבירים בקצרה מה כל אזור באפליקציה עושה. לחץ על הכרטיס לפרטים ואז «מעבר למסך»."
        )}
      </p>

      <div className="space-y-8">
        {HUB.map((section) => (
          <section key={section.id}>
            <h2 className="mb-3 border-b-2 border-[var(--border-cherry-soft)]/70 pb-2 text-base font-extrabold text-[var(--cherry)]">
              {section.title}
            </h2>
            <div className="grid gap-3">
              {section.cards.map((card) => {
                const key = `${section.id}-${card.id}`;
                return (
                  <HubCard
                    key={key}
                    card={card}
                    gender={gender}
                    open={openKey === key}
                    onToggle={() =>
                      setOpenKey((prev) => (prev === key ? null : key))
                    }
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
