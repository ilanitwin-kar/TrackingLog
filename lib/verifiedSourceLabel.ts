import type { HomeSuggestRow } from "@/lib/foodSearchShared";

/** תווית להצגה ביומן — מאגר הקבצים הפנימי / חיפוש חכם */
export const VERIFIED_SOURCE_INTEL_LABEL = "מאגר אינטליגנציה קלורית";

/** רשומות ישנות עם verified בלי מקור שמור */
export const VERIFIED_SOURCE_LEGACY_FALLBACK = "מאגר מאומת";

export function verifiedSourceLabelFromFoodSource(
  source: HomeSuggestRow["source"] | undefined
): string {
  switch (source) {
    case "israelMoH":
      return "משרד הבריאות";
    case "usda":
      return "USDA";
    case "local":
    default:
      return VERIFIED_SOURCE_INTEL_LABEL;
  }
}
