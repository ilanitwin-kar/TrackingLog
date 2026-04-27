import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebaseAdmin";

export type AdminDictionaryItem = {
  food: string;
  source?: string;
  lastCalories?: number;
  quantity?: number;
  unit?: string;
  id?: string;
};

export type AdminUserOverview = {
  uid: string;
  email: string;
  firstName: string;
  age: number;
  weightKg: number;
  goalWeightKg: number;
  dictCount: number;
  journalDayCount: number;
  journalEntryCount: number;
  /** עד 10 פריטים לתצוגה מהירה */
  dictionaryHighlights: { food: string; source?: string }[];
  /** כל פריטי המילון, ממוינים כך שפריטים «חדשים» (לפי מזהה) למעלה */
  dictionaryItems: AdminDictionaryItem[];
};

export type AdminLogCsvRow = {
  uid: string;
  userEmail: string;
  dateKey: string;
  food: string;
  calories: number;
  quantity: number;
  unit: string;
};

export type AdminDictCsvRow = {
  uid: string;
  userEmail: string;
  food: string;
  source?: string;
  lastCalories?: number;
};

/** שורה אחת לרכיב במתכון (מאגר mealPresets בענן) */
export type AdminRecipeComponentCsvRow = {
  uid: string;
  userEmail: string;
  presetId: string;
  presetName: string;
  presetCreatedAt: string;
  componentFood: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

function uidFromAppOrDayDoc(doc: QueryDocumentSnapshot): string | null {
  const parentDoc = doc.ref.parent.parent;
  return parentDoc ? parentDoc.id : null;
}

function sortKeyFromDictionaryId(id: string | undefined): number {
  if (!id) return 0;
  const head = id.split("-")[0] ?? "";
  const n = Number(head);
  return Number.isFinite(n) ? n : 0;
}

function mapDictionaryItems(arr: Record<string, unknown>[]): AdminDictionaryItem[] {
  const items: AdminDictionaryItem[] = [];
  for (const o of arr) {
    const food = String(o.food ?? "").trim();
    if (!food) continue;
    items.push({
      food: food.slice(0, 200),
      source: o.source != null ? String(o.source).slice(0, 120) : undefined,
      lastCalories: typeof o.lastCalories === "number" ? o.lastCalories : undefined,
      quantity: typeof o.quantity === "number" ? o.quantity : undefined,
      unit: o.unit != null ? String(o.unit).slice(0, 40) : undefined,
      id: o.id != null ? String(o.id).slice(0, 80) : undefined,
    });
  }
  items.sort((a, b) => sortKeyFromDictionaryId(b.id) - sortKeyFromDictionaryId(a.id));
  return items;
}

function parseProfilePayload(raw: Record<string, unknown>): {
  email: string;
  firstName: string;
  age: number;
  weightKg: number;
  goalWeightKg: number;
} {
  const p = (raw?.data ?? raw) as Record<string, unknown>;
  return {
    email: String(p.email ?? ""),
    firstName: String(p.firstName ?? ""),
    age: typeof p.age === "number" && Number.isFinite(p.age) ? p.age : 0,
    weightKg: typeof p.weightKg === "number" && Number.isFinite(p.weightKg) ? p.weightKg : 0,
    goalWeightKg: typeof p.goalWeightKg === "number" && Number.isFinite(p.goalWeightKg) ? p.goalWeightKg : 0,
  };
}

export async function loadAdminOverview(): Promise<AdminUserOverview[]> {
  const db = getAdminFirestore();
  if (!db) throw new Error("no_db");

  const [appSnap, daySnap] = await Promise.all([
    db.collectionGroup("app").get(),
    db.collectionGroup("dayLogs").get(),
  ]);

  const profiles = new Map<
    string,
    { email: string; firstName: string; age: number; weightKg: number; goalWeightKg: number }
  >();
  const dictByUid = new Map<string, Record<string, unknown>[]>();

  for (const doc of appSnap.docs) {
    const uid = uidFromAppOrDayDoc(doc);
    if (!uid) continue;
    if (doc.id === "profile") {
      profiles.set(uid, parseProfilePayload(doc.data() as Record<string, unknown>));
    }
    if (doc.id === "dictionary") {
      const raw = doc.data() as Record<string, unknown>;
      const arr = raw.data;
      if (Array.isArray(arr)) {
        dictByUid.set(
          uid,
          arr.filter((x): x is Record<string, unknown> => x != null && typeof x === "object") as Record<
            string,
            unknown
          >[],
        );
      }
    }
  }

  const logStats = new Map<string, { days: number; entries: number }>();
  for (const doc of daySnap.docs) {
    const uid = uidFromAppOrDayDoc(doc);
    if (!uid) continue;
    const d = doc.data() as Record<string, unknown>;
    const entries = Array.isArray(d.entries) ? d.entries : [];
    const prev = logStats.get(uid) ?? { days: 0, entries: 0 };
    prev.days += 1;
    prev.entries += entries.length;
    logStats.set(uid, prev);
  }

  const uids = new Set<string>([...profiles.keys(), ...dictByUid.keys(), ...logStats.keys()]);
  const rows: AdminUserOverview[] = [];

  for (const uid of uids) {
    const pr = profiles.get(uid);
    const dict = dictByUid.get(uid) ?? [];
    const st = logStats.get(uid) ?? { days: 0, entries: 0 };
    const dictionaryItems = mapDictionaryItems(dict);
    const highlights = dictionaryItems.slice(0, 10).map((h) => ({
      food: h.food,
      source: h.source,
    }));

    rows.push({
      uid,
      email: (pr?.email ?? "").trim() || "—",
      firstName: (pr?.firstName ?? "").trim() || "—",
      age: pr?.age ?? 0,
      weightKg: pr?.weightKg ?? 0,
      goalWeightKg: pr?.goalWeightKg ?? 0,
      dictCount: dict.length,
      journalDayCount: st.days,
      journalEntryCount: st.entries,
      dictionaryHighlights: highlights,
      dictionaryItems,
    });
  }

  rows.sort((a, b) => a.email.localeCompare(b.email, "he"));
  return rows;
}

export async function loadAdminExportRows(overview: AdminUserOverview[]): Promise<{
  logs: AdminLogCsvRow[];
  dictRows: AdminDictCsvRow[];
  recipeRows: AdminRecipeComponentCsvRow[];
}> {
  const db = getAdminFirestore();
  if (!db) throw new Error("no_db");
  const emailByUid = new Map(overview.map((r) => [r.uid, r.email]));

  const [appSnap, daySnap] = await Promise.all([
    db.collectionGroup("app").get(),
    db.collectionGroup("dayLogs").get(),
  ]);

  const dictRows: AdminDictCsvRow[] = [];
  const recipeRows: AdminRecipeComponentCsvRow[] = [];

  for (const doc of appSnap.docs) {
    const uid = uidFromAppOrDayDoc(doc);
    if (!uid) continue;
    const userEmail = emailByUid.get(uid) ?? "";

    if (doc.id === "dictionary") {
      const raw = doc.data() as Record<string, unknown>;
      const arr = raw.data;
      if (!Array.isArray(arr)) continue;
      for (const x of arr) {
        if (!x || typeof x !== "object") continue;
        const o = x as Record<string, unknown>;
        const food = String(o.food ?? "").trim();
        if (!food) continue;
        dictRows.push({
          uid,
          userEmail,
          food,
          source: o.source != null ? String(o.source) : undefined,
          lastCalories: typeof o.lastCalories === "number" ? o.lastCalories : undefined,
        });
      }
    }

    if (doc.id === "mealPresets") {
      const raw = doc.data() as Record<string, unknown>;
      const arr = raw.data;
      if (!Array.isArray(arr)) continue;
      for (const x of arr) {
        if (!x || typeof x !== "object") continue;
        const preset = x as Record<string, unknown>;
        const presetId = String(preset.id ?? "").trim();
        const presetName = String(preset.name ?? "").trim();
        const presetCreatedAt = String(preset.createdAt ?? "").trim();
        const components = Array.isArray(preset.components) ? preset.components : [];
        if (components.length === 0) {
          recipeRows.push({
            uid,
            userEmail,
            presetId: presetId || "—",
            presetName: presetName || "—",
            presetCreatedAt: presetCreatedAt || "—",
            componentFood: "",
            quantity: 0,
            unit: "",
            calories: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
          });
          continue;
        }
        for (const c of components) {
          if (!c || typeof c !== "object") continue;
          const co = c as Record<string, unknown>;
          recipeRows.push({
            uid,
            userEmail,
            presetId,
            presetName,
            presetCreatedAt,
            componentFood: String(co.food ?? "").trim(),
            quantity: typeof co.quantity === "number" ? co.quantity : Number(co.quantity) || 0,
            unit: String(co.unit ?? ""),
            calories: typeof co.calories === "number" ? co.calories : Number(co.calories) || 0,
            proteinG: typeof co.proteinG === "number" ? co.proteinG : Number(co.proteinG) || 0,
            carbsG: typeof co.carbsG === "number" ? co.carbsG : Number(co.carbsG) || 0,
            fatG: typeof co.fatG === "number" ? co.fatG : Number(co.fatG) || 0,
          });
        }
      }
    }
  }

  const logs: AdminLogCsvRow[] = [];
  for (const doc of daySnap.docs) {
    const uid = uidFromAppOrDayDoc(doc);
    if (!uid) continue;
    const d = doc.data() as Record<string, unknown>;
    const dateKey = typeof d.dateKey === "string" ? d.dateKey : doc.id;
    const entries = Array.isArray(d.entries) ? d.entries : [];
    const userEmail = emailByUid.get(uid) ?? "";
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      logs.push({
        uid,
        userEmail,
        dateKey,
        food: String(o.food ?? ""),
        calories: typeof o.calories === "number" ? o.calories : Number(o.calories) || 0,
        quantity: typeof o.quantity === "number" ? o.quantity : Number(o.quantity) || 0,
        unit: String(o.unit ?? ""),
      });
    }
  }

  return { logs, dictRows, recipeRows };
}

export function csvEscapeCell(v: string): string {
  const s = v.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function bom(s: string): string {
  return "\uFEFF" + s;
}

export function buildAdminUsersOnlyCsv(overview: AdminUserOverview[]): string {
  const lines: string[] = [];
  lines.push("uid,userEmail,firstName,age,weightKg,goalWeightKg,dictCount,journalDayCount,journalEntryCount");
  for (const r of overview) {
    lines.push(
      [
        csvEscapeCell(r.uid),
        csvEscapeCell(r.email),
        csvEscapeCell(r.firstName),
        String(r.age),
        String(r.weightKg),
        String(r.goalWeightKg),
        String(r.dictCount),
        String(r.journalDayCount),
        String(r.journalEntryCount),
      ].join(","),
    );
  }
  return bom(lines.join("\n") + "\n");
}

export function buildAdminJournalOnlyCsv(logs: AdminLogCsvRow[]): string {
  const lines: string[] = [];
  lines.push("uid,userEmail,dateKey,food,calories,quantity,unit");
  for (const r of logs) {
    lines.push(
      [
        csvEscapeCell(r.uid),
        csvEscapeCell(r.userEmail),
        csvEscapeCell(r.dateKey),
        csvEscapeCell(r.food),
        String(r.calories),
        String(r.quantity),
        csvEscapeCell(r.unit),
      ].join(","),
    );
  }
  return bom(lines.join("\n") + "\n");
}

export function buildAdminDictionaryOnlyCsv(dictRows: AdminDictCsvRow[]): string {
  const lines: string[] = [];
  lines.push("uid,userEmail,food,source,lastCalories");
  for (const r of dictRows) {
    lines.push(
      [
        csvEscapeCell(r.uid),
        csvEscapeCell(r.userEmail),
        csvEscapeCell(r.food),
        csvEscapeCell(r.source ?? ""),
        r.lastCalories != null ? String(r.lastCalories) : "",
      ].join(","),
    );
  }
  return bom(lines.join("\n") + "\n");
}

export function buildAdminRecipesOnlyCsv(recipeRows: AdminRecipeComponentCsvRow[]): string {
  const lines: string[] = [];
  lines.push(
    "uid,userEmail,presetId,presetName,presetCreatedAt,componentFood,quantity,unit,calories,proteinG,carbsG,fatG",
  );
  for (const r of recipeRows) {
    lines.push(
      [
        csvEscapeCell(r.uid),
        csvEscapeCell(r.userEmail),
        csvEscapeCell(r.presetId),
        csvEscapeCell(r.presetName),
        csvEscapeCell(r.presetCreatedAt),
        csvEscapeCell(r.componentFood),
        String(r.quantity),
        csvEscapeCell(r.unit),
        String(r.calories),
        String(r.proteinG),
        String(r.carbsG),
        String(r.fatG),
      ].join(","),
    );
  }
  return bom(lines.join("\n") + "\n");
}

export function buildAdminMasterCsv(
  overview: AdminUserOverview[],
  logs: AdminLogCsvRow[],
  dictRows: AdminDictCsvRow[],
  recipeRows: AdminRecipeComponentCsvRow[] = [],
): string {
  const lines: string[] = [];
  lines.push("section,uid,userEmail,firstName,age,weightKg,goalWeightKg,dictCount,journalDayCount,journalEntryCount,,,,");
  for (const r of overview) {
    lines.push(
      [
        "USER",
        csvEscapeCell(r.uid),
        csvEscapeCell(r.email),
        csvEscapeCell(r.firstName),
        String(r.age),
        String(r.weightKg),
        String(r.goalWeightKg),
        String(r.dictCount),
        String(r.journalDayCount),
        String(r.journalEntryCount),
        "",
        "",
        "",
        "",
      ].join(","),
    );
  }
  lines.push("section,uid,userEmail,dateKey,food,calories,quantity,unit,,,,,");
  for (const r of logs) {
    lines.push(
      [
        "LOG",
        csvEscapeCell(r.uid),
        csvEscapeCell(r.userEmail),
        csvEscapeCell(r.dateKey),
        csvEscapeCell(r.food),
        String(r.calories),
        String(r.quantity),
        csvEscapeCell(r.unit),
        "",
        "",
        "",
        "",
        "",
      ].join(","),
    );
  }
  lines.push("section,uid,userEmail,food,source,lastCalories,,,,,,,");
  for (const r of dictRows) {
    lines.push(
      [
        "DICT",
        csvEscapeCell(r.uid),
        csvEscapeCell(r.userEmail),
        csvEscapeCell(r.food),
        csvEscapeCell(r.source ?? ""),
        r.lastCalories != null ? String(r.lastCalories) : "",
        "",
        "",
        "",
        "",
        "",
        "",
      ].join(","),
    );
  }
  lines.push(
    "section,uid,userEmail,presetId,presetName,presetCreatedAt,componentFood,quantity,unit,calories,proteinG,carbsG,fatG,,",
  );
  for (const r of recipeRows) {
    lines.push(
      [
        "RECIPE",
        csvEscapeCell(r.uid),
        csvEscapeCell(r.userEmail),
        csvEscapeCell(r.presetId),
        csvEscapeCell(r.presetName),
        csvEscapeCell(r.presetCreatedAt),
        csvEscapeCell(r.componentFood),
        String(r.quantity),
        csvEscapeCell(r.unit),
        String(r.calories),
        String(r.proteinG),
        String(r.carbsG),
        String(r.fatG),
        "",
        "",
      ].join(","),
    );
  }
  return bom(lines.join("\n") + "\n");
}
