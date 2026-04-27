"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { LogEntry, UserProfile, WeightEntry, DictionaryItem, MealPreset } from "@/lib/storage";

type CloudEnvelope<T> = {
  updatedAt: string;
  data: T;
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function saveUserProfileToCloud(uid: string, profile: UserProfile): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db) return false;
  const ref = doc(db, `users/${uid}/app/profile`);
  await setDoc(ref, { updatedAt: nowIso(), data: profile } satisfies CloudEnvelope<UserProfile>, { merge: true });
  return true;
}

export async function loadUserProfileFromCloud(uid: string): Promise<UserProfile | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;
  const ref = doc(db, `users/${uid}/app/profile`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const env = snap.data() as CloudEnvelope<UserProfile>;
  return env?.data ?? null;
}

export async function saveDayLogToCloud(uid: string, dateKey: string, entries: LogEntry[]): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db) return false;
  const ref = doc(db, `users/${uid}/dayLogs/${dateKey}`);
  await setDoc(ref, { updatedAt: nowIso(), dateKey, entries }, { merge: true });
  return true;
}

export async function loadRecentDayLogsFromCloud(
  uid: string,
  maxDays: number
): Promise<Record<string, LogEntry[]>> {
  const db = getFirebaseFirestore();
  if (!db) return {};
  const c = collection(db, `users/${uid}/dayLogs`);
  const q = query(c, orderBy("dateKey", "desc"), limit(Math.max(1, Math.min(366, Math.floor(maxDays) || 30))));
  const snap = await getDocs(q);
  const out: Record<string, LogEntry[]> = {};
  for (const d of snap.docs) {
    const data = d.data() as DocumentData;
    const k = typeof data?.dateKey === "string" ? data.dateKey : d.id;
    const entries = Array.isArray(data?.entries) ? (data.entries as LogEntry[]) : [];
    if (k) out[k] = entries;
  }
  return out;
}

export async function saveWeightsToCloud(uid: string, entries: WeightEntry[]): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db) return false;
  const ref = doc(db, `users/${uid}/app/weights`);
  await setDoc(ref, { updatedAt: nowIso(), data: entries } satisfies CloudEnvelope<WeightEntry[]>, { merge: true });
  return true;
}

export async function loadWeightsFromCloud(uid: string): Promise<WeightEntry[] | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;
  const ref = doc(db, `users/${uid}/app/weights`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const env = snap.data() as CloudEnvelope<WeightEntry[]>;
  return Array.isArray(env?.data) ? env.data : null;
}

export async function saveDictionaryToCloud(uid: string, items: DictionaryItem[]): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db) return false;
  const ref = doc(db, `users/${uid}/app/dictionary`);
  await setDoc(ref, { updatedAt: nowIso(), data: items } satisfies CloudEnvelope<DictionaryItem[]>, { merge: true });
  return true;
}

export async function loadDictionaryFromCloud(uid: string): Promise<DictionaryItem[] | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;
  const ref = doc(db, `users/${uid}/app/dictionary`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const env = snap.data() as CloudEnvelope<DictionaryItem[]>;
  return Array.isArray(env?.data) ? env.data : null;
}

export async function saveMealPresetsToCloud(uid: string, items: MealPreset[]): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db) return false;
  const ref = doc(db, `users/${uid}/app/mealPresets`);
  await setDoc(ref, { updatedAt: nowIso(), data: items } satisfies CloudEnvelope<MealPreset[]>, { merge: true });
  return true;
}

export async function loadMealPresetsFromCloud(uid: string): Promise<MealPreset[] | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;
  const ref = doc(db, `users/${uid}/app/mealPresets`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const env = snap.data() as CloudEnvelope<MealPreset[]>;
  return Array.isArray(env?.data) ? env.data : null;
}

