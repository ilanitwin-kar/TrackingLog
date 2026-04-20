"use client";

import { get, ref, set } from "firebase/database";
import { ensureAnonAuth } from "@/lib/cloudMemory";
import { getFirebaseRtdb } from "@/lib/firebase";

const LOCAL_KEY = "cj_exercise_activity_v1";

/** דיווח הליכה לקיזוז חריגה — נשמר ב-RTDB תחת exerciseActivity */
export type ExerciseActivityDay = {
  reportedSteps: number;
  updatedAt: string;
};

function readLocalMap(): Record<string, ExerciseActivityDay> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, ExerciseActivityDay>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

/** קריאה סינכרונית (למשל ל-snapshot של העוזר לפני סנכרון ענן) */
export function loadExerciseActivityDaySync(
  dateKey: string
): ExerciseActivityDay | null {
  const map = readLocalMap();
  return map[dateKey] ?? null;
}

function writeLocal(dateKey: string, data: ExerciseActivityDay) {
  if (typeof window === "undefined") return;
  const map = readLocalMap();
  map[dateKey] = data;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
}

export async function saveExerciseActivityDay(
  dateKey: string,
  reportedSteps: number
): Promise<void> {
  const steps = Math.max(0, Math.round(reportedSteps));
  const payload: ExerciseActivityDay = {
    reportedSteps: steps,
    updatedAt: new Date().toISOString(),
  };
  writeLocal(dateKey, payload);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cj-exercise-activity-updated"));
    window.dispatchEvent(new Event("cj-profile-updated"));
  }

  const db = getFirebaseRtdb();
  if (!db) return;
  const uid = await ensureAnonAuth();
  if (!uid) return;
  await set(
    ref(db, `users/${uid}/exerciseActivity/${dateKey}`),
    payload
  );
}

export async function loadExerciseActivityDay(
  dateKey: string
): Promise<ExerciseActivityDay | null> {
  const db = getFirebaseRtdb();
  if (db) {
    try {
      const uid = await ensureAnonAuth();
      if (uid) {
        const snap = await get(
          ref(db, `users/${uid}/exerciseActivity/${dateKey}`)
        );
        if (snap.exists()) {
          const v = snap.val() as Partial<ExerciseActivityDay>;
          if (v && typeof v.reportedSteps === "number") {
            const row: ExerciseActivityDay = {
              reportedSteps: Math.max(0, Math.round(v.reportedSteps)),
              updatedAt:
                typeof v.updatedAt === "string"
                  ? v.updatedAt
                  : new Date().toISOString(),
            };
            writeLocal(dateKey, row);
            return row;
          }
        }
      }
    } catch {
      /* fallback local */
    }
  }
  const map = readLocalMap();
  return map[dateKey] ?? null;
}
