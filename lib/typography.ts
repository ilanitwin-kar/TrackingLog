/**
 * טיפוגרפיה — מחלקות Tailwind ומחסנית גופנים.
 * מיושר לסגנון מסכי מזון באפליקציה (Calibri / Segoe).
 */
export const fontStacks = {
  food: "Calibri, 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif",
} as const;

/** מחלקות Tailwind לשימוש ב־`className` */
export const typography = {
  familyFood:
    "font-[Calibri,'Segoe_UI','Helvetica_Neue',system-ui,sans-serif]",
  hint: "text-[13px] leading-snug",
  stepTitle: "text-lg font-extrabold text-[var(--text,#333)] sm:text-xl",
  body: "text-base font-normal text-[var(--text,#333)]",
  buttonLabel: "text-sm font-extrabold sm:text-base",
} as const;

export type TypographyTokens = typeof typography;
