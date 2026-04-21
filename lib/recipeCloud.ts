import { collection, doc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";
import { ensureAnonAuth } from "@/lib/cloudMemory";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { SavedRecipe } from "@/lib/recipeStorage";

export async function saveRecipeToCloud(recipe: SavedRecipe): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db) return false;
  const uid = await ensureAnonAuth();
  if (!uid) return false;
  const ref = doc(db, `users/${uid}/recipes/${recipe.id}`);
  await setDoc(ref, recipe, { merge: true });
  return true;
}

export async function loadRecipesFromCloud(): Promise<SavedRecipe[]> {
  const db = getFirebaseFirestore();
  if (!db) return [];
  const uid = await ensureAnonAuth();
  if (!uid) return [];
  const c = collection(db, `users/${uid}/recipes`);
  const q = query(c, orderBy("createdAt", "desc"), limit(80));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as SavedRecipe);
}

