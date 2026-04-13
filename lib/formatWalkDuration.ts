/**
 * מציג משך הליכה בעברית: דקות בלבד, או שעות + דקות.
 */
export function formatWalkingMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) {
    return `${m} דקות`;
  }
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const hourLabel = h === 1 ? "שעה" : `${h} שעות`;
  if (rem === 0) {
    return hourLabel;
  }
  return `${hourLabel} ו־${rem} דקות`;
}
