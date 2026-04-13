import type { Gender } from "@/lib/tdee";

/**
 * Hebrew phrase for journal close gap (consumption minus TDEE).
 * Positive = over TDEE; negative = deficit; zero = balanced.
 * `gender` reserved for future wording tweaks; spelling is usually identical in ktiv maleh.
 */
export function formatClosedDayCalorieGapPhrase(
  gapKcal: number,
  _gender: Gender
): string {
  const n = Math.abs(Math.round(gapKcal));
  const num = n.toLocaleString("he-IL");

  if (gapKcal > 0) {
    return `\u05d7\u05e8\u05d2\u05ea \u05d1\u2011${num} \u05e7\u05dc\u05d5\u05e8\u05d9\u05d5\u05ea`;
  }
  if (gapKcal < 0) {
    return `\u05d2\u05e8\u05e2\u05ea ${num} \u05e7\u05dc\u05d5\u05e8\u05d9\u05d5\u05ea`;
  }
  return "\u05d0\u05d9\u05df \u05e4\u05e2\u05e8 \u2014 \u05e1\u05d2\u05d9\u05e8\u05ea \u05d4\u05d9\u05d5\u05dd \u05e2\u05dc \u05d4\u05d9\u05e2\u05d3";
}
