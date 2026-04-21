import type { Gender } from "@/lib/tdee";

/** Pick Hebrew copy by profile gender */
export function gf(gender: Gender, female: string, male: string): string {
  return gender === "male" ? male : female;
}

/** משבצת אפורה אחרי סגירת יומן — לפני צביעה בזהב */
export function uiTapOnCube(gender: Gender): string {
  return gf(gender, "לחצי על הקוביה", "לחץ על הקוביה");
}

export function uiCloseJournalOnHome(dayNum: number, gender: Gender): string {
  const v = gender === "male" ? "\u05e1\u05d2\u05d5\u05e8" : "\u05e1\u05d2\u05e8\u05d9";
  return `\u05d9\u05d5\u05dd ${dayNum} \u2014 ${v} \u05d9\u05d5\u05de\u05df \u05d1\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea`;
}

export function uiCloseJournalToUnlockCube(gender: Gender): string {
  return gender === "male"
    ? "\u05e1\u05d2\u05d5\u05e8 \u05d0\u05ea \u05d4\u05d9\u05d5\u05de\u05df \u05d1\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea \u05db\u05d3\u05d9 \u05dc\u05e4\u05ea\u05d5\u05d7 \u05e7\u05d5\u05d1\u05d9\u05d9\u05d4"
    : "\u05e1\u05d2\u05e8\u05d9 \u05d0\u05ea \u05d4\u05d9\u05d5\u05de\u05df \u05d1\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea \u05db\u05d3\u05d9 \u05dc\u05e4\u05ea\u05d5\u05d7 \u05e7\u05d5\u05d1\u05d9\u05d9\u05d4";
}

export function journeyLockedTapHint(gender: Gender): string {
  return gender === "male"
    ? "\u05dc\u05d7\u05e5 \u05e2\u05dc \u05d4\u05e7\u05d5\u05d1\u05d9\u05d9\u05d4 \u05dc\u05d2\u05dc\u05d5\u05ea \u05d0\u05ea \u05db\u05ea\u05d1 \u05d4\u05e1\u05ea\u05e8\u05d9\u05dd"
    : "\u05dc\u05d7\u05e6\u05d9 \u05e2\u05dc \u05d4\u05e7\u05d5\u05d1\u05d9\u05d9\u05d4 \u05dc\u05d2\u05dc\u05d5\u05ea \u05d0\u05ea \u05db\u05ea\u05d1 \u05d4\u05e1\u05ea\u05e8\u05d9\u05dd";
}

export function barcodeAimInstruction(gender: Gender): string {
  return gender === "male"
    ? "\u05db\u05d5\u05d5\u05df \u05d0\u05ea \u05d4\u05d1\u05e8\u05e7\u05d5\u05d3 \u05d1\u05ea\u05d5\u05da \u05d4\u05de\u05e1\u05d2\u05e8\u05ea \u2014 \u05d4\u05e1\u05e8\u05d9\u05e7\u05d4 \u05de\u05ea\u05d1\u05e6\u05e2\u05ea \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea."
    : "\u05db\u05d5\u05d5\u05e0\u05d9 \u05d0\u05ea \u05d4\u05d1\u05e8\u05e7\u05d5\u05d3 \u05d1\u05ea\u05d5\u05da \u05d4\u05de\u05e1\u05d2\u05e8\u05ea \u2014 \u05d4\u05e1\u05e8\u05d9\u05e7\u05d4 \u05de\u05ea\u05d1\u05e6\u05e2\u05ea \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea.";
}

export function tdeeOnboardingFillAllFields(gender: Gender): string {
  return gender === "male"
    ? "\u05de\u05dc\u05d0 \u05d0\u05ea \u05db\u05dc \u05d4\u05e9\u05d3\u05d5\u05ea \u05db\u05d3\u05d9 \u05dc\u05d4\u05d2\u05d3\u05d9\u05e8 \u05d0\u05ea \u05d4\u05d9\u05e2\u05d3 \u05d4\u05d9\u05d5\u05de\u05d9 \u05d5\u05dc\u05d4\u05de\u05e9\u05d9\u05da \u05dc\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3."
    : "\u05de\u05dc\u05d0\u05d9 \u05d0\u05ea \u05db\u05dc \u05d4\u05e9\u05d3\u05d5\u05ea \u05db\u05d3\u05d9 \u05dc\u05d4\u05d2\u05d3\u05d9\u05e8 \u05d0\u05ea \u05d4\u05d9\u05e2\u05d3 \u05d4\u05d9\u05d5\u05de\u05d9 \u05d5\u05dc\u05d4\u05de\u05e9\u05d9\u05da \u05dc\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3.";
}

export function manualFoodIntroParagraph(gender: Gender): string {
  return gender === "male"
    ? "\u05d4\u05d6\u05df \u05e2\u05e8\u05db\u05d9\u05dd \u05db\u05e4\u05d9 \u05e9\u05de\u05d5\u05e4\u05d9\u05e2\u05d9\u05dd \u05dc\u2011100 \u05d2\u05e8\u05dd \u05d1\u05ea\u05d5\u05d5\u05d9\u05ea. \u05d0\u05dd \u05ea\u05de\u05dc\u05d0 \u05de\u05e9\u05e7\u05dc \u05d9\u05d7\u05d9\u05d3\u05d4 (\u05d1\u05d2\u05e8\u05dd), \u05d4\u05de\u05e0\u05d4 \u05ea\u05d9\u05e8\u05e9\u05dd \u05db\u05d9\u05d7\u05d9\u05d3\u05d4 \u05d0\u05d7\u05ea \u05d5\u05d4\u05e2\u05e8\u05db\u05d9\u05dd \u05d9\u05d7\u05d5\u05e9\u05d1\u05d5 \u05dc\u05e4\u05d9 \u05d4\u05de\u05e9\u05e7\u05dc."
    : "\u05d4\u05d6\u05d9\u05e0\u05d9 \u05e2\u05e8\u05db\u05d9\u05dd \u05db\u05e4\u05d9 \u05e9\u05de\u05d5\u05e4\u05d9\u05e2\u05d9\u05dd \u05dc\u2011100 \u05d2\u05e8\u05dd \u05d1\u05ea\u05d5\u05d5\u05d9\u05ea. \u05d0\u05dd \u05ea\u05de\u05dc\u05d0\u05d9 \u05de\u05e9\u05e7\u05dc \u05d9\u05d7\u05d9\u05d3\u05d4 (\u05d1\u05d2\u05e8\u05dd), \u05d4\u05de\u05e0\u05d4 \u05ea\u05d9\u05e8\u05e9\u05dd \u05db\u05d9\u05d7\u05d9\u05d3\u05d4 \u05d0\u05d7\u05ea \u05d5\u05d4\u05e2\u05e8\u05db\u05d9\u05dd \u05d9\u05d7\u05d5\u05e9\u05d1\u05d5 \u05dc\u05e4\u05d9 \u05d4\u05de\u05e9\u05e7\u05dc.";
}

export function fireworksDismissHint(gender: Gender): string {
  return gender === "male"
    ? "\u05dc\u05d7\u05e5 \u05de\u05d7\u05d5\u05e5 \u05dc\u05d7\u05dc\u05d5\u05df \u05d0\u05d5 Escape \u05dc\u05e1\u05d2\u05d9\u05e8\u05d4"
    : "\u05dc\u05d7\u05e6\u05d9 \u05de\u05d7\u05d5\u05e5 \u05dc\u05d7\u05dc\u05d5\u05df \u05d0\u05d5 Escape \u05dc\u05e1\u05d2\u05d9\u05e8\u05d4";
}

export function uiNetworkErrorRetry(gender: Gender): string {
  return gf(gender, "בעיית רשת — נסי שוב", "בעיית רשת — נסה שוב");
}

export function uiCameraPermissionHint(gender: Gender): string {
  return gf(
    gender,
    "לא ניתן להפעיל מצלמה — בדקי הרשאות דפדפן",
    "לא ניתן להפעיל מצלמה — בדוק הרשאות דפדפן"
  );
}

export function uiRetryShort(gender: Gender): string {
  return gf(gender, "נסי שוב", "נסה שוב");
}

export function uiWeightHistoryEmpty(gender: Gender): string {
  return gf(
    gender,
    "אין עדיין שקילות — הוסיפי רשומה ראשונה",
    "אין עדיין שקילות — הוסף רשומה ראשונה"
  );
}

export function dictionaryIntroTitle(): string {
  return "המילון האישי שלי";
}

export function dictionaryIntroBody(gender: Gender): string {
  return gf(
    gender,
    "למה לחפש כל פעם מחדש? כאן נשמרים כל המזונות שמרכיבים את היום-יום שלך. הוסיפי לכאן את ה'קבועים' שלך ותוכלי להעביר אותם ליומן בלחיצת כפתור אחת. פחות חיפושים, יותר דיוק.",
    "למה לחפש כל פעם מחדש? כאן נשמרים כל המזונות שמרכיבים את היום-יום שלך. הוסף לכאן את ה'קבועים' שלך ותוכל להעביר אותם ליומן בלחיצת כפתור אחת. פחות חיפושים, יותר דיוק."
  );
}

export function shoppingIntroTitle(): string {
  return "לפני שיוצאים לסופר";
}

export function shoppingIntroBody(gender: Gender): string {
  return gf(
    gender,
    "הסל שלך מוכן לדרך. כאן ריכזנו את כל ה'אוצרות' שמצאת במגלה המזונות. את יכולה להוסיף פריטים אישיים, לערוך כמויות ולייצא את הרשימה לנייד כדי שהקנייה בסופר תהיה מהירה, חכמה ומדויקת.",
    "הסל שלך מוכן לדרך. כאן ריכזנו את כל ה'אוצרות' שמצאת במגלה המזונות. אתה יכול להוסיף פריטים אישיים, לערוך כמויות ולייצא את הרשימה לנייד כדי שהקנייה בסופר תהיה מהירה, חכמה ומדויקת."
  );
}

export function explorerIntroTitle(): string {
  return "מגלה המזונות החכם";
}

export function explorerIntroBody(gender: Gender): string {
  return gf(
    gender,
    "כאן מתחילה האינטליגנציה הקלורית שלך. חפשי מזונות מתוך המאגר הבלעדי שלנו, סנני לפי קטגוריות או לפי ערכים (מהחלבון הגבוה ביותר ועד הקלוריות הנמוכות ביותר). מצאת משהו שאהבת? הוסיפי אותו בלחיצה למילון האישי שלך או לרשימת הקניות, ותתחילי למלא את היום שלך בבחירות חכמות.",
    "כאן מתחילה האינטליגנציה הקלורית שלך. חפש מזונות מתוך המאגר הבלעדי שלנו, סנן לפי קטגוריות או לפי ערכים (מהחלבון הגבוה ביותר ועד הקלוריות הנמוכות ביותר). מצאת משהו שאהבת? הוסף אותו בלחיצה למילון האישי שלך או לרשימת הקניות, והתחל למלא את היום שלך בבחירות חכמות."
  );
}

export function homeJournalIntroTitle(): string {
  return "היומן שלך";
}

export function homeJournalIntroBody(gender: Gender): string {
  return gf(
    gender,
    "היומן שלך הוא המפתח לשליטה. כאן תוכלי לתעד כל בחירה, לראות איך המדדים משתנים בזמן אמת, ולצבור את ה'הון הקלורי' שלך בדרך ליעד. זכרי: מה שנרשם - מנוהל.",
    "היומן שלך הוא המפתח לשליטה. כאן תוכל לתעד כל בחירה, לראות איך המדדים משתנים בזמן אמת, ולצבור את ה'הון הקלורי' שלך בדרך ליעד. זכור: מה שנרשם - מנוהל."
  );
}

export function strategicReportIntroTitle(): string {
  return "מרכז ההישגים";
}

export function strategicReportIntroBody(gender: Gender): string {
  return gf(
    gender,
    "המספרים שמספרים את סיפור ההצלחה שלך. כאן תראי איך כל בחירה חכמה הופכת ל'הון קלורי' מצטבר – החיסכון הפרטי שלך בדרך לגוף שתמיד רצית.",
    "המספרים שמספרים את סיפור ההצלחה שלך. כאן תוכל לראות איך כל בחירה חכמה הופכת ל'הון קלורי' מצטבר – החיסכון הפרטי שלך בדרך ליעד שהצבת."
  );
}

export function strategicReportShareButtonLabel(gender: Gender): string {
  return gf(gender, "שתפי את ההצלחה שלך!", "שתף את ההצלחה שלך!");
}

/** משפט מוטיבציה מתחת לטבעת ההתקדמות — לפי אחוז צריכה מול יעד יומי */
export function dailyCalorieMotivationLine(
  gender: Gender,
  target: number,
  total: number
): string | null {
  if (target <= 0) return null;

  const pct = Math.round((total / target) * 100);

  if (total === 0) {
    return gf(
      gender,
      "היום רק התחיל — כל בחירה תקרב אותך ליעד היומי. בואי נפתח בטוב.",
      "היום רק התחיל — כל בחירה תקרב אותך ליעד היומי. בוא נפתח בטוב."
    );
  }

  if (pct > 100) {
    const p = Math.min(pct, 999);
    return `היום עומד על ${p}% מהיעד — זה קורה לפעמים. מחר מתחדשים.`;
  }

  if (pct === 100) {
    return "פגעת בול ביעד היומי — דיוק מעורר השראה!";
  }

  if (pct >= 75) {
    return gf(
      gender,
      `את ב־${pct}% מהדרך ליעד היומי! עוד קצת וסגרת יום מושלם.`,
      `אתה ב־${pct}% מהדרך ליעד היומי! עוד קצת וסגרת יום מושלם.`
    );
  }

  if (pct >= 50) {
    return gf(
      gender,
      `את כבר מעבר לחצי — ${pct}% מהדרך ליעד. בואי נסיים את היום בראש שקט.`,
      `אתה כבר מעבר לחצי — ${pct}% מהדרך ליעד. בוא נסיים את היום בראש שקט.`
    );
  }

  if (pct >= 25) {
    return gf(
      gender,
      `את ב־${pct}% מהדרך ליעד — התקדמות יפה. עוד צעד־צעד.`,
      `אתה ב־${pct}% מהדרך ליעד — התקדמות יפה. עוד צעד־צעד.`
    );
  }

  return gf(
    gender,
    `את ב־${pct}% מהדרך ליעד — הכל לפניך. נמשיך בעדינות.`,
    `אתה ב־${pct}% מהדרך ליעד — הכל לפניך. נמשיך בעדינות.`
  );
}

export function dictionaryHeading(gender: Gender): string {
  return gf(gender, "מילון מזונות", "מילון מזונות");
}

export function dictionarySavedFilterLabel(gender: Gender): string {
  return gf(gender, "סינון הרשומות השמורות", "סינון הרשומות השמורות");
}

export function dictionarySavedFilterPlaceholder(gender: Gender): string {
  return gf(
    gender,
    "חיפוש במילון, במאגר הפנימי וב־Open Food Facts (לפחות 2 אותיות)…",
    "חיפוש במילון, במאגר הפנימי וב־Open Food Facts (לפחות 2 אותיות)…"
  );
}

export function dictionaryEditFoodError(gender: Gender): string {
  return gf(gender, "הקלידי שם מזון", "הקלד שם מזון");
}

export function infoProfileBody(gender: Gender): string {
  return gf(
    gender,
    "כדי לחשב את צריכת האנרגיה המדויקת של הגוף שלך, אנחנו צריכות להבין את הנתונים הטבעיים שלך. מלאי את הפרטים כדי שנוכל להתאים לך את הנוסחה המנצחת.",
    "כדי לחשב את צריכת האנרגיה המדויקת של הגוף שלך, אנחנו צריכים להבין את הנתונים הטבעיים שלך. מלא את הפרטים כדי שנוכל להתאים לך את הנוסחה המנצחת."
  );
}

export function infoWeightBody(gender: Gender): string {
  return gf(
    gender,
    "הזיני את המשקל הנוכחי שלך ובחרי תדירות שמרגישה לך נכון. אנחנו ממליצים על מעקב עקבי כדי לזהות מגמות ולדייק את התהליך בזמן אמת.",
    "הזן את המשקל הנוכחי שלך ובחר תדירות שמרגישה לך נכון. אנחנו ממליצים על מעקב עקבי כדי לזהות מגמות ולדייק את התהליך בזמן אמת."
  );
}

export function infoTdeeResultsBody(gender: Gender): string {
  return gf(
    gender,
    "זהו מנוע הבעירה שלך. כאן תראי כמה הגוף שורף ביום, מהו היעד היומי שלך, ואיך לדייק את החלוקה כדי להתקדם בביטחון.",
    "זהו מנוע הבעירה שלך. כאן תראה כמה הגוף שורף ביום, מהו היעד היומי שלך, ואיך לדייק את החלוקה כדי להתקדם בביטחון."
  );
}

export function weightAffirmations(gender: Gender): string[] {
  if (gender === "male") {
    return [
      "\u05d0\u05ea\u05d4 \u05de\u05d3\u05d4\u05d9\u05dd!",
      "\u05de\u05e0\u05e6\u05d7!",
      "\u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05d0\u05de\u05d9\u05ea\u05d9\u05ea \u2014 \u05db\u05dc \u05d4\u05db\u05d1\u05d5\u05d3!",
      "\u05d2\u05d0\u05d9\u05dd \u05d1\u05da \u2014 \u05d4\u05de\u05e9\u05da \u05db\u05db\u05d4!",
      "\u05d6\u05d4 \u05d1\u05d3\u05d9\u05d5\u05e7 \u05d4\u05db\u05d9\u05d5\u05d5\u05df!",
    ];
  }
  return [
    "\u05d0\u05ea \u05de\u05d3\u05d4\u05d9\u05de\u05d4!",
    "\u05de\u05e0\u05e6\u05d7\u05ea!",
    "\u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05d0\u05de\u05d9\u05ea\u05d9\u05ea \u2014 \u05db\u05dc \u05d4\u05db\u05d1\u05d5\u05d3!",
    "\u05d2\u05d0\u05d9\u05dd \u05d1\u05da \u2014 \u05d4\u05de\u05e9\u05d9\u05db\u05d9 \u05db\u05db\u05d4!",
    "\u05d6\u05d4 \u05d1\u05d3\u05d9\u05d5\u05e7 \u05d4\u05db\u05d9\u05d5\u05d5\u05df!",
  ];
}
