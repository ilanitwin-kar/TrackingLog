import { Suspense } from "react";
import { HomeClient } from "@/components/HomeClient";

function HomeFallback() {
  return (
    <div className="p-8 text-center text-lg text-[var(--cherry)]" dir="rtl">
      טוען…
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeClient />
    </Suspense>
  );
}
