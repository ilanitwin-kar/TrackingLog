import { Suspense } from "react";
import { AddFoodClient } from "@/components/AddFoodClient";

function AddFoodAiFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-[var(--text)]" dir="rtl">
      טוען…
    </div>
  );
}

export default function AddFoodAiPage() {
  return (
    <Suspense fallback={<AddFoodAiFallback />}>
      <AddFoodClient screen="ai" />
    </Suspense>
  );
}

