/** גרם מאקרו בטוח ליומן — ללא NaN, שלילי → 0 */

export function finiteMacroGram(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** תצוגת גרמים ביומן — עד ספרה אחרי הנקודה (לא עיגול לשלם) */
export function formatMacroGramAmount(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Math.round(Math.max(0, n) * 10) / 10;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

export function formatMacroGramWithUnit(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${formatMacroGramAmount(n)} ג׳`;
}

/** לשמירה ב-LogEntry רק כשיש ערך מהשרת (מאגר); חסר → undefined */
export function optionalMacroGram(n: unknown): number | undefined {
  if (n === undefined || n === null) return undefined;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n));
}

export function sumMacroGrams(
  entries: readonly { proteinG?: number; carbsG?: number; fatG?: number }[],
  key: "proteinG" | "carbsG" | "fatG"
): number {
  const raw = entries.reduce((s, e) => {
    const v = e[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return s;
    return s + Math.max(0, v);
  }, 0);
  return Math.round(raw * 10) / 10;
}
