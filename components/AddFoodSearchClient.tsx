"use client";

import { AddFoodClient } from "@/components/AddFoodClient";

/**
 * מסך חיפוש רגיל — משאיר את עיצוב החיפוש כפי שהוא.
 * (הפרדה למסכים נעשית דרך routing; הלוגיקה בפנים נשארת ב-AddFoodClient)
 */
export function AddFoodSearchClient() {
  return <AddFoodClient screen="search" />;
}

