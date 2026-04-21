"use client";

import { get, ref, set, update } from "firebase/database";
import { getFirebaseAuth, getFirebaseRtdb } from "@/lib/firebase";

export type AssistantMemory = {
  updatedAt?: string;
  tone?: "cheerful" | "direct" | "gentle";
  likes?: string[];
  dislikes?: string[];
  notes?: string;
  /** ברירות מחדל לדיוק תזונתי כדי לא לשאול שוב על אותם דברים */
  nutritionDefaults?: {
    cheese?: string; // e.g. "קוטג׳ 5%"
    yogurt?: string; // e.g. "יוגורט טבעי 3%"
    bread?: string; // e.g. "לחם מלא"
  };
};

export async function ensureAnonAuth(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  // Lazy import to keep bundle smaller where not used.
  const { signInAnonymously } = await import("firebase/auth");
  const res = await signInAnonymously(auth);
  return res.user.uid;
}

export async function getAnonUid(): Promise<string | null> {
  return ensureAnonAuth();
}

export async function loadAssistantMemory(): Promise<AssistantMemory | null> {
  const db = getFirebaseRtdb();
  if (!db) return null;
  const uid = await ensureAnonAuth();
  if (!uid) return null;
  const r = ref(db, `users/${uid}/memory/assistant`);
  const snap = await get(r);
  if (!snap.exists()) return null;
  return snap.val() as AssistantMemory;
}

export async function saveAssistantMemory(patch: Partial<AssistantMemory>): Promise<void> {
  const db = getFirebaseRtdb();
  if (!db) return;
  const uid = await ensureAnonAuth();
  if (!uid) return;
  const base = `users/${uid}/memory/assistant`;
  const r = ref(db, base);
  const data = { ...patch, updatedAt: new Date().toISOString() };
  // Use update to merge patch.
  try {
    await update(r, data);
  } catch {
    // If node doesn't exist yet, set it.
    await set(r, data);
  }
}

