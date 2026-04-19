import type { Gender } from "@/lib/tdee";

export type TimeOfDaySlot = {
  salutationHe: string;
  emoji: string;
};

/** 05–12 בוקר, 12–18 צהריים, 18–22 ערב, 22–05 לילה */
export function getTimeOfDaySlot(hour: number): TimeOfDaySlot {
  if (hour >= 5 && hour < 12) {
    return { salutationHe: "בוקר טוב", emoji: "☀️" };
  }
  if (hour >= 12 && hour < 18) {
    return { salutationHe: "צהריים טובים", emoji: "✨" };
  }
  if (hour >= 18 && hour < 22) {
    return { salutationHe: "ערב טוב", emoji: "🌙" };
  }
  return { salutationHe: "לילה טוב", emoji: "🌟" };
}

export function buildDashboardGreetingLine(
  gender: Gender,
  firstName: string,
  hour: number
): string {
  const slot = getTimeOfDaySlot(hour);
  const name = firstName.trim() || "שם";
  if (gender === "male") {
    return `${slot.salutationHe} ${name}, מוכן לכבוש את היעד? ${slot.emoji}`;
  }
  return `${slot.salutationHe} ${name}, מוכנה לנצח את היום? ${slot.emoji}`;
}
