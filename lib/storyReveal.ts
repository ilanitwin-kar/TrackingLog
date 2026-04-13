import type { Gender } from "@/lib/tdee";

/** טקסט "אימפריה" — נקבה */
export const STORY_REVEAL_TEXT = `ביום שבו החלטת להפסיק להסתפק בבינוניות ולבחור באינטליגנציה קלורית, הנחת את אבן הפינה הראשונה לאימפריה הפרטית שלך. כל בחירה חכמה שעשית, כל רגע שבו בחרת בשובע איכותי על פני סיפוק רגעי, היה ניצחון של הרוח על החומר. את לא רק משילה קילוגרמים, את בונה גרסה חדשה, עוצמתית ובלתי מנוצחת של עצמך. המפה שאת צובעת בזהב היא ההוכחה שמשמעת היא לא כלא, היא המפתח לחופש האמיתי. את היזמית של חייך, האדריכלית של גופך, והיום את כבר יודעת שהשמיים הם לא הגבול – הם רק נקודת הזינוק. כשאת מביטה בלוח המוזהב, את רואה את השתקפות הרצון הברזלי שלך. כל מילה בסיפור הזה נכתבה בזיעה, בהתמדה ובאמונה יוקרתית שמגיע לך הטוב ביותר. את כבר שם, כי הניצחון לא קורה בקו הסיום, הוא קורה בכל יום שבו בחרת בעצמך מחדש. המשיכי לצעוד, המשיכי לבנות, המשיכי להוביל – האימפריה שלך כבר כאן, והיא זוהרת יותר מכל זהב בעולם.`;

/** אותו סיפור בניסוח זכר */
const STORY_REVEAL_TEXT_MALE = `ביום שבו החלטת להפסיק להסתפק בבינוניות ולבחור באינטליגנציה קלורית, הנחת את אבן הפינה הראשונה לאימפריה הפרטית שלך. כל בחירה חכמה שעשית, כל רגע שבו בחרת בשובע איכותי על פני סיפוק רגעי, היה ניצחון של הרוח על החומר. אתה לא רק משיל קילוגרמים, אתה בונה גרסה חדשה, עוצמתית ובלתי מנוצחת של עצמך. המפה שאתה צובע בזהב היא ההוכחה שמשמעת היא לא כלא, היא המפתח לחופש האמיתי. אתה היזם של חייך, האדריכל של גופך, והיום אתה כבר יודע שהשמיים הם לא הגבול – הם רק נקודת הזינוק. כשאתה מביט בלוח המוזהב, אתה רואה את השתקפות הרצון הברזלי שלך. כל מילה בסיפור הזה נכתבה בזיעה, בהתמדה ובאמונה יוקרתית שמגיע לך הטוב ביותר. אתה כבר שם, כי הניצחון לא קורה בקו הסיום, הוא קורה בכל יום שבו בחרת בעצמך מחדש. המשך לצעוד, המשך לבנות, המשך להוביל – האימפריה שלך כבר כאן, והיא זו��רת יותר מכל זהב בעולם.`;

const FILLER_CYCLE_FEMALE = [
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

const FILLER_CYCLE_MALE = [
  "עוצמה",
  "ניצחון",
  "אימפריה",
  "המשך",
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

const FIRST_STORY_WORD = "ביום";

const wordListCache = new Map<Gender, readonly string[]>();

function fillerCycleFor(gender: Gender): readonly string[] {
  return gender === "male" ? FILLER_CYCLE_MALE : FILLER_CYCLE_FEMALE;
}

function buildStoryWords(gender: Gender): readonly string[] {
  const body =
    gender === "male" ? STORY_REVEAL_TEXT_MALE : STORY_REVEAL_TEXT;
  const filler = fillerCycleFor(gender);
  const raw = body.trim().split(/\s+/).filter(Boolean);
  let out: string[];
  if (raw.length >= STORY_WORD_COUNT) {
    out = raw.slice(0, STORY_WORD_COUNT);
  } else {
    out = [...raw];
    let fi = 0;
    while (out.length < STORY_WORD_COUNT) {
      out.push(filler[fi % filler.length]!);
      fi++;
    }
  }
  return Object.freeze(out);
}

export function getStoryWordList(gender: Gender): readonly string[] {
  let w = wordListCache.get(gender);
  if (!w) {
    w = buildStoryWords(gender);
    wordListCache.set(gender, w);
  }
  return w;
}

export function getStoryWords145(): readonly string[] {
  return getStoryWordList("female");
}

export function getWordForSquareIndex(
  squareIndex: number,
  gender: Gender
): string {
  const words = getStoryWordList(gender);
  const filler = fillerCycleFor(gender);
  if (words.length === 0) return "…";
  if (squareIndex < STORY_WORD_COUNT) {
    return words[squareIndex] ?? "…";
  }
  const fi = squareIndex - STORY_WORD_COUNT;
  return filler[fi % filler.length]!;
}

export function getStoryDisplayForSquare(
  squareIndex: number,
  firstNameTrimmed: string,
  gender: Gender
): string {
  if (squareIndex === 0) {
    if (firstNameTrimmed.length > 0) {
      return firstNameTrimmed;
    }
    return gender === "male" ? "אתה" : "את";
  }
  if (squareIndex === 1) {
    return getStoryWordList(gender)[0] ?? FIRST_STORY_WORD;
  }
  return getWordForSquareIndex(squareIndex - 1, gender);
}
