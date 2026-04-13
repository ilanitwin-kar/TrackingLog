export const halfMessages = [
  "התקדמות מעולה — ממשיכים בדיוק ככה!",
  "את בשליטה — וזה כבר חצי דרך!",
  "חצי יעד כבר מאחורייך — זה לא מובן מאליו",
  "עוד צעד קטן ואת שם — קצב מעולה",
  "את מוכיחה לעצמך שזה אפשרי",
  "איזה פוקוס — זה נראה טוב!",
  "את בונה הרגלים חזקים — רואים את זה",
  "הגוף כבר מגיב — תמשיכי",
  "את בדרך הנכונה — בלי ספק",
  "חצי זה לא חצי — זה התחלה של שינוי",
];

export const fullMessages = [
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

export type CelebrationMessageType = "half" | "full";

export function getRandomMessage(type: CelebrationMessageType): string {
  const messages = type === "half" ? halfMessages : fullMessages;
  return messages[Math.floor(Math.random() * messages.length)]!;
}
