import { Suspense } from "react";
import { AddFoodSearchClient } from "@/components/AddFoodSearchClient";

function AddFoodFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-[var(--text)]" dir="rtl">
      טוען…
    </div>
  );
}

export default function AddFoodPage() {
  return (
    <Suspense fallback={<AddFoodFallback />}>
      <AddFoodSearchClient />
    </Suspense>
  );
}
