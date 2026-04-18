import Link from "next/link";

export default function ForgotPasswordPage() {
  const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";
  return (
    <div
      className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-8 md:py-12"
      dir="rtl"
    >
      <Link
        href="/welcome"
        className="text-sm font-semibold text-[var(--cherry)] underline underline-offset-4"
      >
        ← חזרה למסך הכניסה
      </Link>
      <h1 className="heading-page mt-8 text-2xl">
        שכחתי סיסמה
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text)]/90">
        כרגע האפליקציה פועלת עם הרשמה מקומית במכשיר (ללא חשבון ענן). אם
        הוגדר בעתיד אימות באימייל — כאן יופיע טופס לאיפוס סיסמה.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text)]/90">
        אם איבדת גישה לנתונים במכשיר, נדרש גיבוי או פנייה לתמיכה (יש להוסיף
        כתובת דוא״ל לתמיכה כשיהיה זמין שירות).
      </p>
      <div className="mt-auto pt-12 text-center text-[10px] text-[var(--text)]/45">
        Cherry v{v}
      </div>
    </div>
  );
}
