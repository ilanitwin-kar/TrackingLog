/** עזרי תצוגה — מעקב משקל מול משקל התחלה ויעד */

import type { WeightEntry } from "@/lib/storage";

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatTotalChangeFromBaseline(deltaKg: number): string {
  const abs = Math.abs(deltaKg);
  if (abs < 0.0001) return "ללא שינוי";
  if (abs < 1) {
    const g = Math.round(abs * 1000);
    if (deltaKg < 0) return `ירדת ${g} גרם`;
    return `עלית ${g} גרם`;
  }
  const kg = round1(abs);
  if (deltaKg < 0) return `ירדת ${kg} ק״ג`;
  return `עלית ${kg} ק״ג`;
}

/** נותר עד יעד — goal − current: חיובי = צריך לעלות, שלילי = צריך לרדת */
export function formatRemainingToGoal(currentKg: number, goalKg: number): string {
  const diff = goalKg - currentKg;
  if (Math.abs(diff) < 0.05) return "הגעת ליעד";
  const abs = Math.abs(diff);
  const amt = abs < 1 ? `${Math.round(abs * 1000)} גרם` : `${round1(abs)} ק״ג`;
  return `נותרו עוד ${amt}`;
}

/** תאריך (YYYY-MM-DD) ושעת רישום מקומית כשקיימת */
export function formatWeightEntryDateTimeLine(entry: WeightEntry): string {
  const raw = entry.recordedAt?.trim();
  if (!raw) return entry.date;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return entry.date;
  const time = d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${entry.date} · ${time}`;
}

export function buildWeightShareText(params: {
  latestKg: number;
  goalKg: number;
  totalDelta: number;
}): string {
  const { latestKg, goalKg, totalDelta } = params;
  const lines = [
    "מעקב משקל",
    `משקל אחרון: ${round1(latestKg)} ק״ג`,
    formatTotalChangeFromBaseline(totalDelta),
    formatRemainingToGoal(latestKg, goalKg),
  ];
  return lines.join("\n");
}
