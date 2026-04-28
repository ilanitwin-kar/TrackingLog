"use client";

import { useRouter } from "next/navigation";

type Props = {
  className?: string;
  /** לאן ללכת אם אין היסטוריה (למשל פתיחה בטאב חדש). */
  fallbackHref?: string;
  children: React.ReactNode;
};

/**
 * כפתור חזרה חכם:
 * - אם יש היסטוריה (בדרך כלל כשהגיעו ממסך אחר) עושה router.back()
 * - אחרת נופל ל-fallbackHref או לבית
 */
export function BackSmartButton({ className = "", fallbackHref = "/", children }: Props) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        try {
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
          }
        } catch {
          /* ignore */
        }
        router.push(fallbackHref);
      }}
    >
      {children}
    </button>
  );
}

