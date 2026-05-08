/**
 * טוקני צבע ב-TypeScript — מיושרים ל־`:root` ב־`app/globals.css`.
 * בממשק מומלץ להעדיף `var(--…)` לתמיכה ב־`data-app-theme="blueberry"`;
 * כאן נשמרים גם ערכי hex לשימוש ב־`style={{}}` / ייצוא.
 */
export const colorPrimitives = {
  bg: "#ffffff",
  accent: "#fadadd",
  accentDeep: "#f5c8d4",
  cherry: "#9b1b30",
  stem: "#4a7c23",
  stemMid: "#5d8c3a",
  stemDeep: "#3d6b28",
  text: "#333333",
  /** קירוב ל־`color-mix(in srgb, var(--cherry) 18%, var(--accent) 82%)` */
  borderCherrySoft: "#efd6dc",
} as const;

/** מאקרו לתצוגת תפריט / לוחות — לפי מפרט מוצר */
export const macroDisplay = {
  protein: "#F5C518",
  fat: "#22C55E",
  carbs: "#3B82F6",
} as const;

/** אובייקט שטוח — נוח ל־`MenuBuilder` ולמסכים דומים */
export const colors = {
  ...colorPrimitives,
  white: colorPrimitives.bg,
  grayHint: "#6b7280",
  macroProtein: macroDisplay.protein,
  macroFat: macroDisplay.fat,
  macroCarbs: macroDisplay.carbs,
} as const;

export type AppColors = typeof colors;

/** הפניה ל-CSS variables (תומך החלפת ערכת נושא ב-DOM) */
export const cssVar = {
  cherry: "var(--cherry)",
  stem: "var(--stem)",
  stemDeep: "var(--stem-deep)",
  accent: "var(--accent)",
  borderCherrySoft: "var(--border-cherry-soft)",
  text: "var(--text)",
} as const;
