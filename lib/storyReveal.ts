import type { Gender } from "@/lib/tdee";

/** טקסט "אימפריה" — 145 מילים למיפוי משבצת למילה */

export const STORY_REVEAL_TEXT = `ביום שבו החלטת להפסיק להסתפק בבינוניות ולבחור באינטליגנציה קלורית, הנחת את אבן הפינה הראשונה לאימפריה הפרטית שלך. כל בחירה חכמה שעשית, כל רגע שבו בחרת בשובע איכותי על פני סיפוק רגעי, היה ניצחון של הרוח על החומר. את לא רק משילה קילוגרמים, את בונה גרסה חדשה, עוצמתית ובלתי מנוצחת של עצמך. המפה שאת צובעת בזהב היא ההוכחה שמשמעת היא לא כלא, היא המפתח לחופש האמיתי. את היזמית של חייך, האדריכלית של גופך, והיום את כבר יודעת שהשמיים הם לא הגבול – הם רק נקודת הזינוק. כשאת מביטה בלוח המוזהב, את רואה את השתקפות הרצון הברזלי שלך. כל מילה בסיפור הזה נכתבה בזיעה, בהתמדה ובאמונה יוקרתית שמגיע לך הטוב ביותר. את כבר שם, כי הניצחון לא קורה בקו הסיום, הוא קורה בכל יום שבו בחרת בעצמך מחדש. המשיכי לצעוד, המשיכי לבנות, המשיכי להוביל – האימפריה שלך כבר כאן, והיא זוהרת יותר מכל זהב בעולם.`;

/** מילות מילוי אם נדרש להשלים ל־145 או למעגל מעבר ל־145 משבצות */
const FILLER_CYCLE = [
  "עוצמה",
  "ניצחון",
  "אימפריה",
  "המשיכי",
  "בהתמדה",
  "באמונה",
  "בכוח",
  "קדימה",
  "חופש",
  "אור",
  "אדריכלות",
  "יזמות",
  "ברזל",
  "זהב",
  "נקודת",
  "זינוק",
] as const;

export const STORY_WORD_COUNT = 145;

function buildFixedStoryWords(): string[] {
  const raw = STORY_REVEAL_TEXT.trim().split(/\s+/).filter(Boolean);
  if (raw.length >= STORY_WORD_COUNT) {
    return raw.slice(0, STORY_WORD_COUNT);
  }
  const out = [...raw];
  let fi = 0;
  while (out.length < STORY_WORD_COUNT) {
    out.push(FILLER_CYCLE[fi % FILLER_CYCLE.length]!);
    fi++;
  }
  return out;
}

const STORY_WORDS_145: readonly string[] = buildFixedStoryWords();

export function getStoryWords145(): readonly string[] {
  return STORY_WORDS_145;
}

/**
 * מילה למשבצת: 145 המילים הראשונות מהסיפור; מעבר לכך — מחזור מילוי מעצים (לא חזרה על הסיפור).
 */
export function getWordForSquareIndex(squareIndex: number): string {
  const words = STORY_WORDS_145;
  if (words.length === 0) return "…";
  if (squareIndex < STORY_WORD_COUNT) {
    return words[squareIndex] ?? "…";
  }
  const fi = squareIndex - STORY_WORD_COUNT;
  return FILLER_CYCLE[fi % FILLER_CYCLE.length]!;
}

const FIRST_STORY_WORD = "ביום";

/**
 * משבצת 0: "[שם פרטי], ביום" — המילה "ביום" היא תחילת הסיפור; ממשבצת 1 והלאה — מילה למילה לפי האינדקס (מילה 2 = אינדקס 1).
 * בלי שם: "את" / "אתה" לפי מין (לא ברירת מחדל "יזמית").
 */
export function getStoryDisplayForSquare(
  squareIndex: number,
  firstNameTrimmed: string,
  gender: Gender
): string {
  if (squareIndex === 0) {
    const w0 = STORY_WORDS_145[0] ?? FIRST_STORY_WORD;
    if (w0 !== FIRST_STORY_WORD) {
      return getWordForSquareIndex(squareIndex);
    }
    const name =
      firstNameTrimmed.length > 0
        ? firstNameTrimmed
        : gender === "male"
          ? "אתה"
          : "את";
    return `${name}, ${FIRST_STORY_WORD}…`;
  }
  return getWordForSquareIndex(squareIndex);
}
