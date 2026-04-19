/** עזרי תצוגה — מעקב משקל מול משקל התחלה ויעד */

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** delta = משקל נוכחי − משקל התחלה (שלילי = ירידה במשקל) */
/** שורה קצרה בהיסטוריה — מול משקל התחלה */
export function formatDeltaVersusStartLine(deltaKg: number): string {
  const abs = Math.abs(deltaKg);
  if (abs < 0.0001) return "זהה למשקל ההתחלתי מהפרופיל";
  if (abs < 1) {
    const g = Math.round(abs * 1000);
    return deltaKg < 0 ? `מול ההתחלה: ירידה של ${g} גרם` : `מול ההתחלה: עלייה של ${g} גרם`;
  }
  const kg = round1(abs);
  return deltaKg < 0
    ? `מול ההתחלה: ירידה של ${kg} ק״ג`
    : `מול ההתחלה: עלייה של ${kg} ק״ג`;
}

export function formatTotalChangeFromBaseline(deltaKg: number): string {
  const abs = Math.abs(deltaKg);
  if (abs < 0.0001) return "ללא שינוי מהמשקל ההתחלתי";
  if (abs < 1) {
    const g = Math.round(abs * 1000);
    if (deltaKg < 0) return `ירדת ${g} גרם מהמשקל ההתחלתי`;
    return `עלית ${g} גרם מהמשקל ההתחלתי`;
  }
  const kg = round1(abs);
  if (deltaKg < 0) return `ירדת ${kg} ק״ג מהמשקל ההתחלתי`;
  return `עלית ${kg} ק״ג מהמשקל ההתחלתי`;
}

/** שינוי לעומת שקילה קודמת בזמן */
export function formatStepFromPrevious(prevKg: number, currKg: number): string {
  const d = currKg - prevKg;
  const abs = Math.abs(d);
  if (abs < 0.0001) return "ללא שינוי לעומת השקילה הקודמת";
  if (abs < 1) {
    const g = Math.round(abs * 1000);
    return d < 0
      ? `לעומת הקודמת: ירידה של ${g} גרם`
      : `לעומת הקודמת: עלייה של ${g} גרם`;
  }
  const kg = round1(abs);
  return d < 0
    ? `לעומת הקודמת: ירידה של ${kg} ק״ג`
    : `לעומת הקודמת: עלייה של ${kg} ק״ג`;
}

/** נותר עד יעד — goal − current: חיובי = צריך לעלות, שלילי = צריך לרדת */
export function formatRemainingToGoal(currentKg: number, goalKg: number): string {
  const diff = goalKg - currentKg;
  if (Math.abs(diff) < 0.05) return "הגעת למשקל היעד — כל הכבוד!";
  const abs = Math.abs(diff);
  const amt = abs < 1 ? `${Math.round(abs * 1000)} גרם` : `${round1(abs)} ק״ג`;
  if (diff > 0) return `נותרו לעלות ${amt} עד משקל היעד`;
  return `נותרו לרדת ${amt} עד משקל היעד`;
}

export function buildWeightShareText(params: {
  baselineKg: number;
  latestKg: number;
  goalKg: number;
  totalDelta: number;
}): string {
  const { baselineKg, latestKg, goalKg, totalDelta } = params;
  const lines = [
    "מעקב משקל — יומן אינטליגנציה קלורית",
    `משקל התחלה (מהפרופיל): ${round1(baselineKg)} ק״ג`,
    `משקל אחרון שנרשם: ${round1(latestKg)} ק״ג`,
    formatTotalChangeFromBaseline(totalDelta),
    formatRemainingToGoal(latestKg, goalKg),
  ];
  return lines.join("\n");
}
