/** לחיצה ארוכה + משיכה ימינה (שלישיית שיקולים ליומן / מילון) */

export const LONG_PRESS_MS = 520;

/** מרחק מינימלי ימינה (clientX עולה) כדי לזהות מחיקה בסוף החזקה */
export const LONG_PRESS_DELETE_RIGHT_DX = 44;

const LONG_PRESS_CANCEL_DIST2 = 900; // ~30px — ביטול רק אם לא במסלול ימינה

/**
 * ביטול טיימר לחיצה ארוכה: מאפשר תזוזה ימינה למחיקה בלי לבטל,
 * אך מבטל אם האצבע נודדת הרבה ללא משיכה ימינה (גלילה וכו׳).
 */
export function shouldCancelLongPressForSwipeDelete(
  dx: number,
  dy: number
): boolean {
  if (dx > 18) return false;
  return dx * dx + dy * dy > LONG_PRESS_CANCEL_DIST2;
}
