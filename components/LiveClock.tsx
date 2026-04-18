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
      <p className="h-5 text-xs font-medium text-[#333333]/75" dir="rtl">
        …
      </p>
    );
  }

  const date = now.toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
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
      <p className="text-xs font-medium text-[#333333]/80 md:text-sm">{date}</p>
      <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-[var(--cherry)] md:text-base">
        {time}
      </p>
    </motion.div>
  );
}
