import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div
      className="mx-auto max-w-lg px-4 py-8 md:py-12"
      dir="rtl"
    >
      <Link
        href="/welcome"
        className="text-sm font-semibold text-[#9b1b30] underline underline-offset-4"
      >
        ← חזרה
      </Link>
      <h1 className="heading-page mt-6 text-2xl">
        מדיניות פרטיות — Cherry
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text)]/90">
        מסמך זה מתאר בקצרה את עקרונות הפרטיות לצורכי חנויות האפליקציות. יש
        להחליפו בנוסח מלא בהתאם לדין החל (לרבות GDPR / חוק הגנת הפרטיות
        בישראל) לאחר ייעוץ משפטי.
      </p>
      <ul className="mt-4 list-disc space-y-2 pe-5 text-sm leading-relaxed text-[var(--text)]/90">
        <li>
          נתוני פרופיל והזנות מזון נשמרים בעיקר במכשיר (local storage) אלא אם
          הוגדר אחרת בשירות עתידי.
        </li>
        <li>לא מוכרים נתוני משתמשות לצד שלישי לצורכי פרסום.</li>
        <li>
          שירותים חיצוניים (למשל חיפוש מוצרים) עשויים לקבל בקשות רשת לפי
          השימוש שלך באפליקציה — ראי תיעוד השירותים הרלוונטיים.
        </li>
        <li>ניתן לפנות אלינו בבקשות מחיקה או עדכון — יש להוסיף כאן פרטי קשר.</li>
      </ul>
      <p className="mt-6 text-xs text-[var(--text)]/55">
        עדכון אחרון לדוגמה: אפריל 2026
      </p>
    </div>
  );
}
