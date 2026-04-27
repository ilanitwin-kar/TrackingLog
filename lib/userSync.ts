"use client";

import {
  loadDayLogs,
  loadDictionary,
  loadMealPresets,
  loadProfile,
  loadWeights,
} from "@/lib/storage";
import {
  saveDayLogToCloud,
  saveDictionaryToCloud,
  saveMealPresetsToCloud,
  saveUserProfileToCloud,
  saveWeightsToCloud,
} from "@/lib/userCloud";

/**
 * Best-effort: upload local state to Firestore after login.
 * This covers cases where the user creates data before Firebase auth is fully ready.
 */
export async function syncLocalToCloud(uid: string): Promise<void> {
  const profile = loadProfile();
  await saveUserProfileToCloud(uid, profile);

  const [weights, dict, presets] = [loadWeights(), loadDictionary(), loadMealPresets()];
  await Promise.all([
    saveWeightsToCloud(uid, weights),
    saveDictionaryToCloud(uid, dict),
    saveMealPresetsToCloud(uid, presets),
  ]);

  const logs = loadDayLogs();
  const keys = Object.keys(logs).sort().slice(-90); // last ~3 months
  for (const k of keys) {
    const entries = logs[k];
    if (!Array.isArray(entries)) continue;
    await saveDayLogToCloud(uid, k, entries);
  }
}

