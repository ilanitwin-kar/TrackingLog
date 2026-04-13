/** גרם מאקרו בטוח ליומן — ללא NaN, שלילי → 0 */

export function finiteMacroGram(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
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
  return Math.round(
    entries.reduce((s, e) => s + finiteMacroGram(e[key]), 0)
  );
}
