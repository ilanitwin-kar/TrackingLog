/** יעדי מאקרו יומיים (גרם) לפי תקציב קלוריות — פיזור 30% חלבון / 40% פחמימה / 30% שומן */
export function dailyMacroTargetsGrams(targetKcal: number): {
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  if (!Number.isFinite(targetKcal) || targetKcal <= 0) {
    return { proteinG: 0, carbsG: 0, fatG: 0 };
  }
  const proteinG = Math.max(1, Math.round((targetKcal * 0.3) / 4));
  const carbsG = Math.max(1, Math.round((targetKcal * 0.4) / 4));
  const fatG = Math.max(1, Math.round((targetKcal * 0.3) / 9));
  return { proteinG, carbsG, fatG };
}
