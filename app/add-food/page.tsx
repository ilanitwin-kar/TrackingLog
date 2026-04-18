import { Suspense } from "react";
import { AddFoodClient } from "@/components/AddFoodClient";

function AddFoodFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-[#333333]" dir="rtl">
      טוען…
    </div>
  );
}

export default function AddFoodPage() {
  return (
    <Suspense fallback={<AddFoodFallback />}>
      <AddFoodClient />
    </Suspense>
  );
}
