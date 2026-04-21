"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    return (
      <p className="h-5 text-xs font-medium text-[var(--text)]/75" dir="rtl">
        …
      </p>
    );
  }

  const dateLong = now.toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const dateShort = now.toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = now.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      dir="rtl"
    >
      <p className="hidden text-xs font-medium text-[var(--text)]/80 md:block md:text-sm">
        {dateLong}
      </p>
      <p className="text-xs font-medium leading-tight text-[var(--text)]/80 md:hidden">
        {dateShort}
      </p>
      <p className="mt-0.5 font-mono text-sm font-bold tracking-wide text-[var(--cherry)] md:mt-1 md:text-base">
        {time}
      </p>
    </motion.div>
  );
}
