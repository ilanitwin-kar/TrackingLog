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
  firstName: string,
  hour: number
): string {
  const slot = getTimeOfDaySlot(hour);
  const name = firstName.trim();
  return name ? `${slot.salutationHe} ${name} ${slot.emoji}` : `${slot.salutationHe} ${slot.emoji}`;
}
