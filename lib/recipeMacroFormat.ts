/**
 * תצוגת מאקרו אחידה למתכונים:
 * קלוריות — מספר ואז «קל׳».
 * חלבון / פחמימות / שומן — אות מקוצרת ואז המספר (ח׳ 12 · פ׳ 14 · ש׳ 2).
 */
export function formatRecipeMacroAbbrev(
  kcal: number,
  protein: number,
  carbs: number,
  fat: number
): string {
  return `${kcal} קל׳ · ח׳ ${protein} · פ׳ ${carbs} · ש׳ ${fat}`;
}
