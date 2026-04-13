"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

type Particle = {
  id: number;
  x: number;
  y: number;
  delay: number;
  hue: number;
  size: number;
  dx: number;
  dy: number;
};

type ConfettiPiece = {
  id: number;
  x: number;
  delay: number;
  w: number;
  h: number;
  rot: number;
  hue: number;
  fall: number;
};

/** חגיגת קונפטי + זריקות — נשען על הורה עם `.celebration` / `.fade-out` לזמן ול-fade */
export function CelebrationConfetti({ message }: { message?: string }) {
  const particles = useMemo(() => {
    const list: Particle[] = [];
    for (let i = 0; i < 72; i++) {
      const angle = (Math.PI * 2 * i) / 72 + Math.random() * 0.5;
      const speed = 140 + Math.random() * 200;
      list.push({
        id: i,
        x: 48 + (Math.random() - 0.5) * 28,
        y: 38 + (Math.random() - 0.5) * 16,
        delay: Math.random() * 0.2,
        hue: 320 + Math.random() * 45,
        size: 3 + Math.random() * 7,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
      });
    }
    return list;
  }, []);

  const confetti = useMemo(() => {
    const list: ConfettiPiece[] = [];
    for (let i = 0; i < 90; i++) {
      list.push({
        id: i + 1000,
        x: Math.random() * 100,
        delay: Math.random() * 0.4,
        w: 6 + Math.random() * 10,
        h: 10 + Math.random() * 14,
        rot: Math.random() * 360,
        hue: 300 + Math.random() * 55,
        fall: 420 + Math.random() * 280,
      });
    }
    return list;
  }, []);

  return (
    <>
      <div className="absolute inset-0 bg-white/80 backdrop-blur-[3px]" aria-hidden />
      <div className="pointer-events-none absolute inset-0">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background: `hsl(${p.hue} 75% 72%)`,
              boxShadow: `0 0 ${p.size * 2}px hsl(${p.hue} 85% 78%)`,
            }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
              scale: [0, 1.15, 0.55],
              x: p.dx,
              y: p.dy,
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 1.45,
              delay: p.delay,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
        {confetti.map((c) => (
          <motion.span
            key={c.id}
            className="absolute rounded-sm"
            style={{
              left: `${c.x}%`,
              top: `-8%`,
              width: c.w,
              height: c.h,
              background: `hsl(${c.hue} 70% 70%)`,
              rotate: c.rot,
            }}
            initial={{ y: "0vh", opacity: 1, rotate: c.rot }}
            animate={{
              y: [`0vh`, `${c.fall}px`],
              opacity: [1, 1, 0.9],
              rotate: c.rot + 720,
            }}
            transition={{
              duration: 2.8,
              delay: c.delay,
              ease: "linear",
            }}
          />
        ))}
      </div>
      {message && (
        <motion.div
          className="message relative z-[1] max-w-[min(92vw,28rem)] text-center text-[#333333]"
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            y: [0, -10, 0],
          }}
          transition={{
            scale: { type: "spring", stiffness: 300, damping: 22 },
            opacity: { duration: 0.2 },
            y: {
              duration: 0.45,
              repeat: 6,
              repeatType: "loop",
              ease: "easeInOut",
            },
          }}
        >
          {message}
        </motion.div>
      )}
    </>
  );
}
