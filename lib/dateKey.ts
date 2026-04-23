/** Local calendar YYYY-MM-DD for streaks / daily logs */
export function getTodayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** n ימים אחרונים כולל היום — מהעתיק לחדש */
export function getLastNDateKeysIncludingToday(n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(d.toLocaleDateString("en-CA"));
  }
  return keys;
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toLocaleDateString("en-CA");
}

/** שבוע קלנדרי א׳–ש׳ המכיל את התאריך (מזהים YYYY-MM-DD) */
export function getCalendarWeekDateKeys(anchorDateKey: string): string[] {
  const d = new Date(`${anchorDateKey}T12:00:00`);
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay());
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(sun);
    x.setDate(sun.getDate() + i);
    keys.push(x.toLocaleDateString("en-CA"));
  }
  return keys;
}

/**
 * מפת התקדמות: משבצת 0 = היום, הלאה = ימים קדימה בציר היעד.
 * מחזיר בדיוק `dayCount` תאריכים — ללא תקרה, ללא ברירת מחדל של 1/30.
 * אם `dayCount` לא שלם חיובי — מערך ריק.
 */
export function getCalorieBoardDateSequence(dayCount: number): string[] {
  const n = Math.floor(Number(dayCount));
  if (!Number.isFinite(n) || n < 1) {
    return [];
  }
  const today = getTodayKey();
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    keys.push(addDaysToDateKey(today, i));
  }
  return keys;
}

/** כל התאריכים מ-startKey ועד היום (כולל), מהישן לחדש */
export function getDateKeysFromStartToToday(startKey: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey)) return [getTodayKey()];
  const today = getTodayKey();
  const keys: string[] = [];
  let k = startKey;
  // תקרה בטיחותית (10 שנים)
  for (let i = 0; i < 3650; i++) {
    if (k > today) break;
    keys.push(k);
    if (k === today) break;
    k = addDaysToDateKey(k, 1);
  }
  return keys;
}

/** רצף תאריכים מ-startKey קדימה לאורך count ימים (כולל startKey). */
export function getDateKeysFromStartCount(startKey: string, count: number): string[] {
  const n = Math.floor(Number(count));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !Number.isFinite(n) || n < 1) {
    return [getTodayKey()];
  }
  const keys: string[] = [];
  let k = startKey;
  for (let i = 0; i < Math.min(3650, n); i++) {
    keys.push(k);
    k = addDaysToDateKey(k, 1);
  }
  return keys;
}
