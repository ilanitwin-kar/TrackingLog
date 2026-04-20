import { Suspense } from "react";
import { AssistantClient } from "@/components/AssistantClient";

function Fallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-[var(--text)]" dir="rtl">
      טוען…
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AssistantClient />
    </Suspense>
  );
}

