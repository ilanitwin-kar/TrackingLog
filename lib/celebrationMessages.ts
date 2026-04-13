import type { Gender } from "@/lib/tdee";

function halfFemale(): string[] {
  return [
    "התקדמות מעולה — ממשיכים בדיוק ככה!",
    "את בשליטה — וזה כבר חצי דרך!",
    "חצי יעד כבר מאחוריי — זה לא מובן מאליו",
    "עוד צעד קטן ואת שם — קצב מעולה",
    "את מוכיחה לעצמך שזה אפשרי",
    "איזה פוקוס — זה נראה טוב!",
    "את בונה הרגלים חזקים — רואים את זה",
    "הגוף כבר מגיב — תמשיכי",
    "את בדרך הנכונה — בלי ספק",
    "חצי זה לא חצי — זה התחלה של שינוי",
  ];
}

function halfMale(): string[] {
  return [
    "התקדמות מעולה — ממשיכים בדיוק ככה!",
    "אתה בשליטה — וזה כבר חצי דרך!",
    "חצי יעד כבר מאחוריי — זה לא מובן מאליו",
    "עוד צעד קטן ואתה שם — קצב מעולה",
    "אתה מוכיח לעצמך שזה אפשרי",
    "איזה פוקוס — זה נראה טוב!",
    "אתה בונה הרגלים חזקים — רואים את זה",
    "הגוף כבר מגיב — המשך",
    "אתה בדרך הנכונה — בלי ספק",
    "חצי זה לא חצי — זה התחלה של שינוי",
  ];
}

function fullFemale(): string[] {
  return [
    "יעד הושג — כל הכבוד!",
    "עשית את זה — פשוט מדויק",
    "שליטה מלאה — ככה נראית הצלחה",
    "זה לא מזל — זו בחירה מודעת",
    "עוד יום של הצלחה — ממשיכים לבנות",
    "את מובילה את התהליך — לא להפך",
    "דיוק כזה מוביל לתוצאות",
    "הגוף שלך עובד איתך — לא נגדך",
    "זה הרגלים — לא כוח רצון",
    "יום מדויק — וזה מצטבר",
  ];
}

function fullMale(): string[] {
  return [
    "יעד הושג — כל הכבוד!",
    "עשית את זה — פשוט מדויק",
    "שליטה מלאה — ככה נראית הצלחה",
    "זה לא מזל — זו בחירה מודעת",
    "עוד יום של הצלחה — ממשיכים לבנות",
    "אתה מוביל את התהליך — לא להפך",
    "דיוק כזה מוביל לתוצאות",
    "הגוף שלך עובד איתך — לא נגדך",
    "זה הרגלים — לא כוח רצון",
    "יום מדויק — וזה מצטבר",
  ];
}

export type CelebrationMessageType = "half" | "full";

export function getRandomMessage(
  type: CelebrationMessageType,
  gender: Gender
): string {
  const messages =
    type === "half"
      ? gender === "male"
        ? halfMale()
        : halfFemale()
      : gender === "male"
        ? fullMale()
        : fullFemale();
  return messages[Math.floor(Math.random() * messages.length)]!;
}

/** @deprecated Use getRandomMessage(type, gender) */
export const halfMessages = halfFemale();
/** @deprecated Use getRandomMessage(type, gender) */
export const fullMessages = fullFemale();
