import { loadFoodDb, type FoodDbRow } from "./foodDb";

/**
 * רשימת מאגר מצומצמת לפרומפט ה-AI — שמות וערכי 100 גרם בלבד.
 * המודל חייב לבחור הצעות רק משמות שמופיעים כאן (שורה ראשונה לפני טאב).
 */
export function buildFoodDbPicklistForAi(maxChars = 11000): string {
  const db = loadFoodDb();
  const byCat = new Map<string, FoodDbRow[]>();
  for (const r of db) {
    const c = (r.category ?? "").trim() || "—";
    if (!byCat.has(c)) byCat.set(c, []);
    const arr = byCat.get(c)!;
    if (arr.length < 40) arr.push(r);
  }
  const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b, "he"));
  const parts: string[] = [
    "פורמט כל שורה: שם_מוצר<TAB>קלוריות_ל100ג<TAB>P<TAB>C<TAB>F (מספרים שלמים). השתמשי בשם המוצר המדויק כפי שמופיע כשמוסיפים הצעה.",
  ];
  let used = parts.join("\n").length;
  outer: for (const cat of cats) {
    const header = `\n### ${cat}\n`;
    if (used + header.length > maxChars) break;
    parts.push(header);
    used += header.length;
    for (const r of byCat.get(cat) ?? []) {
      const line = `${r.name}\t${Math.round(r.calories)}\t${Math.round(r.protein)}\t${Math.round(r.carbs)}\t${Math.round(r.fat)}\n`;
      if (used + line.length > maxChars) break outer;
      parts.push(line);
      used += line.length;
    }
  }
  return parts.join("");
}
