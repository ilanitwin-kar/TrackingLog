export type PlannerItemSource = "dictionary" | "explorer" | "openFoodFacts" | "manual";

export type PlannerItem = {
  id: string;
  source: PlannerItemSource;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  /** כמות */
  qty: number;
  unit: "גרם" | "יחידה";
  /** משקל יחידה בגרם (רשות) */
  gramsPerUnit?: number | null;
};

export type PlannerState = {
  updatedAt: string;
  mode: "day" | "week";
  items: PlannerItem[];
};

const KEY = "cj_planner_state_v1";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeItem(x: unknown): PlannerItem | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const name = String(o.name ?? "").trim().slice(0, 140);
  if (!name) return null;
  const source = String(o.source ?? "");
  const sourceOk: PlannerItemSource =
    source === "dictionary" || source === "explorer" || source === "openFoodFacts" || source === "manual"
      ? (source as PlannerItemSource)
      : "manual";
  const unit = String(o.unit ?? "גרם");
  const unitOk = unit === "יחידה" ? "יחידה" : "גרם";
  const qty = clamp(Number(o.qty) || 0, 0.01, 50000);
  const gPerUnitRaw = o.gramsPerUnit;
  const gramsPerUnit =
    typeof gPerUnitRaw === "number" && Number.isFinite(gPerUnitRaw) && gPerUnitRaw > 0
      ? clamp(gPerUnitRaw, 0.1, 2000)
      : null;

  return {
    id: String(o.id ?? "").trim() || makeId(),
    source: sourceOk,
    name,
    caloriesPer100g: clamp(Number(o.caloriesPer100g) || 0, 0, 2000),
    proteinPer100g: clamp(Number(o.proteinPer100g) || 0, 0, 500),
    carbsPer100g: clamp(Number(o.carbsPer100g) || 0, 0, 500),
    fatPer100g: clamp(Number(o.fatPer100g) || 0, 0, 500),
    qty,
    unit: unitOk,
    gramsPerUnit,
  };
}

function sanitizeState(x: unknown): PlannerState | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const mode = o.mode === "week" ? "week" : "day";
  const itemsRaw = o.items;
  const items = Array.isArray(itemsRaw) ? (itemsRaw.map(sanitizeItem).filter(Boolean) as PlannerItem[]) : [];
  return {
    updatedAt: String(o.updatedAt ?? "").trim() || new Date().toISOString(),
    mode,
    items: items.slice(0, 200),
  };
}

export function loadPlannerState(): PlannerState {
  if (typeof window === "undefined") return { updatedAt: new Date().toISOString(), mode: "day", items: [] };
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const s = sanitizeState(parsed);
    return s ?? { updatedAt: new Date().toISOString(), mode: "day", items: [] };
  } catch {
    return { updatedAt: new Date().toISOString(), mode: "day", items: [] };
  }
}

export function savePlannerState(state: PlannerState): void {
  localStorage.setItem(KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
}

export function clearPlannerState(): void {
  localStorage.removeItem(KEY);
}

