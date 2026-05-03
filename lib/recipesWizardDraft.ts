export const RECIPES_WIZARD_DRAFT_KEY = "cj_recipes_wizard_draft_v1";

export type WizardIngredientDraft = {
  id: string;
  name: string;
  gramsText: string;
  caloriesPer100gText: string;
  proteinPer100gText: string;
  carbsPer100gText: string;
  fatPer100gText: string;
};

export type RecipesWizardDraftV1 = {
  v: 1;
  step: 1 | 2 | 3;
  title: string;
  servingsText: string;
  finalCookedWeightText: string;
  rows: WizardIngredientDraft[];
  nutritionOpen: Record<string, boolean>;
  portionGramsText: string;
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeRow(r: unknown): WizardIngredientDraft | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  return {
    id: String(o.id ?? "").trim().slice(0, 80) || `${Date.now()}`,
    name: String(o.name ?? "").slice(0, 200),
    gramsText: String(o.gramsText ?? "").slice(0, 20),
    caloriesPer100gText: String(o.caloriesPer100gText ?? "").slice(0, 20),
    proteinPer100gText: String(o.proteinPer100gText ?? "").slice(0, 20),
    carbsPer100gText: String(o.carbsPer100gText ?? "").slice(0, 20),
    fatPer100gText: String(o.fatPer100gText ?? "").slice(0, 20),
  };
}

function isDraftTriviallyEmpty(d: RecipesWizardDraftV1): boolean {
  return (
    d.step === 1 &&
    !d.title.trim() &&
    !d.finalCookedWeightText.trim() &&
    (d.servingsText === "" || d.servingsText === "1") &&
    d.rows.length < 1 &&
    !d.portionGramsText.trim()
  );
}

export function loadRecipesWizardDraft(): RecipesWizardDraftV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RECIPES_WIZARD_DRAFT_KEY);
    if (!raw) return null;
    const x = JSON.parse(raw) as unknown;
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (o.v !== 1) return null;
    const step = o.step === 2 || o.step === 3 ? o.step : 1;
    const title = String(o.title ?? "").slice(0, 200);
    const servingsText = String(o.servingsText ?? "1").slice(0, 8);
    const finalCookedWeightText = String(o.finalCookedWeightText ?? "").slice(0, 12);
    const portionGramsText = String(o.portionGramsText ?? "").slice(0, 12);
    const rowsRaw = o.rows;
    const rows: WizardIngredientDraft[] = [];
    if (Array.isArray(rowsRaw)) {
      for (const r of rowsRaw.slice(0, 50)) {
        const row = sanitizeRow(r);
        if (row) rows.push(row);
      }
    }
    let nutritionOpen: Record<string, boolean> = {};
    const no = o.nutritionOpen;
    if (no && typeof no === "object" && !Array.isArray(no)) {
      nutritionOpen = { ...no } as Record<string, boolean>;
    }
    const draft: RecipesWizardDraftV1 = {
      v: 1,
      step,
      title,
      servingsText,
      finalCookedWeightText,
      rows,
      nutritionOpen,
      portionGramsText,
    };
    if (isDraftTriviallyEmpty(draft)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveRecipesWizardDraft(d: RecipesWizardDraftV1): void {
  if (typeof window === "undefined") return;
  try {
    if (isDraftTriviallyEmpty(d)) {
      localStorage.removeItem(RECIPES_WIZARD_DRAFT_KEY);
      return;
    }
    const safe: RecipesWizardDraftV1 = {
      ...d,
      step: clamp(d.step, 1, 3) as 1 | 2 | 3,
      rows: d.rows.slice(0, 50),
    };
    localStorage.setItem(RECIPES_WIZARD_DRAFT_KEY, JSON.stringify(safe));
  } catch {
    /* ignore quota */
  }
}

export function clearRecipesWizardDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RECIPES_WIZARD_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
