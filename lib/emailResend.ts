import { Resend } from "resend";

export type EmailGender = "male" | "female";

let resendSingleton: Resend | null = null;

export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendSingleton) resendSingleton = new Resend(key);
  return resendSingleton;
}

/** כתובת שולח מאומתת ב-Resend (למשל onboarding@resend.dev לבדיקות, או noreply@yourdomain.com בפרודקשן) */
export function getResendFromAddress(): string {
  return (
    process.env.RESEND_FROM_ADDRESS?.trim() || "onboarding@resend.dev"
  );
}

function fromHeader(gender: EmailGender): string {
  const addr = getResendFromAddress();
  if (gender === "male") {
    return `Blueberry 🫐 <${addr}>`;
  }
  return `Cherry 🍒 <${addr}>`;
}

function wrapHtml(inner: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:24px;background:#faf7f8;font-family:system-ui,-apple-system,sans-serif;color:#2d1f24;line-height:1.6;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    ${inner}
  </div>
</body>
</html>`;
}

export function buildWelcomeEmail(gender: EmailGender): {
  subject: string;
  html: string;
  from: string;
} {
  const from = fromHeader(gender);
  if (gender === "male") {
    return {
      from,
      subject: "ברוך הבא ל-BLUE (Blueberry) 🫐",
      html: wrapHtml(
        `
        <p style="margin:0 0 16px;">שלום,</p>
        <p style="margin:0 0 16px;">תודה שנרשמת ל-<strong>BLUE</strong> (Blueberry 🫐) — יומן הקלוריות החכם שלך.</p>
        <p style="margin:0 0 16px;">אנחנו כאן ללוות אותך בדרך ליעד. כבר התחלת? היכנס לאפליקציה והמשך למילוי הפרטים.</p>
        <p style="margin:24px 0 0;color:#6b4b55;">בהצלחה,<br/><strong>Blueberry</strong> 🫐</p>
        `,
        "ברוך הבא"
      ),
    };
  }
  return {
    from,
    subject: "ברוכה הבאה ל-Cherry 🍒",
    html: wrapHtml(
      `
      <p style="margin:0 0 16px;">שלום,</p>
      <p style="margin:0 0 16px;">תודה שנרשמת ל-<strong>Cherry</strong> 🍒 — יומן הקלוריות החכם שלך.</p>
      <p style="margin:0 0 16px;">אנחנו כאן ללוות אותך בדרך ליעד. כבר התחלת? היכנסי לאפליקציה והמשיכי למילוי הפרטים.</p>
      <p style="margin:24px 0 0;color:#6b4b55;">בהצלחה,<br/><strong>Cherry</strong> 🍒</p>
      `,
      "ברוכה הבאה"
    ),
  };
}

export function buildPasswordResetEmail(
  gender: EmailGender,
  resetLink: string
): { subject: string; html: string; from: string } {
  const from = fromHeader(gender);
  const safeLink = resetLink.replace(/"/g, "&quot;");
  if (gender === "male") {
    return {
      from,
      subject: "איפוס סיסמה — BLUE (Blueberry) 🫐",
      html: wrapHtml(
        `
        <p style="margin:0 0 16px;">שלום,</p>
        <p style="margin:0 0 16px;">קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך.</p>
        <p style="margin:0 0 20px;">לחץ על הכפתור כדי לבחור סיסמה חדשה:</p>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${safeLink}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;">איפוס סיסמה</a>
        </p>
        <p style="margin:0;font-size:13px;color:#666;">אם לא ביקשת איפוס — אפשר להתעלם מהמייל.</p>
        <p style="margin:24px 0 0;color:#6b4b55;">בברכה,<br/><strong>Blueberry</strong> 🫐</p>
        `,
        "איפוס סיסמה"
      ),
    };
  }
  return {
    from,
    subject: "איפוס סיסמה — Cherry 🍒",
    html: wrapHtml(
      `
      <p style="margin:0 0 16px;">שלום,</p>
      <p style="margin:0 0 16px;">קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך.</p>
      <p style="margin:0 0 20px;">לחצי על הכפתור כדי לבחור סיסמה חדשה:</p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${safeLink}" style="display:inline-block;background:#9e2a4a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;">איפוס סיסמה</a>
      </p>
      <p style="margin:0;font-size:13px;color:#666;">אם לא ביקשת איפוס — אפשר להתעלם מהמייל.</p>
      <p style="margin:24px 0 0;color:#6b4b55;">בברכה,<br/><strong>Cherry</strong> 🍒</p>
      `,
      "איפוס סיסמה"
    ),
  };
}

export async function sendWelcomeEmail(
  to: string,
  gender: EmailGender
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY לא מוגדר" };
  }
  const { subject, html, from } = buildWelcomeEmail(gender);
  const { error } = await resend.emails.send({
    from,
    to: [to.trim()],
    subject,
    html,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function sendPasswordResetEmailResend(
  to: string,
  gender: EmailGender,
  resetLink: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY לא מוגדר" };
  }
  const { subject, html, from } = buildPasswordResetEmail(gender, resetLink);
  const { error } = await resend.emails.send({
    from,
    to: [to.trim()],
    subject,
    html,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
