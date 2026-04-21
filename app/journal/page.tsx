import { Suspense } from "react";
import { HomeClient } from "@/components/HomeClient";

function JournalFallback() {
  return (
    <div className="p-8 text-center text-lg text-[var(--cherry)]" dir="rtl">
      טוען…
    </div>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={<JournalFallback />}>
      {/* Reuse HomeClient with journal-only view */}
      <HomeClient mode="journal" />
    </Suspense>
  );
}

