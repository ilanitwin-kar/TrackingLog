import Link from "next/link";

export default function TermsPage() {
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
        תנאי שימוש — Cherry
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text)]/90">
        מסמך זה נועד לעמוד בדרישות חנויות האפליקציות (Apple / Google) ולשקף
        באופן כללי את השימוש באפליקציה. יש להחליף את התוכן בנוסח משפטי מלא
        שאושר על ידי יועץ משפטי לפני פרסום בסטור.
      </p>
      <ul className="mt-4 list-disc space-y-2 pe-5 text-sm leading-relaxed text-[var(--text)]/90">
        <li>האפליקציה מסופקת &quot;כמות שהיא&quot; (AS IS) לצורכי מעקב תזונתי אישי.</li>
        <li>אין באפליקציה ייעוץ רפואי; יש להתייעץ עם איש מקצוע לפני שינוי תזונה או פעילות.</li>
        <li>הנתונים נשמרים במכשירך; את אחראית לגיבוי ולשמירה על המכשיר.</li>
        <li>אנו רשאים לעדכן תנאים אלה; שימוש מתמשך מהווה הסכמה לעדכון.</li>
      </ul>
      <p className="mt-6 text-xs text-[var(--text)]/55">
        עדכון אחרון לדוגמה: אפריל 2026
      </p>
    </div>
  );
}
