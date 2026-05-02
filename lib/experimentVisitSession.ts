import { getTodayKey } from "@/lib/dateKey";

const KEY = "cj_experiment_daily_session_v1";

type Stored = { d: string; n: number };

/**
 * מונה כניסות יומיות למסך הניסיון — רק localStorage, מהיר.
 * מחזיר את מספר הכניסה הנוכחית (1 = ראשונה היום).
 */
export function bumpExperimentSessionCount(): number {
  const today = getTodayKey();
  let next = 1;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Stored>;
      if (j.d === today && typeof j.n === "number" && j.n >= 1) {
        next = j.n + 1;
      }
    }
    localStorage.setItem(KEY, JSON.stringify({ d: today, n: next } satisfies Stored));
  } catch {
    /* ignore */
  }
  return next;
}
